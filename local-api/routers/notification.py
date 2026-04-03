"""通知相关路由"""

import threading

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from storage.notification_storage import clear_notification, get_notifications
from util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def get_notification():
    """
    获取通知列表（按时间倒序）

    返回格式：
    [
        {
            "id": "通知ID",
            "title": "通知标题",
            "content": "通知内容",
            "timestamp": "时间戳（ISO格式）",
            "todo_id": 待办ID（可选）
        }
    ]
    """
    try:
        notifications = get_notifications()
        if notifications:
            logger.debug(f"返回通知列表: {len(notifications)}")
        return notifications
    except Exception as e:
        logger.error(f"获取通知失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取通知失败: {e!s}") from e


@router.delete("/{notification_id}")
async def delete_notification(notification_id: str):
    """
    删除指定通知

    Args:
        notification_id: 通知ID

    Returns:
        {"success": True, "message": "通知已删除"}
    """
    try:
        deleted = clear_notification(notification_id)
        if deleted:
            logger.info(f"删除通知: {notification_id}")
            return {"success": True, "message": "通知已删除"}
        logger.warning(f"通知不存在，无法删除: {notification_id}")
        return {"success": False, "message": "通知不存在"}
    except Exception as e:
        logger.error(f"删除通知失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"删除通知失败: {e!s}") from e


class ConfirmTodoRequest(BaseModel):
    todo_id: int


@router.post("/confirm-todo")
async def confirm_todo(body: ConfirmTodoRequest):
    """用户确认自动创建的待办后，触发未来 3 天的日程重规划。"""

    def _run_replan():
        try:
            from llm.agno_tools.tools.planning_tools import PlanningTools  # noqa: PLC0415
            from repositories.sql_todo_repository import SqlTodoRepository  # noqa: PLC0415
            from storage.database import db_base  # noqa: PLC0415

            class _Planner(PlanningTools):
                lang = "zh"
                todo_repo = SqlTodoRepository(db_base)

            result = _Planner().plan_schedule(scope="3days", auto_apply=True)
            logger.info("[ConfirmTodo] Replan completed: %s", result[:200])
        except Exception:
            logger.exception("[ConfirmTodo] Replan failed")

    threading.Thread(target=_run_replan, daemon=True).start()
    return {"success": True, "message": "已确认，正在重新规划日程"}


class DismissTodoRequest(BaseModel):
    todo_id: int


@router.post("/dismiss-todo")
async def dismiss_todo(body: DismissTodoRequest):
    """用户忽略自动创建的待办，从数据库中删除。"""
    try:
        from repositories.sql_todo_repository import SqlTodoRepository  # noqa: PLC0415
        from storage.database import db_base  # noqa: PLC0415

        repo = SqlTodoRepository(db_base)
        deleted = repo.delete(body.todo_id)
        if deleted:
            logger.info("[DismissTodo] Deleted todo %d", body.todo_id)
            return {"success": True, "message": "待办已忽略并删除"}
        return {"success": False, "message": "待办不存在"}
    except Exception as e:
        logger.exception("[DismissTodo] Failed to delete todo %d", body.todo_id)
        raise HTTPException(status_code=500, detail=str(e)) from e
