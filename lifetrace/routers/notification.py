"""通知相关路由"""

from fastapi import APIRouter, HTTPException

from lifetrace.storage.notification_storage import clear_notification, get_latest_notification
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def get_notification():
    """
    获取最新通知

    返回格式：
    {
        "id": "通知ID",
        "title": "通知标题",
        "content": "通知内容",
        "timestamp": "时间戳（ISO格式）",
        "todo_id": 待办ID（可选）
    }

    如果没有通知，返回 null
    """
    try:
        notification = get_latest_notification()
        if notification:
            logger.debug(f"返回通知: {notification.get('id')}")
            return notification
        # 返回 null（前端会处理）
        return None
    except Exception as e:
        logger.error(f"获取通知失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取通知失败: {str(e)}") from e


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
        raise HTTPException(status_code=500, detail=f"删除通知失败: {str(e)}") from e
