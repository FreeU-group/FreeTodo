"""Global Agent Activity Tracker.

Provides real-time visibility into all active AI agent / LLM tasks.
Frontend connects via WebSocket to receive live updates.

Supports:
- cancel flags per activity (checked by streaming code)
- step-level detail tracking (tool calls, model responses)
"""

from __future__ import annotations

import asyncio
import threading
import time
from typing import Any
from uuid import uuid4

from util.logging_config import get_logger

logger = get_logger()

_activities: dict[str, dict[str, Any]] = {}
_cancel_events: dict[str, threading.Event] = {}
_subscribers: list[asyncio.Queue[dict[str, Any]]] = []
_lock = threading.Lock()

MAX_STEPS_PER_ACTIVITY = 200


def start_activity(
    *,
    agent_type: str,
    task: str = "",
    model: str = "",
    details: dict[str, Any] | None = None,
) -> str:
    """Register a new agent activity. Returns an activity_id for later update/stop."""
    activity_id = uuid4().hex[:12]
    entry = {
        "id": activity_id,
        "agent_type": agent_type,
        "task": task[:200] if task else "",
        "model": model,
        "status": "running",
        "started_at": time.time(),
        "updated_at": time.time(),
        "details": details or {},
    }
    entry["details"].setdefault("steps", [])
    with _lock:
        _activities[activity_id] = entry
        _cancel_events[activity_id] = threading.Event()
    _broadcast({"event": "start", **entry})
    return activity_id


def update_activity(
    activity_id: str,
    *,
    status: str | None = None,
    task: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Update a running activity's status or details."""
    with _lock:
        entry = _activities.get(activity_id)
        if not entry:
            return
        if status:
            entry["status"] = status
        if task is not None:
            entry["task"] = task[:200]
        if details:
            entry["details"].update(details)
        entry["updated_at"] = time.time()
        snapshot = {**entry}
    _broadcast({"event": "update", "id": activity_id, **snapshot})


def add_activity_step(
    activity_id: str,
    *,
    step_type: str,
    name: str = "",
    content: str = "",
) -> None:
    """Append a step (tool_call / tool_result / model_chunk) to an activity."""
    step = {
        "type": step_type,
        "name": name,
        "content": content[:2000],
        "ts": time.time(),
    }
    with _lock:
        entry = _activities.get(activity_id)
        if not entry:
            return
        steps = entry["details"].setdefault("steps", [])
        if len(steps) < MAX_STEPS_PER_ACTIVITY:
            steps.append(step)
        entry["updated_at"] = time.time()
    _broadcast(
        {
            "event": "step",
            "id": activity_id,
            "step": step,
        }
    )


def stop_activity(activity_id: str, *, status: str = "completed") -> None:
    """Mark an activity as completed/failed and remove it after broadcasting."""
    with _lock:
        entry = _activities.pop(activity_id, None)
        _cancel_events.pop(activity_id, None)
    if entry:
        entry["status"] = status
        entry["ended_at"] = time.time()
        entry["duration_ms"] = round((entry["ended_at"] - entry["started_at"]) * 1000)
        _broadcast({"event": "stop", **entry})


def request_cancel(activity_id: str) -> bool:
    """Signal cancellation for *activity_id*. Returns True if the activity existed."""
    with _lock:
        ev = _cancel_events.get(activity_id)
    if ev is None:
        return False
    ev.set()
    logger.info("[ActivityTracker] Cancel requested for %s", activity_id)
    return True


def is_cancelled(activity_id: str) -> bool:
    """Check whether *activity_id* has been cancelled (non-blocking)."""
    with _lock:
        ev = _cancel_events.get(activity_id)
    return ev.is_set() if ev else False


def get_all_activities() -> list[dict[str, Any]]:
    """Get snapshot of all current activities."""
    with _lock:
        return list(_activities.values())


def subscribe() -> asyncio.Queue[dict[str, Any]]:
    """Subscribe to activity events. Returns an asyncio.Queue."""
    q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
    with _lock:
        _subscribers.append(q)
    return q


def unsubscribe(q: asyncio.Queue[dict[str, Any]]) -> None:
    """Unsubscribe from activity events."""
    with _lock:
        try:
            _subscribers.remove(q)
        except ValueError:
            pass


def _broadcast(event: dict[str, Any]) -> None:
    """Push event to all subscribers (non-blocking)."""
    with _lock:
        subs = list(_subscribers)
    for q in subs:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
                q.put_nowait(event)
            except (asyncio.QueueEmpty, asyncio.QueueFull):
                pass
