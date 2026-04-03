from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections import deque
from datetime import timedelta
from typing import TYPE_CHECKING

from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from perception.models import PerceptionEvent


logger = logging.getLogger(__name__)


class PerceptionStream:
    """In-process asyncio pub/sub bus + sliding window buffer.

    Design (MVP):
    - publish() assigns sequence_id + ingested_at and enqueues to a pending queue
    - a background dispatcher task drains the queue and delivers to subscribers
    - a short sliding window buffer supports recent replay
    - backpressure: when pending queue is full, drop low-priority events first
    """

    def __init__(
        self,
        window_seconds: int = 300,
        max_pending_events: int = 1000,
    ):
        self._sequence_counter = 0
        self._window_seconds = int(window_seconds)
        self._buffer: deque[PerceptionEvent] = deque()
        self._subscribers: list[Callable[[PerceptionEvent], Awaitable[None]]] = []
        self._lock = asyncio.Lock()

        self._pending: deque[PerceptionEvent] = deque()
        self._max_pending_events = max(1, int(max_pending_events))
        self._pending_cv = asyncio.Condition(self._lock)
        self._dispatcher_task: asyncio.Task[None] | None = None
        self._stopped = False

        self._accepted_total = 0
        self._dropped_total = 0
        self._dropped_by_priority: dict[int, int] = {}
        self._dropped_by_source: dict[str, int] = {}
        self._dispatched_total = 0
        self._last_drop_log_at = 0.0
        self._drop_log_interval_seconds = 5.0

    async def publish(self, event: PerceptionEvent) -> None:
        """Publish an event: assign sequence_id -> buffer -> enqueue for dispatch."""
        await self.start()

        async with self._pending_cv:
            if self._stopped:
                return

            if len(self._pending) >= self._max_pending_events and not self._try_make_room_for(
                incoming=event
            ):
                self._record_drop(event, reason="pending_full_drop_incoming")
                return

            self._sequence_counter += 1
            event.sequence_id = self._sequence_counter
            event.ingested_at = get_utc_now()

            self._buffer.append(event)
            self._trim_window_locked()
            self._pending.append(event)
            self._accepted_total += 1
            self._pending_cv.notify(1)

    async def start(self) -> None:
        """Start background dispatcher (idempotent)."""
        async with self._pending_cv:
            if self._dispatcher_task is not None and not self._dispatcher_task.done():
                return
            self._stopped = False
            self._dispatcher_task = asyncio.create_task(self._dispatch_loop())

    async def stop(self) -> None:
        """Stop background dispatcher and clear pending events (idempotent)."""
        task = None
        async with self._pending_cv:
            self._stopped = True
            self._pending.clear()
            self._pending_cv.notify_all()
            task = self._dispatcher_task
            self._dispatcher_task = None

        if task is None:
            return

        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    def subscribe(self, callback: Callable[[PerceptionEvent], Awaitable[None]]) -> None:
        self._subscribers.append(callback)

    def unsubscribe(self, callback: Callable[[PerceptionEvent], Awaitable[None]]) -> None:
        self._subscribers = [s for s in self._subscribers if s is not callback]

    async def get_recent(self, count: int = 50) -> list[PerceptionEvent]:
        count = max(0, int(count))
        if count == 0:
            return []
        async with self._lock:
            self._trim_window_locked()
            return list(self._buffer)[-count:]

    def get_queue_stats(self) -> dict[str, object]:
        """A lightweight, best-effort snapshot for monitoring/debugging."""
        pending_len = len(self._pending)
        buffer_len = len(self._buffer)
        return {
            "pending_len": pending_len,
            "max_pending_events": self._max_pending_events,
            "buffer_len": buffer_len,
            "window_seconds": self._window_seconds,
            "accepted_total": self._accepted_total,
            "dispatched_total": self._dispatched_total,
            "dropped_total": self._dropped_total,
            "dropped_by_priority": {str(k): v for k, v in self._dropped_by_priority.items()},
            "dropped_by_source": dict(self._dropped_by_source),
        }

    def _try_make_room_for(self, incoming: PerceptionEvent) -> bool:
        """Best-effort backpressure policy.

        When pending is full:
        - If incoming priority is lower than the current lowest priority in queue, drop incoming.
        - Otherwise drop the oldest event among the current lowest priority, then accept incoming.

        Returns True if caller should accept incoming, False if incoming should be dropped.
        """
        if not self._pending:
            return True

        lowest_priority = min(e.priority for e in self._pending)
        if incoming.priority < lowest_priority:
            return False

        # Drop the oldest event with the lowest priority.
        for idx, existing in enumerate(self._pending):
            if existing.priority == lowest_priority:
                self._record_drop(existing, reason="pending_full_drop_existing")
                self._remove_from_buffer_locked(existing.event_id)
                del self._pending[idx]
                return True

        # Fallback: if not found for any reason, drop the oldest event.
        existing = self._pending.popleft()
        self._record_drop(existing, reason="pending_full_drop_existing_fallback")
        self._remove_from_buffer_locked(existing.event_id)
        return True

    def _record_drop(self, event: PerceptionEvent, *, reason: str) -> None:
        self._dropped_total += 1
        self._dropped_by_priority[event.priority] = (
            self._dropped_by_priority.get(event.priority, 0) + 1
        )
        try:
            source_key = getattr(event.source, "value", None) or str(event.source)
        except Exception:
            source_key = "unknown"
        self._dropped_by_source[source_key] = self._dropped_by_source.get(source_key, 0) + 1

        now = time.monotonic()
        if now - self._last_drop_log_at < self._drop_log_interval_seconds:
            return
        self._last_drop_log_at = now
        logger.warning(
            "PerceptionStream backpressure: drop=%s pending=%s/%s dropped_total=%s",
            reason,
            len(self._pending),
            self._max_pending_events,
            self._dropped_total,
        )

    async def _dispatch_loop(self) -> None:
        while True:
            async with self._pending_cv:
                while not self._pending and not self._stopped:
                    await self._pending_cv.wait()
                if self._stopped:
                    return
                event = self._pending.popleft()

            subscribers = list(self._subscribers)
            if not subscribers:
                continue

            await asyncio.gather(*(sub(event) for sub in subscribers), return_exceptions=True)
            async with self._pending_cv:
                self._dispatched_total += 1

    def _remove_from_buffer_locked(self, event_id: str) -> None:
        if not self._buffer:
            return
        for idx, existing in enumerate(self._buffer):
            if existing.event_id == event_id:
                del self._buffer[idx]
                return

    def _trim_window_locked(self) -> None:
        if self._window_seconds <= 0:
            self._buffer.clear()
            return

        cutoff = get_utc_now() - timedelta(seconds=self._window_seconds)
        while self._buffer:
            ingested_at = self._buffer[0].ingested_at
            if ingested_at is None or ingested_at >= cutoff:
                break
            self._buffer.popleft()
