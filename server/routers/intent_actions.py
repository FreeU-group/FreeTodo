"""API endpoints for pending intent actions (confirm / reject / execute / progress)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core.dependencies import get_chat_service
from services.perception_todo_intent.pending_actions import (
    ActionStatus,
    ActionType,
    get_action,
    get_pending_actions,
    set_execution_session_id,
    update_action_status,
)
from storage.notification_storage import clear_notification
from util.logging_config import get_logger

if TYPE_CHECKING:
    from services.chat_service import ChatService

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
    logger.info("[FLOW][Confirm] 收到确认请求: action_id=%s", action_id)
    action = get_action(action_id)
    if action is None:
        logger.warning("[FLOW][Confirm] action不存在(内存可能已清): action_id=%s → 404", action_id)
        raise HTTPException(status_code=404, detail="Action not found")
    logger.info(
        "[FLOW][Confirm] 找到action: type=%s, status=%s, title=%s",
        action.action_type.value,
        action.status.value,
        action.title,
    )
    if action.action_type != ActionType.TODO:
        logger.warning(
            "[FLOW][Confirm] 类型不匹配: expected=TODO, got=%s → 400", action.action_type.value
        )
        raise HTTPException(status_code=400, detail="Action is not a todo type")
    if action.status != ActionStatus.PENDING:
        logger.warning(
            "[FLOW][Confirm] 状态不对: expected=PENDING, got=%s → 409", action.status.value
        )
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
        todo_id = getattr(result, "id", None)
        update_action_status(action_id, ActionStatus.CONFIRMED)
        clear_notification(f"pa_{action_id}")

        logger.info(
            "[FLOW][Confirm] ✓ 待办创建成功: action_id=%s, todo_id=%s, name=%s → 流程结束",
            action_id,
            todo_id,
            name,
        )
        return ActionResponse(
            success=True,
            action_id=action_id,
            message=f"已创建待办：{name}",
            data={"todo_id": todo_id},
        )
    except Exception as exc:
        logger.exception("[FLOW][Confirm] ✗ 创建失败: action_id=%s, error=%s", action_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/{action_id}/reject")
async def reject_action(action_id: str) -> ActionResponse:
    """User rejects / ignores a pending action."""
    logger.info("[FLOW][Reject] 收到忽略请求: action_id=%s", action_id)
    action = get_action(action_id)
    if action is None:
        logger.warning("[FLOW][Reject] action不存在: action_id=%s → 404", action_id)
        raise HTTPException(status_code=404, detail="Action not found")

    update_action_status(action_id, ActionStatus.REJECTED)
    clear_notification(f"pa_{action_id}")
    logger.info(
        "[FLOW][Reject] ✓ 已忽略: action_id=%s, was_type=%s, was_title=%s",
        action_id,
        action.action_type.value,
        action.title,
    )
    return ActionResponse(success=True, action_id=action_id, message="已忽略")


@router.post("/{action_id}/execute")
async def execute_task(
    action_id: str,
    chat_service: ChatService = Depends(get_chat_service),
) -> ActionResponse:
    """Create or resume an execution chat session for an executable action."""
    logger.info("[FLOW][Execute] 收到执行请求: action_id=%s", action_id)
    action = get_action(action_id)
    if action is None:
        logger.warning("[FLOW][Execute] action不存在(内存可能已清): action_id=%s → 404", action_id)
        raise HTTPException(status_code=404, detail="Action not found")
    logger.info(
        "[FLOW][Execute] 找到action: type=%s, status=%s, title=%s",
        action.action_type.value,
        action.status.value,
        action.title,
    )
    if action.action_type != ActionType.EXECUTABLE:
        logger.warning(
            "[FLOW][Execute] 类型不匹配: expected=EXECUTABLE, got=%s → 400",
            action.action_type.value,
        )
        raise HTTPException(status_code=400, detail="Action is not executable")
    if action.status in (ActionStatus.REJECTED, ActionStatus.CONFIRMED, ActionStatus.COMPLETED):
        logger.warning(
            "[FLOW][Execute] 状态不支持进入执行会话: status=%s → 409",
            action.status.value,
        )
        payload = ActionResponse(
            success=False,
            action_id=action_id,
            message=f"Already {action.status.value}",
        )
        return JSONResponse(status_code=409, content=payload.model_dump())

    from services.perception_todo_intent.execution_engine import (  # noqa: PLC0415
        build_execution_kickoff_prompt,
        get_executor_tools,
    )

    session_id = action.execution_session_id.strip() if action.execution_session_id else ""
    is_new_session = False
    if not session_id:
        session_id = chat_service.generate_session_id()
        chat_service.ensure_chat_exists(
            session_id=session_id,
            chat_type="event",
            title=f"执行：{action.title}"[:100],
        )
        set_execution_session_id(action_id, session_id)
        is_new_session = True

    update_action_status(action_id, ActionStatus.EXECUTING)
    clear_notification(f"pa_{action_id}")
    logger.info(
        "[FLOW][Execute] ✓ 执行会话已就绪: action_id=%s, session_id=%s, is_new=%s",
        action_id,
        session_id,
        is_new_session,
    )
    return ActionResponse(
        success=True,
        action_id=action_id,
        message="开始执行",
        data={
            "session_id": session_id,
            "initial_message": build_execution_kickoff_prompt(action),
            "initial_user_input": f"开始执行任务：{action.title}",
            "selected_tools": get_executor_tools(),
            "external_tools": [],
            "is_new_session": is_new_session,
        },
    )


@router.get("/{action_id}/progress")
async def get_progress(action_id: str) -> dict[str, Any]:
    """Poll execution progress — returns streaming_output for real-time text."""
    action = get_action(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found")
    return {
        "action_id": action_id,
        "title": action.title,
        "description": action.description,
        "action_type": action.action_type.value,
        "status": action.status.value,
        "execution_plan": action.execution_plan,
        "execution_steps": [
            {"key": step.key, "label": step.label, "status": step.status, "detail": step.detail}
            for step in action.execution_steps
        ],
        "execution_messages": [
            {"role": message.role, "content": message.content}
            for message in action.execution_messages
        ],
        "streaming_output": action.streaming_output,
        "result": action.execution_result,
        "activity_id": action.activity_id,
        "execution_session_id": action.execution_session_id,
    }
