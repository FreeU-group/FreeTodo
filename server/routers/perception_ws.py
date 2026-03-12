from __future__ import annotations

import asyncio
from contextlib import suppress
from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from memory.manager import try_get_memory_manager
from perception.manager import try_get_perception_manager, try_get_perception_stream
from routers.perception_todo_intent import router as perception_todo_intent_router

if TYPE_CHECKING:
    from perception.models import PerceptionEvent
    from perception.stream import PerceptionStream

router = APIRouter(tags=["perception"])

_api_router = APIRouter(prefix="/api/perception", tags=["perception"])
_legacy_router = APIRouter(prefix="/perception", tags=["perception"], include_in_schema=False)
_RECENT_REPLAY_COUNT = 50
_WS_QUEUE_MAXSIZE = 500


def _enqueue_latest_event(queue: asyncio.Queue[PerceptionEvent], event: PerceptionEvent) -> None:
    if queue.full():
        with suppress(asyncio.QueueEmpty):
            queue.get_nowait()
    with suppress(asyncio.QueueFull):
        queue.put_nowait(event)


async def _replay_recent_events_l1(websocket: WebSocket) -> int:
    """Replay recent L1 (deduplicated) events on WebSocket connect."""
    mgr = try_get_memory_manager()
    if mgr is None or mgr.deduper is None:
        return 0
    last_sent = 0
    for event in await mgr.deduper.get_recent(_RECENT_REPLAY_COUNT):
        await websocket.send_json(event.model_dump(mode="json"))
        last_sent = max(last_sent, event.sequence_id)
    return last_sent


async def _replay_recent_events_l0(websocket: WebSocket, stream: PerceptionStream) -> int:
    """Fallback: replay recent L0 (raw) events."""
    last_sent = 0
    for event in await stream.get_recent(_RECENT_REPLAY_COUNT):
        await websocket.send_json(event.model_dump(mode="json"))
        last_sent = max(last_sent, event.sequence_id)
    return last_sent


def _register_routes(r: APIRouter) -> None:  # noqa: C901
    @r.websocket("/stream")
    async def perception_stream_ws(websocket: WebSocket) -> None:
        """WebSocket endpoint for real-time perception events.

        Prefers L1 (deduplicated) stream when available, falls back to L0.
        """
        await websocket.accept()
        stream = try_get_perception_stream()
        if stream is None:
            await websocket.close(code=1013, reason="Perception stream not initialized")
            return

        queue: asyncio.Queue[PerceptionEvent] = asyncio.Queue(maxsize=_WS_QUEUE_MAXSIZE)

        async def on_event(event: PerceptionEvent) -> None:
            _enqueue_latest_event(queue, event)

        mgr = try_get_memory_manager()
        use_l1 = mgr is not None and mgr.deduper is not None

        if use_l1:
            mgr.deduper.subscribe(on_event)  # type: ignore[union-attr]
        else:
            stream.subscribe(on_event)

        try:
            if use_l1:
                last_sent_sequence_id = await _replay_recent_events_l1(websocket)
            else:
                last_sent_sequence_id = await _replay_recent_events_l0(websocket, stream)

            while True:
                event = await queue.get()
                if event.sequence_id <= last_sent_sequence_id:
                    continue
                await websocket.send_json(event.model_dump(mode="json"))
                last_sent_sequence_id = event.sequence_id
        except WebSocketDisconnect:
            pass
        finally:
            if use_l1:
                mgr.deduper.unsubscribe(on_event)  # type: ignore[union-attr]
            else:
                stream.unsubscribe(on_event)

    @r.get("/events/recent")
    async def get_recent_events(count: int = 50) -> list[dict]:
        """Return recent events — L1 (deduplicated) if available, else L0."""
        mgr = try_get_memory_manager()
        if mgr is not None and mgr.deduper is not None:
            return [e.model_dump(mode="json") for e in await mgr.deduper.get_recent(count)]

        stream = try_get_perception_stream()
        if stream is None:
            raise HTTPException(status_code=503, detail="Perception stream not initialized")
        return [e.model_dump(mode="json") for e in await stream.get_recent(count)]

    @r.get("/status")
    async def get_perception_status() -> dict[str, object]:
        manager = try_get_perception_manager()
        if manager is None:
            raise HTTPException(status_code=503, detail="Perception stream not initialized")
        return manager.get_status()


_register_routes(_api_router)
_register_routes(_legacy_router)
router.include_router(_api_router)
router.include_router(_legacy_router)
router.include_router(perception_todo_intent_router)
