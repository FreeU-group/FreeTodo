"""同步变更钩子 — 在本地 CRUD 完成后将变更加入同步队列

使用方式：在 service 层的 create/update/delete 方法末尾调用对应函数。
如果同步未启用或用户未登录云端，调用会被静默忽略。
"""

from __future__ import annotations

from typing import Any

from util.logging_config import get_logger

logger = get_logger()


def _get_client():
    """Lazy-load sync client to avoid circular imports."""
    try:
        from services.sync_client import get_sync_client  # noqa: PLC0415

        return get_sync_client()
    except Exception:
        return None


def _is_sync_enabled() -> bool:
    try:
        from util.settings import settings  # noqa: PLC0415

        return bool(settings.get("sync.enabled", False))
    except Exception:
        return False


def notify_todo_created(uid: str, data: dict[str, Any]) -> None:
    """Call after a Todo is created locally."""
    if not _is_sync_enabled():
        return
    client = _get_client()
    if client and client.connected:
        client.enqueue_change("todo", uid, "create", version=0, data=data)


def notify_todo_updated(uid: str, version: int, data: dict[str, Any]) -> None:
    """Call after a Todo is updated locally."""
    if not _is_sync_enabled():
        return
    client = _get_client()
    if client and client.connected:
        client.enqueue_change("todo", uid, "update", version=version, data=data)


def notify_todo_deleted(uid: str, version: int = 0) -> None:
    """Call after a Todo is deleted locally."""
    if not _is_sync_enabled():
        return
    client = _get_client()
    if client and client.connected:
        client.enqueue_change("todo", uid, "delete", version=version)


def notify_chat_created(session_id: str, data: dict[str, Any]) -> None:
    """Call after a Chat session is created locally."""
    if not _is_sync_enabled():
        return
    client = _get_client()
    if client and client.connected:
        client.enqueue_change("chat", session_id, "create", version=0, data=data)


def notify_chat_updated(session_id: str, version: int, data: dict[str, Any]) -> None:
    """Call after a Chat session is updated locally."""
    if not _is_sync_enabled():
        return
    client = _get_client()
    if client and client.connected:
        client.enqueue_change("chat", session_id, "update", version=version, data=data)


def notify_chat_deleted(session_id: str, version: int = 0) -> None:
    """Call after a Chat session is deleted locally."""
    if not _is_sync_enabled():
        return
    client = _get_client()
    if client and client.connected:
        client.enqueue_change("chat", session_id, "delete", version=version)


def notify_message_created(uid: str, data: dict[str, Any]) -> None:
    """Call after a Message is created locally."""
    if not _is_sync_enabled():
        return
    client = _get_client()
    if client and client.connected:
        client.enqueue_change("message", uid, "create", version=0, data=data)


def notify_message_deleted(uid: str, version: int = 0) -> None:
    """Call after a Message is deleted locally."""
    if not _is_sync_enabled():
        return
    client = _get_client()
    if client and client.connected:
        client.enqueue_change("message", uid, "delete", version=version)
