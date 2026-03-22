from __future__ import annotations

import asyncio
import threading
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from perception.adapters.ai_output_adapter import AIOutputAdapter
from perception.adapters.audio_adapter import AudioAdapter
from perception.adapters.input_adapter import InputAdapter
from perception.adapters.ocr_adapter import OCRAdapter
from perception.models import SourceType
from perception.stream import PerceptionStream
from perception.subscribers.todo_intent_subscriber import TodoIntentSubscriber
from services.perception_todo_intent.orchestrator import TodoIntentOrchestrator
from util.logging_config import get_logger
from util.settings import settings
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from perception.models import PerceptionEvent

logger = get_logger()


class PerceptionStreamManager:
    """Manage a PerceptionStream instance and its enabled adapters."""

    def __init__(self, config: dict | None = None):
        config = dict(config or {})
        self.stream = PerceptionStream(
            window_seconds=int(config.get("window_seconds", 300)),
            max_pending_events=int(config.get("max_pending_events", 1000)),
        )
        self._config = config
        self._adapters: dict[str, object] = {}
        self._status_online_window_seconds = max(
            1, int(config.get("status_online_window_seconds", 60))
        )
        todo_intent_config = config.get("todo_intent", {}) if isinstance(config, dict) else {}
        self._todo_intent_config = (
            dict(todo_intent_config) if isinstance(todo_intent_config, dict) else {}
        )
        self._todo_intent_enabled = bool(self._todo_intent_config.get("enabled", True))
        self._todo_intent_subscriber: TodoIntentSubscriber | None = None
        self._enabled_sources = self._build_enabled_sources()
        self._status_lock = threading.Lock()
        self._last_seen: dict[SourceType, datetime] = {}
        self._loop: asyncio.AbstractEventLoop | None = None
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            self._loop = None

    async def start(self) -> None:
        await self.stream.start()

        if self._config.get("audio_enabled", True):
            source_str = str(self._config.get("audio_source", SourceType.MIC_PC.value))
            try:
                source = SourceType(source_str)
            except ValueError:
                source = SourceType.MIC_PC
            self._adapters["audio"] = AudioAdapter(self.publish_event, source=source)

        if self._config.get("ocr_enabled", False):
            self._adapters["ocr"] = OCRAdapter(self.publish_event)

        if self._config.get("input_enabled", False):
            self._adapters["input"] = InputAdapter(self.publish_event)

        if self._config.get("ai_output_enabled", True):
            self._adapters["ai_output"] = AIOutputAdapter(self.publish_event)

        await self._start_todo_intent_subscriber()

    async def stop(self) -> None:
        subscriber = self._todo_intent_subscriber
        self._todo_intent_subscriber = None
        if subscriber is not None:
            await subscriber.stop(self.stream)
        self._adapters.clear()
        await self.stream.stop()

    def is_ocr_enabled(self) -> bool:
        return isinstance(self._adapters.get("ocr"), OCRAdapter)

    def is_input_enabled(self) -> bool:
        return isinstance(self._adapters.get("input"), InputAdapter)

    def record_seen(self, source: SourceType) -> None:
        with self._status_lock:
            self._last_seen[source] = get_utc_now()

    async def publish_event(self, event: PerceptionEvent) -> None:
        self.record_seen(event.source)
        await self.stream.publish(event)

    def publish_event_threadsafe(self, event: PerceptionEvent) -> bool:
        loop = self._loop
        if loop is None or not loop.is_running():
            return False
        self.record_seen(event.source)
        asyncio.run_coroutine_threadsafe(self.stream.publish(event), loop)
        return True

    async def try_publish_audio_transcription(
        self,
        text: str,
        *,
        metadata: dict | None = None,
        source: SourceType | None = None,
    ) -> bool:
        """Best-effort publish for audio transcription events."""
        try:
            adapter = self.get_audio_adapter()
            if adapter is None:
                return False
            event = adapter.build_transcription_event(
                text,
                metadata=metadata,
                source=source,
            )
            if event is None:
                return False
            await self.publish_event(event)
            return True
        except Exception:
            return False

    async def try_publish_user_input(
        self,
        text: str,
        *,
        metadata: dict | None = None,
    ) -> bool:
        """Best-effort publish for user input events."""
        try:
            adapter = self.get_input_adapter()
            if adapter is None:
                return False
            event = adapter.build_user_input_event(text, metadata=metadata)
            if event is None:
                return False
            await self.publish_event(event)
            return True
        except Exception:
            return False

    async def try_publish_screen_ocr(
        self,
        text: str,
        *,
        content_raw: str,
        metadata: dict | None = None,
    ) -> bool:
        """Best-effort publish for screen OCR events."""
        try:
            adapter = self.get_ocr_adapter()
            if adapter is None:
                return False
            event = adapter.build_screen_ocr_event(
                text,
                content_raw=content_raw,
                metadata=metadata,
            )
            if event is None:
                return False
            await self.publish_event(event)
            return True
        except Exception:
            return False

    async def try_publish_proactive_ocr(
        self,
        text: str,
        *,
        content_raw: str | None = None,
        metadata: dict | None = None,
    ) -> bool:
        """Best-effort publish for proactive OCR events."""
        try:
            adapter = self.get_ocr_adapter()
            if adapter is None:
                return False
            event = adapter.build_proactive_ocr_event(
                text,
                content_raw=content_raw,
                metadata=metadata,
            )
            if event is None:
                return False
            await self.publish_event(event)
            return True
        except Exception:
            return False

    def try_publish_screen_ocr_threadsafe(
        self,
        text: str,
        *,
        content_raw: str,
        metadata: dict | None = None,
    ) -> bool:
        """Best-effort publish for screen OCR events from non-async contexts."""
        try:
            adapter = self.get_ocr_adapter()
            if adapter is None:
                return False
            event = adapter.build_screen_ocr_event(
                text,
                content_raw=content_raw,
                metadata=metadata,
            )
            if event is None:
                return False
            return self.publish_event_threadsafe(event)
        except Exception:
            return False

    def try_publish_proactive_ocr_threadsafe(
        self,
        text: str,
        *,
        content_raw: str | None = None,
        metadata: dict | None = None,
    ) -> bool:
        """Best-effort publish for proactive OCR events from non-async contexts."""
        try:
            adapter = self.get_ocr_adapter()
            if adapter is None:
                return False
            event = adapter.build_proactive_ocr_event(
                text,
                content_raw=content_raw,
                metadata=metadata,
            )
            if event is None:
                return False
            return self.publish_event_threadsafe(event)
        except Exception:
            return False

    def try_publish_audio_transcription_threadsafe(
        self,
        text: str,
        *,
        metadata: dict | None = None,
        source: SourceType | None = None,
    ) -> bool:
        """Best-effort publish for audio transcription events from non-async contexts."""
        try:
            adapter = self.get_audio_adapter()
            if adapter is None:
                return False
            event = adapter.build_transcription_event(
                text,
                metadata=metadata,
                source=source,
            )
            if event is None:
                return False
            return self.publish_event_threadsafe(event)
        except Exception:
            return False

    def try_publish_user_input_threadsafe(
        self,
        text: str,
        *,
        metadata: dict | None = None,
    ) -> bool:
        """Best-effort publish for user input events from non-async contexts."""
        try:
            adapter = self.get_input_adapter()
            if adapter is None:
                return False
            event = adapter.build_user_input_event(text, metadata=metadata)
            if event is None:
                return False
            return self.publish_event_threadsafe(event)
        except Exception:
            return False

    async def try_publish_ai_output(
        self,
        text: str,
        *,
        metadata: dict | None = None,
    ) -> bool:
        """Best-effort publish for AI output events."""
        try:
            adapter = self.get_ai_output_adapter()
            if adapter is None:
                return False
            event = adapter.build_ai_output_event(text, metadata=metadata)
            if event is None:
                return False
            await self.publish_event(event)
            return True
        except Exception:
            return False

    def try_publish_ai_output_threadsafe(
        self,
        text: str,
        *,
        metadata: dict | None = None,
    ) -> bool:
        """Best-effort publish for AI output events from non-async contexts."""
        try:
            adapter = self.get_ai_output_adapter()
            if adapter is None:
                return False
            event = adapter.build_ai_output_event(text, metadata=metadata)
            if event is None:
                return False
            return self.publish_event_threadsafe(event)
        except Exception:
            return False

    def get_status(self) -> dict[str, Any]:
        status = {
            st.value: {
                "enabled": self._enabled_sources.get(st, False),
                "online": False,
                "last_seen": None,
            }
            for st in SourceType
        }

        now = get_utc_now()
        with self._status_lock:
            last_seen = dict(self._last_seen)

        seen_window = timedelta(seconds=self._status_online_window_seconds)
        for st, when in last_seen.items():
            status_entry = status[st.value]
            status_entry["last_seen"] = when.isoformat()
            if now - when <= seen_window:
                status_entry["online"] = True

        status["_stream"] = self.stream.get_queue_stats()
        subscriber = self._todo_intent_subscriber
        if subscriber is not None:
            status["_todo_intent"] = subscriber.get_status().model_dump(mode="json")
        else:
            status["_todo_intent"] = {
                "enabled": self._todo_intent_enabled,
                "running": False,
            }
        return status

    def _build_enabled_sources(self) -> dict[SourceType, bool]:
        enabled_sources: dict[SourceType, bool] = dict.fromkeys(SourceType, False)

        if self._config.get("audio_enabled", True):
            enabled_sources[SourceType.MIC_PC] = True
            enabled_sources[SourceType.MIC_HARDWARE] = True
            source_str = str(self._config.get("audio_source", SourceType.MIC_PC.value))
            try:
                enabled_sources[SourceType(source_str)] = True
            except ValueError:
                enabled_sources[SourceType.MIC_PC] = True

        if self._config.get("ocr_enabled", False):
            enabled_sources[SourceType.OCR_SCREEN] = True
            enabled_sources[SourceType.OCR_PROACTIVE] = True

        if self._config.get("input_enabled", False):
            enabled_sources[SourceType.USER_INPUT] = True

        if self._config.get("ai_output_enabled", True):
            enabled_sources[SourceType.AI_OUTPUT] = True

        return enabled_sources

    def get_audio_adapter(self) -> AudioAdapter | None:
        adapter = self._adapters.get("audio")
        return adapter if isinstance(adapter, AudioAdapter) else None

    def get_input_adapter(self) -> InputAdapter | None:
        adapter = self._adapters.get("input")
        return adapter if isinstance(adapter, InputAdapter) else None

    def get_ocr_adapter(self) -> OCRAdapter | None:
        adapter = self._adapters.get("ocr")
        return adapter if isinstance(adapter, OCRAdapter) else None

    def get_ai_output_adapter(self) -> AIOutputAdapter | None:
        adapter = self._adapters.get("ai_output")
        return adapter if isinstance(adapter, AIOutputAdapter) else None

    def get_todo_intent_subscriber(self) -> TodoIntentSubscriber | None:
        return self._todo_intent_subscriber

    async def _start_todo_intent_subscriber(self) -> None:
        if not self._todo_intent_enabled:
            return
        if self._todo_intent_subscriber is not None:
            return

        queue_maxsize = max(1, int(self._todo_intent_config.get("internal_queue_maxsize", 200)))
        processing_workers = max(1, int(self._todo_intent_config.get("processing_workers", 2)))
        processing_queue_maxsize = self._todo_intent_config.get(
            "processing_queue_maxsize",
            queue_maxsize,
        )
        try:
            processing_queue_maxsize = int(processing_queue_maxsize)
        except (TypeError, ValueError):
            processing_queue_maxsize = queue_maxsize
        processing_queue_maxsize = max(1, processing_queue_maxsize)
        max_recent_records = max(1, int(self._todo_intent_config.get("max_recent_records", 200)))
        aggregation_window_seconds = self._todo_intent_config.get("window_seconds", 5)
        try:
            aggregation_window_seconds = float(aggregation_window_seconds)
        except (TypeError, ValueError):
            aggregation_window_seconds = 5.0
        max_context_chars = self._todo_intent_config.get("max_context_chars", 5000)
        try:
            max_context_chars = int(max_context_chars)
        except (TypeError, ValueError):
            max_context_chars = 5000
        max_context_chars = max(1, max_context_chars)
        auto_todo_enabled = bool(settings.get("jobs.auto_todo_detection.enabled", True))
        orchestrator = TodoIntentOrchestrator(config=self._todo_intent_config)
        subscriber = TodoIntentSubscriber(
            orchestrator=orchestrator,
            queue_maxsize=queue_maxsize,
            max_recent_records=max_recent_records,
            aggregation_window_seconds=aggregation_window_seconds,
            max_context_chars=max_context_chars,
            processing_workers=processing_workers,
            processing_queue_maxsize=processing_queue_maxsize,
            enabled=auto_todo_enabled,
        )

        deduper = self._resolve_memory_deduper()
        await subscriber.start(self.stream, deduper=deduper)
        self._todo_intent_subscriber = subscriber
        source_label = "L1 deduped stream" if deduper else "raw PerceptionStream"
        logger.info(f"Perception todo-intent subscriber initialized (source={source_label})")

    @staticmethod
    def _resolve_memory_deduper():
        """Try to obtain the MemoryDeduper for L1 subscription."""
        try:
            from memory.manager import try_get_memory_manager  # noqa: PLC0415

            mgr = try_get_memory_manager()
            if mgr is not None and mgr.deduper is not None:
                return mgr.deduper
        except Exception as exc:
            logger.debug(f"Unable to resolve memory deduper: {exc}")
        return None


_manager: PerceptionStreamManager | None = None


async def init_perception_manager(config: dict | None = None) -> PerceptionStreamManager:
    global _manager  # noqa: PLW0603
    if _manager is None:
        _manager = PerceptionStreamManager(config=config)
        await _manager.start()
    return _manager


async def shutdown_perception_manager() -> None:
    global _manager  # noqa: PLW0603
    if _manager is None:
        return
    await _manager.stop()
    _manager = None


def try_get_perception_manager() -> PerceptionStreamManager | None:
    return _manager


def get_perception_manager() -> PerceptionStreamManager:
    if _manager is None:
        raise RuntimeError(
            "PerceptionStreamManager is not initialized. Call init_perception_manager() at startup."
        )
    return _manager


def try_get_perception_stream() -> PerceptionStream | None:
    mgr = try_get_perception_manager()
    return mgr.stream if mgr is not None else None


def get_perception_stream() -> PerceptionStream:
    return get_perception_manager().stream
