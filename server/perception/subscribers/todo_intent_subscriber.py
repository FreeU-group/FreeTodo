from __future__ import annotations

import asyncio
from collections import deque
from contextlib import suppress
from typing import TYPE_CHECKING
from uuid import uuid4

from perception.models import SourceType
from schemas.perception_todo_intent import (
    TodoIntentProcessingRecord,
    TodoIntentProcessingStatus,
    TodoIntentSubscriberStatusResponse,
)
from util.logging_config import get_logger
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from perception.models import PerceptionEvent
    from services.perception_todo_intent.orchestrator import TodoIntentOrchestrator

logger = get_logger()


class TodoIntentSubscriber:
    """Subscriber for L1 deduped stream (or raw PerceptionStream as fallback).

    Receives PerceptionEvents, batches them within an aggregation window,
    and dispatches to the TodoIntentOrchestrator worker pool.
    """

    @staticmethod
    def _modality_sort_key(modality: str) -> int:
        order = {
            "audio": 0,
            "image": 1,
            "text": 2,
        }
        return order.get(modality, 99)

    def __init__(  # noqa: PLR0913
        self,
        *,
        orchestrator: TodoIntentOrchestrator,
        queue_maxsize: int = 200,
        max_recent_records: int = 200,
        aggregation_window_seconds: float = 0.0,
        max_context_chars: int = 5000,
        processing_workers: int = 2,
        processing_queue_maxsize: int | None = None,
        enabled: bool = True,
    ):
        self._orchestrator = orchestrator
        self._enabled = bool(enabled)
        self._aggregation_window_seconds = max(0.0, float(aggregation_window_seconds))
        self._max_context_chars = max(1, int(max_context_chars))
        self._processing_workers = max(1, int(processing_workers))

        resolved_processing_queue_maxsize = (
            queue_maxsize if processing_queue_maxsize is None else processing_queue_maxsize
        )
        self._event_queue: asyncio.Queue[PerceptionEvent] = asyncio.Queue(
            maxsize=max(1, int(queue_maxsize))
        )
        self._context_queue: asyncio.Queue[list[PerceptionEvent]] = asyncio.Queue(
            maxsize=max(1, int(resolved_processing_queue_maxsize))
        )
        self._recent_records: deque[TodoIntentProcessingRecord] = deque(
            maxlen=max(1, int(max_recent_records))
        )
        self._record_subscribers: list[Callable[[TodoIntentProcessingRecord], Awaitable[None]]] = []
        self._batcher_task: asyncio.Task[None] | None = None
        self._worker_tasks: list[asyncio.Task[None]] = []
        self._next_batch_seed: PerceptionEvent | None = None
        self._active_worker_ids: set[int] = set()
        self._enqueued_total = 0
        self._dropped_total = 0
        self._contexts_enqueued_total = 0
        self._contexts_dropped_total = 0
        self._processed_total = 0
        self._failed_total = 0

    async def start(self, stream, *, deduper=None) -> None:
        """Start the subscriber.

        If *deduper* is provided (a ``MemoryDeduper`` instance), subscribe to
        the L1 deduped stream instead of the raw PerceptionStream.  This avoids
        processing duplicate events that have already been filtered out by the
        Memory deduplication layer.

        Falls back to subscribing to *stream* directly when no deduper is given.

        Always starts the subscription and background tasks regardless of
        ``_enabled``.  The flag only gates event processing in ``on_event``,
        allowing runtime toggle via ``set_enabled`` without restart.
        """
        if self._batcher_task is not None and not self._batcher_task.done():
            return

        self._event_source = deduper if deduper is not None else stream
        self._event_source.subscribe(self.on_event)

        source_label = "MemoryDeduper L1" if deduper is not None else "PerceptionStream"
        self._batcher_task = asyncio.create_task(self._batcher_loop())
        self._worker_tasks = [
            asyncio.create_task(self._worker_loop(worker_id=index + 1))
            for index in range(self._processing_workers)
        ]
        logger.info(
            f"TodoIntentSubscriber started (source={source_label}): "
            f"event_queue_maxsize={self._event_queue.maxsize} context_queue_maxsize={self._context_queue.maxsize} "
            f"aggregation_window_seconds={self._aggregation_window_seconds:.1f} max_context_chars={self._max_context_chars} "
            f"processing_workers={self._processing_workers}"
        )

    async def stop(self, stream=None) -> None:
        source = getattr(self, "_event_source", stream)
        if source is not None:
            source.unsubscribe(self.on_event)
        self._event_source = None
        tasks: list[asyncio.Task[None]] = []
        if self._batcher_task is not None:
            tasks.append(self._batcher_task)
        tasks.extend(self._worker_tasks)
        self._batcher_task = None
        self._worker_tasks = []
        if not tasks:
            return
        for task in tasks:
            task.cancel()
        for task in tasks:
            with suppress(asyncio.CancelledError):
                await task

    def set_enabled(self, enabled: bool) -> None:
        """Toggle the subscriber on/off at runtime without restarting."""
        self._enabled = bool(enabled)
        logger.info(f"TodoIntentSubscriber enabled={self._enabled}")

    async def on_event(self, event: PerceptionEvent) -> None:
        if not self._enabled:
            return
        if event.source in (SourceType.AI_OUTPUT, SourceType.APP_SWITCH, SourceType.GPS_MOBILE):
            return
        if event.source == SourceType.USER_INPUT:
            meta = event.metadata if isinstance(event.metadata, dict) else {}
            if meta.get("source") == "chat":
                return
        text = (event.content_text or "").strip()
        if not text:
            return
        logger.info(
            "[TodoIntent] 收到感知事件: id=%s source=%s modality=%s len=%d preview=%.60s",
            event.event_id[:12],
            event.source.value,
            event.modality.value,
            len(text),
            text,
        )
        try:
            self._event_queue.put_nowait(event)
            self._enqueued_total += 1
        except asyncio.QueueFull:
            self._dropped_total += 1
            logger.warning(
                "[TodoIntent] 事件队列已满，丢弃事件 %s (dropped_total=%d)",
                event.event_id[:12],
                self._dropped_total,
            )

    def subscribe_records(
        self,
        callback: Callable[[TodoIntentProcessingRecord], Awaitable[None]],
    ) -> None:
        if callback not in self._record_subscribers:
            self._record_subscribers.append(callback)

    def unsubscribe_records(
        self,
        callback: Callable[[TodoIntentProcessingRecord], Awaitable[None]],
    ) -> None:
        self._record_subscribers = [cb for cb in self._record_subscribers if cb is not callback]

    def get_recent_records(self, count: int = 50) -> list[TodoIntentProcessingRecord]:
        safe_count = max(1, int(count))
        return list(self._recent_records)[-safe_count:]

    async def _publish_record(self, record: TodoIntentProcessingRecord) -> None:
        self._recent_records.append(record)
        subscribers = list(self._record_subscribers)
        if not subscribers:
            return
        await asyncio.gather(*(cb(record) for cb in subscribers), return_exceptions=True)

    @staticmethod
    def _normalize_text_for_dedupe(text: str) -> str:
        return " ".join((text or "").strip().lower().split())

    @staticmethod
    def _event_order_key(event: PerceptionEvent) -> tuple[int, str, str]:
        return (
            int(event.sequence_id),
            event.timestamp.isoformat(),
            event.event_id,
        )

    @staticmethod
    def _is_duplicate_or_contained(candidate: str, existing: str) -> bool:
        if candidate == existing:
            return True
        return candidate in existing or existing in candidate

    @staticmethod
    def _dedupe_events_within_batch(events: list[PerceptionEvent]) -> list[PerceptionEvent]:
        bucketed: dict[str, list[tuple[PerceptionEvent, str]]] = {}

        for event in events:
            text = TodoIntentSubscriber._normalize_text_for_dedupe(event.content_text or "")
            if not text:
                continue

            # Deduplicate only within the same modality bucket.
            bucket_key = event.modality.value
            bucket = bucketed.setdefault(bucket_key, [])
            matched_idx: int | None = None

            for idx, (kept_event, kept_text) in enumerate(bucket):
                if TodoIntentSubscriber._is_duplicate_or_contained(text, kept_text):
                    matched_idx = idx
                    # Keep the latest event version when duplicate/contained.
                    if TodoIntentSubscriber._event_order_key(event) >= (
                        TodoIntentSubscriber._event_order_key(kept_event)
                    ):
                        bucket[idx] = (event, text)
                    break

            if matched_idx is None:
                bucket.append((event, text))

        deduped = [event for items in bucketed.values() for event, _ in items]
        deduped.sort(key=TodoIntentSubscriber._event_order_key)
        return deduped

    @staticmethod
    def _event_char_count(event: PerceptionEvent) -> int:
        return len((event.content_text or "").strip())

    async def _collect_batch(
        self,
        first_event: PerceptionEvent,
    ) -> tuple[list[PerceptionEvent], PerceptionEvent | None]:
        if self._aggregation_window_seconds <= 0:
            return [first_event], None

        loop = asyncio.get_running_loop()
        started_at = loop.time()
        batch = [first_event]
        current_chars = self._event_char_count(first_event)
        next_batch_seed: PerceptionEvent | None = None

        while True:
            elapsed = loop.time() - started_at
            remaining = self._aggregation_window_seconds - elapsed
            if remaining <= 0:
                break

            try:
                event = await asyncio.wait_for(self._event_queue.get(), timeout=remaining)
            except TimeoutError:
                break
            event_chars = self._event_char_count(event)
            if batch and current_chars + event_chars > self._max_context_chars:
                # Keep the overflow event as the first event in the next batch.
                next_batch_seed = event
                break
            batch.append(event)
            current_chars += event_chars

        deduped_batch = self._dedupe_events_within_batch(batch)
        return deduped_batch or [first_event], next_batch_seed

    def _enqueue_batch(self, batch: list[PerceptionEvent]) -> None:
        sources = {e.source.value for e in batch}
        total_chars = sum(len((e.content_text or "").strip()) for e in batch)
        logger.info(
            "[TodoIntent] 批次聚合完成: events=%d sources=%s total_chars=%d → 送入处理队列",
            len(batch),
            sources,
            total_chars,
        )
        try:
            self._context_queue.put_nowait(batch)
            self._contexts_enqueued_total += 1
        except asyncio.QueueFull:
            self._contexts_dropped_total += 1
            self._dropped_total += len(batch)
            logger.warning(
                "[TodoIntent] 处理队列已满，丢弃批次 (size=%d, contexts_dropped=%d)",
                len(batch),
                self._contexts_dropped_total,
            )

    @staticmethod
    def _resolve_error_code(exc: Exception) -> str:
        message = " ".join(str(exc).strip().split())
        if message:
            return message[:120]
        return f"orchestrator_{exc.__class__.__name__.lower()}"

    @staticmethod
    def _build_failed_record(
        events: list[PerceptionEvent],
        *,
        error_code: str = "orchestrator_error",
    ) -> TodoIntentProcessingRecord:
        ordered = list(events)
        first_event = ordered[0]
        event_ids = [event.event_id for event in ordered]
        source_set: list = []
        seen_sources = set()
        for event in ordered:
            if event.source in seen_sources:
                continue
            seen_sources.add(event.source)
            source_set.append(event.source)
        merged_text = "\n".join(
            (event.content_text or "").strip()
            for event in ordered
            if (event.content_text or "").strip()
        )
        time_window_start = min(event.timestamp for event in ordered)
        time_window_end = max(event.timestamp for event in ordered)
        metadata = dict(ordered[-1].metadata or {})
        metadata["batch_size"] = len(ordered)
        event_refs = [
            {
                "event_id": event.event_id,
                "source": event.source.value,
                "modality": event.modality.value,
                "sequence_id": int(event.sequence_id),
                "timestamp": event.timestamp.isoformat(),
            }
            for event in ordered
        ]
        event_refs.sort(
            key=lambda item: (
                TodoIntentSubscriber._modality_sort_key(str(item.get("modality", ""))),
                int(item.get("sequence_id", 0)),
                str(item.get("timestamp", "")),
                str(item.get("event_id", "")),
            )
        )
        metadata["event_refs"] = event_refs

        return TodoIntentProcessingRecord(
            record_id=f"tir_{uuid4().hex}",
            context_id=f"ctx_err_{uuid4().hex}",
            status=TodoIntentProcessingStatus.FAILED,
            created_at=get_utc_now(),
            event_ids=event_ids,
            source_set=source_set,
            merged_text=merged_text or (first_event.content_text or "").strip(),
            time_window_start=time_window_start,
            time_window_end=time_window_end,
            metadata=metadata,
            error=error_code,
        )

    async def _batcher_loop(self) -> None:
        while True:
            if self._next_batch_seed is not None:
                event = self._next_batch_seed
                self._next_batch_seed = None
            else:
                event = await self._event_queue.get()
            batch, next_batch_seed = await self._collect_batch(event)
            self._next_batch_seed = next_batch_seed
            self._enqueue_batch(batch)

    def _make_progress_callback(self):
        """Create a callback that publishes record updates to WebSocket subscribers."""

        async def _on_progress(record):
            await self._publish_record(record)

        return _on_progress

    async def _worker_loop(self, *, worker_id: int) -> None:
        on_progress = self._make_progress_callback()
        while True:
            batch = await self._context_queue.get()
            event = batch[0]
            self._active_worker_ids.add(worker_id)
            try:
                if len(batch) == 1:
                    record = await self._orchestrator.process_event(
                        batch[0],
                        on_progress=on_progress,
                    )
                else:
                    context = self._orchestrator.build_context_from_events(batch)
                    record = await self._orchestrator.process_context(
                        context,
                        on_progress=on_progress,
                    )
                await self._publish_record(record)
                self._processed_total += len(batch)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self._failed_total += len(batch)
                fallback = self._build_failed_record(
                    batch,
                    error_code=self._resolve_error_code(exc),
                )
                await self._publish_record(fallback)
                logger.exception(
                    "TodoIntentSubscriber worker-"
                    f"{worker_id} failed for event={event.event_id} batch_size={len(batch)}"
                )
            finally:
                self._active_worker_ids.discard(worker_id)

    def get_status(self) -> TodoIntentSubscriberStatusResponse:
        running_workers = sum(1 for task in self._worker_tasks if not task.done())
        active_worker_ids = sorted(self._active_worker_ids)
        return TodoIntentSubscriberStatusResponse(
            enabled=self._enabled,
            running=(
                self._batcher_task is not None
                and not self._batcher_task.done()
                and running_workers > 0
            ),
            queue_size=self._event_queue.qsize(),
            queue_maxsize=self._event_queue.maxsize,
            enqueued_total=self._enqueued_total,
            dropped_total=self._dropped_total,
            processing_workers=self._processing_workers,
            running_workers=running_workers,
            active_workers=len(active_worker_ids),
            active_worker_ids=active_worker_ids,
            context_queue_size=self._context_queue.qsize(),
            context_queue_maxsize=self._context_queue.maxsize,
            contexts_enqueued_total=self._contexts_enqueued_total,
            contexts_dropped_total=self._contexts_dropped_total,
            processed_total=self._processed_total,
            failed_total=self._failed_total,
            orchestrator=self._orchestrator.get_stats(),
        )
