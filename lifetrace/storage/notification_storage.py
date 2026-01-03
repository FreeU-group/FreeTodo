"""通知存储模块 - 使用内存存储通知，支持去重"""

from datetime import datetime
from typing import Any

from lifetrace.util.logging_config import get_logger
from lifetrace.util.time_utils import naive_as_utc

logger = get_logger()

# 内存存储：使用字典存储通知，key 为唯一标识符
_notifications: dict[str, dict[str, Any]] = {}

# 已取消通知跟踪：记录用户已取消的通知（todo_id -> deadline）
# 用于防止同一deadline下重复提醒
_dismissed_notifications: dict[int, datetime] = {}


def add_notification(
    notification_id: str,
    title: str,
    content: str,
    timestamp: datetime,
    todo_id: int | None = None,
    deadline: datetime | None = None,
) -> bool:
    """
    添加通知到存储

    Args:
        notification_id: 通知唯一标识符（用于去重）
        title: 通知标题
        content: 通知内容
        timestamp: 通知时间戳
        todo_id: 关联的待办 ID（可选）
        deadline: 待办截止时间（可选，用于检测deadline更新）

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

    if deadline is not None:
        notification["deadline"] = deadline.isoformat()

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
    清除指定通知（并标记为已取消，防止重复提醒）

    Args:
        notification_id: 通知 ID

    Returns:
        如果通知存在并已清除，返回 True；否则返回 False
    """
    if notification_id in _notifications:
        notification = _notifications[notification_id]
        # 如果通知有关联的todo_id和deadline，记录到已取消列表
        todo_id = notification.get("todo_id")
        deadline_str = notification.get("deadline")
        if todo_id is not None and deadline_str:
            try:
                deadline_parsed = datetime.fromisoformat(deadline_str)
                # 确保是 timezone-aware datetime（如果解析出来是 naive，假设为 UTC）
                deadline_utc = naive_as_utc(deadline_parsed)
                _dismissed_notifications[todo_id] = deadline_utc
                logger.debug(f"标记通知为已取消: todo_id={todo_id}, deadline={deadline_str}")
            except (ValueError, TypeError):
                # 解析失败，仍然删除通知但不记录已取消
                pass

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


def get_notification_by_todo_id(todo_id: int) -> dict[str, Any] | None:
    """
    根据待办ID查找通知

    Args:
        todo_id: 待办ID

    Returns:
        通知字典，如果不存在则返回 None
    """
    for notification in _notifications.values():
        if notification.get("todo_id") == todo_id:
            return notification
    return None


def clear_notification_by_todo_id(todo_id: int) -> bool:
    """
    根据待办ID清除通知

    Args:
        todo_id: 待办ID

    Returns:
        如果通知存在并已清除，返回 True；否则返回 False
    """
    notification = get_notification_by_todo_id(todo_id)
    if notification:
        notification_id = notification.get("id")
        if notification_id:
            return clear_notification(notification_id)
    return False


def is_notification_dismissed(todo_id: int, deadline: datetime) -> bool:
    """
    检查指定待办的deadline是否已被用户取消

    Args:
        todo_id: 待办ID
        deadline: 待办deadline

    Returns:
        如果该deadline已被取消，返回 True；否则返回 False
    """
    dismissed_deadline = _dismissed_notifications.get(todo_id)
    if dismissed_deadline is None:
        return False

    # 比较deadline（忽略微秒级别的差异）
    if abs((deadline - dismissed_deadline).total_seconds()) < 1:
        return True
    return False


def clear_dismissed_mark(todo_id: int) -> None:
    """
    清除指定待办的已取消标记（用于deadline更新时）

    Args:
        todo_id: 待办ID
    """
    if todo_id in _dismissed_notifications:
        del _dismissed_notifications[todo_id]
        logger.debug(f"清除已取消标记: todo_id={todo_id}")
