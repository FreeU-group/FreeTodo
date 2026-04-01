"""Pending Intent Actions — in-memory store for user-confirmable actions.

The intent Agent now *analyzes* but does not *execute*.  It produces a
PendingAction that waits for user confirmation via the interactive popup.

Action types:
  - ``todo``:  Agent recommends creating a todo.  User clicks "confirm" →
    the backend calls ``create_todo``.
  - ``executable``: Agent believes it can perform the task autonomously
    (e.g. search files, write a report).  User clicks "execute" → a
    background sub-agent is spawned.
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from dataclasses import dataclass, field
from enum import StrEnum
from typing import TYPE_CHECKING, Any
from uuid import uuid4

if TYPE_CHECKING:
    from datetime import datetime

from util.time_utils import get_utc_now


class ActionType(StrEnum):
    TODO = "todo"
    EXECUTABLE = "executable"


class ActionStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    EXECUTING = "executing"
    COMPLETED = "completed"
    REJECTED = "rejected"
    FAILED = "failed"


@dataclass
class ExecutionStep:
    key: str
    label: str
    status: str = "pending"  # pending | running | done | failed
    detail: str = ""


@dataclass
class ExecutionMessage:
    role: str
    content: str


@dataclass
class PendingAction:
    action_id: str
    action_type: ActionType
    status: ActionStatus
    title: str
    description: str
    created_at: datetime
    context_id: str = ""
    todo_data: dict[str, Any] = field(default_factory=dict)
    execution_plan: list[str] = field(default_factory=list)
    execution_steps: list[ExecutionStep] = field(default_factory=list)
    execution_messages: list[ExecutionMessage] = field(default_factory=list)
    execution_result: str = ""
    agent_raw_output: str = ""
    streaming_output: str = ""
    activity_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "action_id": self.action_id,
            "action_type": self.action_type.value,
            "status": self.status.value,
            "title": self.title,
            "description": self.description,
            "created_at": self.created_at.isoformat(),
            "context_id": self.context_id,
            "todo_data": self.todo_data,
            "execution_plan": self.execution_plan,
            "execution_steps": [
                {"key": s.key, "label": s.label, "status": s.status, "detail": s.detail}
                for s in self.execution_steps
            ],
            "execution_messages": [
                {"role": m.role, "content": m.content} for m in self.execution_messages
            ],
            "execution_result": self.execution_result,
            "streaming_output": self.streaming_output,
            "activity_id": self.activity_id,
        }


_MAX_ACTIONS = 200
_MAX_MESSAGES = 200
_lock = threading.Lock()
_actions: OrderedDict[str, PendingAction] = OrderedDict()


def create_pending_action(
    *,
    action_type: ActionType,
    title: str,
    description: str,
    context_id: str = "",
    todo_data: dict[str, Any] | None = None,
    execution_plan: list[str] | None = None,
    agent_raw_output: str = "",
) -> PendingAction:
    plan_items = execution_plan or []
    action = PendingAction(
        action_id=f"pa_{uuid4().hex[:12]}",
        action_type=action_type,
        status=ActionStatus.PENDING,
        title=title,
        description=description,
        created_at=get_utc_now(),
        context_id=context_id,
        todo_data=todo_data or {},
        execution_plan=plan_items,
        execution_steps=[
            ExecutionStep(key=f"plan_{index + 1}", label=str(step))
            for index, step in enumerate(plan_items)
            if str(step).strip()
        ],
        agent_raw_output=agent_raw_output,
    )
    with _lock:
        _actions[action.action_id] = action
        while len(_actions) > _MAX_ACTIONS:
            _actions.popitem(last=False)
    return action


def get_action(action_id: str) -> PendingAction | None:
    with _lock:
        return _actions.get(action_id)


def update_action_status(action_id: str, status: ActionStatus) -> PendingAction | None:
    with _lock:
        action = _actions.get(action_id)
        if action is not None:
            action.status = status
        return action


def update_execution_steps(action_id: str, steps: list[ExecutionStep]) -> PendingAction | None:
    with _lock:
        action = _actions.get(action_id)
        if action is not None:
            action.execution_steps = steps
        return action


def set_execution_result(action_id: str, result: str) -> PendingAction | None:
    with _lock:
        action = _actions.get(action_id)
        if action is not None:
            action.execution_result = result
            action.status = ActionStatus.COMPLETED
        return action


def append_streaming_output(action_id: str, chunk: str) -> PendingAction | None:
    with _lock:
        action = _actions.get(action_id)
        if action is not None:
            action.streaming_output += chunk
        return action


def append_execution_message(
    action_id: str,
    *,
    role: str,
    content: str,
    merge_with_last: bool = False,
) -> PendingAction | None:
    normalized = content.strip()
    if not normalized:
        return None

    with _lock:
        action = _actions.get(action_id)
        if action is None:
            return None

        if merge_with_last and action.execution_messages:
            last = action.execution_messages[-1]
            if last.role == role:
                last.content += normalized
                return action

        action.execution_messages.append(ExecutionMessage(role=role, content=normalized))
        if len(action.execution_messages) > _MAX_MESSAGES:
            del action.execution_messages[: len(action.execution_messages) - _MAX_MESSAGES]
        return action


def upsert_execution_step(
    action_id: str,
    *,
    key: str,
    label: str,
    status: str,
    detail: str = "",
) -> PendingAction | None:
    with _lock:
        action = _actions.get(action_id)
        if action is None:
            return None

        for step in action.execution_steps:
            if step.key == key:
                step.label = label
                step.status = status
                if detail:
                    step.detail = detail
                return action

        action.execution_steps.append(
            ExecutionStep(key=key, label=label, status=status, detail=detail)
        )
        return action


def set_activity_id(action_id: str, activity_id: str) -> PendingAction | None:
    with _lock:
        action = _actions.get(action_id)
        if action is not None:
            action.activity_id = activity_id
        return action


def get_pending_actions(limit: int = 20) -> list[PendingAction]:
    with _lock:
        items = list(_actions.values())
    return sorted(items, key=lambda a: a.created_at, reverse=True)[:limit]
