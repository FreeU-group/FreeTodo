from __future__ import annotations

import asyncio
from contextlib import suppress
from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from perception.manager import try_get_perception_manager
from schemas.perception_todo_intent import (
    TodoIntentOrchestratorStats,
    TodoIntentProcessingRecord,
    TodoIntentSubscriberStatusResponse,
)

if TYPE_CHECKING:
    from perception.subscribers.todo_intent_subscriber import TodoIntentSubscriber

router = APIRouter(tags=["perception-todo-intent"])
_api_router = APIRouter(prefix="/api/perception/todo-intent", tags=["perception-todo-intent"])
_legacy_router = APIRouter(
    prefix="/perception/todo-intent",
    tags=["perception-todo-intent"],
    include_in_schema=False,
)

_RECENT_REPLAY_COUNT = 50
_WS_QUEUE_MAXSIZE = 200


def _enqueue_latest_record(
    queue: asyncio.Queue[TodoIntentProcessingRecord],
    record: TodoIntentProcessingRecord,
) -> None:
    if queue.full():
        with suppress(asyncio.QueueEmpty):
            queue.get_nowait()
    with suppress(asyncio.QueueFull):
        queue.put_nowait(record)


async def _replay_recent_records(
    websocket: WebSocket,
    subscriber: TodoIntentSubscriber,
    count: int,
) -> str | None:
    last_key: str | None = None
    for record in subscriber.get_recent_records(count):
        await websocket.send_json(record.model_dump(mode="json"))
        last_key = f"{record.record_id}:{record.status}"
    return last_key


def _register_routes(r: APIRouter) -> None:  # noqa: C901
    @r.get("/status", response_model=TodoIntentSubscriberStatusResponse)
    async def get_todo_intent_status() -> TodoIntentSubscriberStatusResponse:
        manager = try_get_perception_manager()
        if manager is None:
            raise HTTPException(status_code=503, detail="Perception stream not initialized")
        subscriber = manager.get_todo_intent_subscriber()
        if subscriber is None:
            return TodoIntentSubscriberStatusResponse(
                enabled=False,
                running=False,
                queue_size=0,
                queue_maxsize=0,
                enqueued_total=0,
                dropped_total=0,
                processing_workers=0,
                running_workers=0,
                active_workers=0,
                active_worker_ids=[],
                context_queue_size=0,
                context_queue_maxsize=0,
                contexts_enqueued_total=0,
                contexts_dropped_total=0,
                processed_total=0,
                failed_total=0,
                orchestrator=TodoIntentOrchestratorStats(),
            )
        return subscriber.get_status()

    @r.get("/records/recent", response_model=list[TodoIntentProcessingRecord])
    async def get_recent_records(
        count: int = _RECENT_REPLAY_COUNT,
    ) -> list[TodoIntentProcessingRecord]:
        manager = try_get_perception_manager()
        if manager is None:
            raise HTTPException(status_code=503, detail="Perception stream not initialized")
        subscriber = manager.get_todo_intent_subscriber()
        if subscriber is None:
            return []
        return subscriber.get_recent_records(count)

    @r.websocket("/stream")
    async def todo_intent_stream_ws(websocket: WebSocket) -> None:
        await websocket.accept()
        manager = try_get_perception_manager()
        if manager is None:
            await websocket.close(code=1013, reason="Perception stream not initialized")
            return
        subscriber = manager.get_todo_intent_subscriber()
        if subscriber is None:
            await websocket.close(code=1013, reason="Todo-intent subscriber not initialized")
            return

        queue: asyncio.Queue[TodoIntentProcessingRecord] = asyncio.Queue(maxsize=_WS_QUEUE_MAXSIZE)

        async def on_record(record: TodoIntentProcessingRecord) -> None:
            _enqueue_latest_record(queue, record)

        subscriber.subscribe_records(on_record)
        try:
            last_replay_key = await _replay_recent_records(
                websocket, subscriber, _RECENT_REPLAY_COUNT
            )
            while True:
                record = await queue.get()
                rec_key = f"{record.record_id}:{record.status}"
                if last_replay_key and rec_key == last_replay_key:
                    last_replay_key = None
                    continue
                await websocket.send_json(record.model_dump(mode="json"))
        except WebSocketDisconnect:
            pass
        finally:
            subscriber.unsubscribe_records(on_record)


_register_routes(_api_router)
_register_routes(_legacy_router)
router.include_router(_api_router)
router.include_router(_legacy_router)
