"""API endpoints for pending intent actions (confirm / reject / execute / progress)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.perception_todo_intent.pending_actions import (
    ActionStatus,
    ActionType,
    get_action,
    get_pending_actions,
    update_action_status,
)
from storage.notification_storage import add_notification, clear_notification
from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()

router = APIRouter(prefix="/api/intent-actions", tags=["intent-actions"])


class ActionResponse(BaseModel):
    success: bool
    action_id: str
    message: str = ""
    data: dict[str, Any] | None = None


@router.get("")
async def list_pending() -> list[dict[str, Any]]:
    """List recent pending actions."""
    actions = get_pending_actions(limit=20)
    return [a.to_dict() for a in actions]


@router.get("/{action_id}")
async def get_action_detail(action_id: str) -> dict[str, Any]:
    """Get a single action with full details (including execution progress)."""
    action = get_action(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found")
    return action.to_dict()


@router.post("/{action_id}/confirm")
async def confirm_todo(action_id: str) -> ActionResponse:
    """User confirms creating a todo from a pending_todo action."""
    action = get_action(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found")
    if action.action_type != ActionType.TODO:
        raise HTTPException(status_code=400, detail="Action is not a todo type")
    if action.status != ActionStatus.PENDING:
        payload = ActionResponse(
            success=False,
            action_id=action_id,
            message=f"Already {action.status.value}",
        )
        return JSONResponse(status_code=409, content=payload.model_dump())

    todo_data = action.todo_data
    try:
        from repositories.sql_todo_repository import SqlTodoRepository  # noqa: PLC0415
        from schemas.todo import TodoCreate  # noqa: PLC0415
        from services.todo_service import TodoService  # noqa: PLC0415
        from storage.database import db_base  # noqa: PLC0415

        svc = TodoService(SqlTodoRepository(db_base))
        name = todo_data.get("name") or action.title
        create_payload = TodoCreate(
            name=name,
            description=action.description,
            who_founder=todo_data.get("who_founder") or None,
            who_executor=todo_data.get("who_executor") or None,
            status="active",
            priority=todo_data.get("priority", "medium"),
            dtstart=todo_data.get("when_iso") or None,
            location=todo_data.get("where") or None,
        )
        result = svc.create_todo(create_payload)
        update_action_status(action_id, ActionStatus.CONFIRMED)

        clear_notification(f"pa_{action_id}")
        add_notification(
            notification_id=f"confirmed_{action_id}",
            title=f"已添加待办：{name}",
            content=action.description,
            timestamp=get_utc_now(),
            notification_type="auto_todo",
        )

        logger.info("[IntentActions] Todo confirmed: %s — %s", action_id, name)
        return ActionResponse(
            success=True,
            action_id=action_id,
            message=f"已创建待办：{name}",
            data={"todo_id": getattr(result, "id", None)},
        )
    except Exception as exc:
        logger.exception("[IntentActions] Failed to create todo for %s", action_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/{action_id}/reject")
async def reject_action(action_id: str) -> ActionResponse:
    """User rejects / ignores a pending action."""
    action = get_action(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found")

    update_action_status(action_id, ActionStatus.REJECTED)
    clear_notification(f"pa_{action_id}")
    logger.info("[IntentActions] Action rejected: %s", action_id)
    return ActionResponse(success=True, action_id=action_id, message="已忽略")


@router.post("/{action_id}/execute")
async def execute_task(action_id: str) -> ActionResponse:
    """User confirms executing an 'executable' action via sub-agent."""
    action = get_action(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found")
    if action.action_type != ActionType.EXECUTABLE:
        raise HTTPException(status_code=400, detail="Action is not executable")
    if action.status not in (ActionStatus.PENDING, ActionStatus.FAILED):
        payload = ActionResponse(
            success=False,
            action_id=action_id,
            message=f"Already {action.status.value}",
        )
        return JSONResponse(status_code=409, content=payload.model_dump())

    from services.perception_todo_intent.execution_engine import (  # noqa: PLC0415
        execute_action,
    )

    started = await execute_action(action_id)
    if not started:
        raise HTTPException(status_code=500, detail="Failed to start execution")

    logger.info("[IntentActions] Execution started: %s", action_id)
    return ActionResponse(success=True, action_id=action_id, message="开始执行")


@router.get("/{action_id}/progress")
async def get_progress(action_id: str) -> dict[str, Any]:
    """Poll execution progress for a running action."""
    action = get_action(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found")
    return {
        "action_id": action_id,
        "status": action.status.value,
        "steps": [
            {"label": s.label, "status": s.status, "detail": s.detail}
            for s in action.execution_steps
        ],
        "result": action.execution_result,
    }
