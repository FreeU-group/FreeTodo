"""通知存储模块 - 使用内存存储通知，支持去重"""

from datetime import datetime
from typing import Any

from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 内存存储：使用字典存储通知，key 为唯一标识符
_notifications: dict[str, dict[str, Any]] = {}


def add_notification(
    notification_id: str,
    title: str,
    content: str,
    timestamp: datetime,
    todo_id: int | None = None,
) -> bool:
    """
    添加通知到存储

    Args:
        notification_id: 通知唯一标识符（用于去重）
        title: 通知标题
        content: 通知内容
        timestamp: 通知时间戳
        todo_id: 关联的待办 ID（可选）

    Returns:
        bool: 如果通知已存在（去重），返回 False；否则返回 True
    """
    if notification_id in _notifications:
        logger.debug(f"通知已存在，跳过: {notification_id}")
        return False

    notification = {
        "id": notification_id,
        "title": title,
        "content": content,
        "timestamp": timestamp.isoformat(),
    }

    if todo_id is not None:
        notification["todo_id"] = todo_id

    _notifications[notification_id] = notification
    logger.info(f"添加通知: {notification_id} - {title}")
    return True


def get_latest_notification() -> dict[str, Any] | None:
    """
    获取最新的通知

    Returns:
        最新通知的字典，如果没有通知则返回 None
    """
    if not _notifications:
        return None

    # 按时间戳排序，返回最新的
    sorted_notifications = sorted(
        _notifications.values(),
        key=lambda x: x.get("timestamp", ""),
        reverse=True,
    )

    return sorted_notifications[0] if sorted_notifications else None


def get_notification(notification_id: str) -> dict[str, Any] | None:
    """
    根据 ID 获取通知

    Args:
        notification_id: 通知 ID

    Returns:
        通知字典，如果不存在则返回 None
    """
    return _notifications.get(notification_id)


def clear_notification(notification_id: str) -> bool:
    """
    清除指定通知

    Args:
        notification_id: 通知 ID

    Returns:
        如果通知存在并已清除，返回 True；否则返回 False
    """
    if notification_id in _notifications:
        del _notifications[notification_id]
        logger.debug(f"清除通知: {notification_id}")
        return True
    return False


def clear_all_notifications() -> int:
    """
    清除所有通知

    Returns:
        清除的通知数量
    """
    count = len(_notifications)
    _notifications.clear()
    logger.info(f"清除所有通知，共 {count} 条")
    return count


def get_notification_count() -> int:
    """
    获取当前存储的通知数量

    Returns:
        通知数量
    """
    return len(_notifications)
