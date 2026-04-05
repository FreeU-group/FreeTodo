"""通知存储模块 - 使用内存存储通知，支持去重"""

import threading
from datetime import datetime
from typing import Any

from util.logging_config import get_logger
from util.time_utils import naive_as_utc

logger = get_logger()

# 保护 _notifications 和 _dismissed_notifications 的全局锁
_lock = threading.Lock()

# 内存存储：使用字典存储通知，key 为唯一标识符
_notifications: dict[str, dict[str, Any]] = {}

# 已取消通知跟踪：记录用户已取消的提醒（todo_id -> reminder_at set）
_dismissed_notifications: dict[int, set[str]] = {}


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    return naive_as_utc(parsed)


def _build_reminder_key(reminder_at: datetime) -> str:
    return naive_as_utc(reminder_at).isoformat()


def _dismiss_locked(notification: dict[str, Any]) -> None:
    """将通知标记为已取消（调用方必须已持有 _lock）"""
    todo_id = notification.get("todo_id")
    reminder_at = _parse_iso_datetime(
        notification.get("reminder_at")
        or notification.get("schedule_time")
        or notification.get("deadline")
    )
    if todo_id is not None and reminder_at is not None:
        key = _build_reminder_key(reminder_at)
        existing = _dismissed_notifications.get(todo_id)
        if existing is None:
            existing = set()
            _dismissed_notifications[todo_id] = existing
        existing.add(key)
        logger.debug(
            "标记通知为已取消: todo_id=%s, reminder_at=%s",
            todo_id,
            reminder_at.isoformat(),
        )


def add_notification(  # noqa: PLR0913
    notification_id: str,
    title: str,
    content: str,
    timestamp: datetime,
    todo_id: int | None = None,
    schedule_time: datetime | None = None,
    deadline: datetime | None = None,
    reminder_at: datetime | None = None,
    reminder_offset: int | None = None,
    notification_type: str | None = None,
) -> bool:
    """
    添加通知到存储

    Args:
        notification_id: 通知唯一标识符（用于去重）
        title: 通知标题
        content: 通知内容
        timestamp: 通知时间戳
        todo_id: 关联的待办 ID（可选）
        schedule_time: 待办时间点（可选，用于检测更新时间）
        deadline: 待办截止时间（旧字段，兼容旧调用）
        reminder_at: 提醒触发时间（可选，用于去重和取消）
        reminder_offset: 提醒偏移分钟数（可选）
        notification_type: 通知类型（可选），如 "auto_todo", "invitation", "conflict",
            "update", "complete", "cancel", "reminder"

    Returns:
        bool: 如果通知已存在（去重），返回 False；否则返回 True
    """
    with _lock:
        if notification_id in _notifications:
            logger.debug(f"通知已存在，跳过: {notification_id}")
            return False

        notification: dict[str, Any] = {
            "id": notification_id,
            "title": title,
            "content": content,
            "timestamp": timestamp.isoformat(),
        }

        if todo_id is not None:
            notification["todo_id"] = todo_id

        if notification_type is not None:
            notification["type"] = notification_type

        effective_time = schedule_time or deadline
        if effective_time is not None:
            notification["schedule_time"] = effective_time.isoformat()
        if deadline is not None:
            notification["deadline"] = deadline.isoformat()

        if reminder_at is not None:
            notification["reminder_at"] = reminder_at.isoformat()

        if reminder_offset is not None:
            notification["reminder_offset"] = reminder_offset

        _notifications[notification_id] = notification
        logger.info(f"添加通知: {notification_id} - {title}")

    _forward_to_cloud(title, content, notification_type, todo_id)
    return True


def _forward_to_cloud(
    title: str,
    content: str,
    notification_type: str | None,
    todo_id: int | None,
) -> None:
    """Forward notification to cloud-api for cross-device push (best-effort)."""
    try:
        from util.settings import settings  # noqa: PLC0415

        if not settings.get("sync.enabled", False):
            return

        from services.sync_client import get_sync_client  # noqa: PLC0415

        client = get_sync_client()
        if not client.connected:
            return

        client.enqueue_change(
            entity_type="notification",
            entity_id=f"notif-{title[:20]}",
            operation="create",
            data={
                "title": title,
                "content": content,
                "notification_type": notification_type,
                "related_todo_id": todo_id,
            },
        )
    except Exception:
        pass


def get_latest_notification() -> dict[str, Any] | None:
    """
    获取最新的通知

    Returns:
        最新通知的字典，如果没有通知则返回 None
    """
    notifications = get_notifications()
    return notifications[0] if notifications else None


def get_notifications() -> list[dict[str, Any]]:
    """获取所有通知（按时间倒序）"""
    with _lock:
        if not _notifications:
            return []
        return sorted(
            _notifications.values(),
            key=lambda x: x.get("timestamp", ""),
            reverse=True,
        )


def get_notification(notification_id: str) -> dict[str, Any] | None:
    """
    根据 ID 获取通知

    Args:
        notification_id: 通知 ID

    Returns:
        通知字典，如果不存在则返回 None
    """
    with _lock:
        return _notifications.get(notification_id)


def clear_notification(notification_id: str) -> bool:
    """
    清除指定通知（并标记为已取消，防止重复提醒）

    Args:
        notification_id: 通知 ID

    Returns:
        如果通知存在并已清除，返回 True；否则返回 False
    """
    with _lock:
        if notification_id in _notifications:
            _dismiss_locked(_notifications[notification_id])
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
    with _lock:
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
    with _lock:
        return len(_notifications)


def get_notifications_by_todo_id(todo_id: int) -> list[dict[str, Any]]:
    """根据待办ID查找所有通知"""
    with _lock:
        return [n for n in _notifications.values() if n.get("todo_id") == todo_id]


def get_notification_by_todo_id(todo_id: int) -> dict[str, Any] | None:
    """根据待办ID查找单条通知（兼容旧逻辑）"""
    notifications = get_notifications_by_todo_id(todo_id)
    return notifications[0] if notifications else None


def clear_notification_by_todo_id(todo_id: int) -> int:
    """根据待办ID清除所有通知"""
    with _lock:
        to_remove = [n for n in _notifications.values() if n.get("todo_id") == todo_id]
        removed = 0
        for notification in to_remove:
            notification_id = notification.get("id")
            if notification_id and notification_id in _notifications:
                _dismiss_locked(notification)
                del _notifications[notification_id]
                logger.debug(f"清除通知: {notification_id}")
                removed += 1
        return removed


def is_notification_dismissed(todo_id: int, reminder_at: datetime) -> bool:
    """检查指定待办的提醒时间是否已被取消"""
    with _lock:
        dismissed = _dismissed_notifications.get(todo_id)
        if not dismissed:
            return False
        return _build_reminder_key(reminder_at) in dismissed


def clear_dismissed_mark(todo_id: int) -> None:
    """
    清除指定待办的已取消标记（用于时间更新时）

    Args:
        todo_id: 待办ID
    """
    with _lock:
        if todo_id in _dismissed_notifications:
            del _dismissed_notifications[todo_id]
            logger.debug(f"清除已取消标记: todo_id={todo_id}")
