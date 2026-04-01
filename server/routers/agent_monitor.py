"""Agent Monitor API — real-time visibility into backend AI tasks.

Provides:
- GET   /api/agents/activities           — snapshot of current activities
- POST  /api/agents/{activity_id}/cancel — request cancellation
- WS    /api/agents/stream               — real-time activity events
"""

from __future__ import annotations

from contextlib import suppress

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.agent_activity_tracker import (
    get_all_activities,
    request_cancel,
    subscribe,
    unsubscribe,
)

router = APIRouter(prefix="/api/agents", tags=["agent-monitor"])


@router.get("/activities")
async def list_activities():
    """Return a snapshot of all currently running agent activities."""
    return {"activities": get_all_activities()}


@router.post("/{activity_id}/cancel")
async def cancel_activity(activity_id: str):
    """Request cancellation of a running agent activity."""
    found = request_cancel(activity_id)
    return {"ok": found, "activity_id": activity_id}


@router.websocket("/stream")
async def agent_activity_stream(websocket: WebSocket):
    """WebSocket endpoint for real-time agent activity updates.

    On connect: sends all current activities as ``snapshot`` event.
    Then pushes ``start``, ``update``, ``stop``, ``step`` events as they happen.
    """
    await websocket.accept()

    current = get_all_activities()
    await websocket.send_json({"event": "snapshot", "activities": current})

    queue = subscribe()
    try:
        while True:
            event = await queue.get()
            await websocket.send_json(event)
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        unsubscribe(queue)
        with suppress(Exception):
            await websocket.close()
