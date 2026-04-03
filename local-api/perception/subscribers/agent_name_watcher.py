"""Agent Name Watcher — 独立于 TodoIntentSubscriber 的感知流订阅者。

当音频或画面事件中出现用户设置的 Agent 名称时，本 Worker 会：
1. 立即标记为「触发」
2. 开启一个聚合窗口（最多 5 个事件或 15 秒），收集周围上下文
3. 将聚合后的完整上下文交给 TodoIntentOrchestrator 进行深度分析

与现有 TodoIntentSubscriber 完全并行，互不干扰。
"""

from __future__ import annotations

import asyncio
import re
from collections import deque
from contextlib import suppress
from typing import TYPE_CHECKING
from uuid import uuid4

from schemas.perception_todo_intent import (
    TodoIntentProcessingRecord,
    TodoIntentProcessingStatus,
)
from util.logging_config import get_logger
from util.settings import settings
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from perception.models import PerceptionEvent
    from services.perception_todo_intent.orchestrator import TodoIntentOrchestrator

logger = get_logger()

MAX_WINDOW_EVENTS = 5
WINDOW_SECONDS = 15.0


class AgentNameWatcher:
    """Subscribes to the perception stream and triggers deep analysis
    whenever the configured agent name is mentioned."""

    def __init__(
        self,
        *,
        orchestrator: TodoIntentOrchestrator,
        max_window_events: int = MAX_WINDOW_EVENTS,
        window_seconds: float = WINDOW_SECONDS,
        queue_maxsize: int = 100,
    ):
        self._orchestrator = orchestrator
        self._max_window_events = max(1, int(max_window_events))
        self._window_seconds = max(0.1, float(window_seconds))
        self._event_queue: asyncio.Queue[PerceptionEvent] = asyncio.Queue(
            maxsize=max(1, int(queue_maxsize))
        )
        self._worker_task: asyncio.Task[None] | None = None
        self._event_source = None
        self._record_subscribers: list[Callable[[TodoIntentProcessingRecord], Awaitable[None]]] = []
        self._recent_records: deque[TodoIntentProcessingRecord] = deque(maxlen=100)

        self._triggered_total = 0
        self._analyzed_total = 0
        self._dropped_total = 0

    def _get_agent_name(self) -> str:
        name = settings.get("setup.agent_name", "") or ""
        return name.strip()

    def _matches_agent_name(self, text: str) -> bool:
        agent_name = self._get_agent_name()
        if not agent_name:
            return False
        return bool(re.search(re.escape(agent_name), text, re.IGNORECASE))

    async def start(self, stream, *, deduper=None) -> None:
        if self._worker_task is not None and not self._worker_task.done():
            return

        self._event_source = deduper if deduper is not None else stream
        self._event_source.subscribe(self.on_event)
        self._worker_task = asyncio.create_task(self._worker_loop())

        source_label = "MemoryDeduper L1" if deduper is not None else "PerceptionStream"
        logger.info(
            "AgentNameWatcher started (source=%s, window=%.1fs, max_events=%d)",
            source_label,
            self._window_seconds,
            self._max_window_events,
        )

    async def stop(self, stream=None) -> None:
        source = getattr(self, "_event_source", stream)
        if source is not None:
            source.unsubscribe(self.on_event)
        self._event_source = None

        task = self._worker_task
        self._worker_task = None
        if task is not None:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    async def on_event(self, event: PerceptionEvent) -> None:
        text = (event.content_text or "").strip()
        if not text:
            return
        try:
            self._event_queue.put_nowait(event)
        except asyncio.QueueFull:
            self._dropped_total += 1

    async def _worker_loop(self) -> None:
        while True:
            event = await self._event_queue.get()
            text = (event.content_text or "").strip()
            if not self._matches_agent_name(text):
                continue

            self._triggered_total += 1
            agent_name = self._get_agent_name()
            logger.info(
                "[AgentNameWatcher] 检测到 Agent 名称「%s」被提及: event=%s preview=%.80s",
                agent_name,
                event.event_id[:12],
                text,
            )

            batch = await self._collect_context_window(event)
            await self._analyze_batch(batch)

    async def _collect_context_window(
        self, trigger_event: PerceptionEvent
    ) -> list[PerceptionEvent]:
        """Collect up to max_window_events or window_seconds of follow-up context."""
        batch = [trigger_event]
        loop = asyncio.get_running_loop()
        started_at = loop.time()

        while len(batch) < self._max_window_events:
            elapsed = loop.time() - started_at
            remaining = self._window_seconds - elapsed
            if remaining <= 0:
                break
            try:
                event = await asyncio.wait_for(self._event_queue.get(), timeout=remaining)
                batch.append(event)
            except TimeoutError:
                break

        logger.info(
            "[AgentNameWatcher] 上下文窗口聚合完成: events=%d, elapsed=%.1fs",
            len(batch),
            loop.time() - started_at,
        )
        return batch

    async def _analyze_batch(self, batch: list[PerceptionEvent]) -> None:
        try:

            async def _on_progress(record: TodoIntentProcessingRecord) -> None:
                await self._publish_record(record)

            if len(batch) == 1:
                record = await self._orchestrator.process_event(
                    batch[0],
                    on_progress=_on_progress,
                )
            else:
                context = self._orchestrator.build_context_from_events(batch)
                context.metadata = context.metadata or {}
                context.metadata["trigger"] = "agent_name_mention"
                context.metadata["agent_name"] = self._get_agent_name()
                record = await self._orchestrator.process_context(
                    context,
                    on_progress=_on_progress,
                )
            await self._publish_record(record)
            self._analyzed_total += 1
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("[AgentNameWatcher] 分析失败, batch_size=%d", len(batch))
            fallback = self._build_failed_record(batch)
            await self._publish_record(fallback)

    def _build_failed_record(self, events: list[PerceptionEvent]) -> TodoIntentProcessingRecord:
        first = events[0]
        merged_text = "\n".join(
            (e.content_text or "").strip() for e in events if (e.content_text or "").strip()
        )
        return TodoIntentProcessingRecord(
            record_id=f"anw_{uuid4().hex}",
            context_id=f"ctx_anw_{uuid4().hex}",
            status=TodoIntentProcessingStatus.FAILED,
            created_at=get_utc_now(),
            event_ids=[e.event_id for e in events],
            source_set=list({e.source for e in events}),
            merged_text=merged_text or (first.content_text or "").strip(),
            time_window_start=min(e.timestamp for e in events),
            time_window_end=max(e.timestamp for e in events),
            metadata={"trigger": "agent_name_mention", "batch_size": len(events)},
            error="agent_name_watcher_error",
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

    async def _publish_record(self, record: TodoIntentProcessingRecord) -> None:
        self._recent_records.append(record)
        subscribers = list(self._record_subscribers)
        if not subscribers:
            return
        await asyncio.gather(*(cb(record) for cb in subscribers), return_exceptions=True)

    def get_status(self) -> dict:
        return {
            "enabled": True,
            "agent_name": self._get_agent_name(),
            "running": self._worker_task is not None and not self._worker_task.done(),
            "triggered_total": self._triggered_total,
            "analyzed_total": self._analyzed_total,
            "dropped_total": self._dropped_total,
            "queue_size": self._event_queue.qsize(),
            "window_seconds": self._window_seconds,
            "max_window_events": self._max_window_events,
        }
