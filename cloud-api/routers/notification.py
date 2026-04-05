"""通知 REST 端点 — 列表、已读、删除、推送设备注册"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from dependencies.auth import SessionDep, UserDep
from services import push_service

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


class NotificationResponse(BaseModel):
    id: str
    title: str
    content: str
    notification_type: str | None
    related_todo_uid: str | None
    is_read: bool
    created_at: str | None
    read_at: str | None


class CreateNotificationRequest(BaseModel):
    title: str
    content: str
    notification_type: str | None = None
    related_todo_uid: str | None = None


def _to_response(n) -> NotificationResponse:
    return NotificationResponse(
        id=n.id,
        title=n.title,
        content=n.content,
        notification_type=n.notification_type,
        related_todo_uid=n.related_todo_uid,
        is_read=n.is_read,
        created_at=n.created_at.isoformat() if n.created_at else None,
        read_at=n.read_at.isoformat() if n.read_at else None,
    )


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    user: UserDep,
    session: SessionDep,
    skip: int = 0,
    limit: int = 50,
    unread_only: bool = False,
):
    """获取通知列表（分页，按时间倒序）"""
    notifs = await push_service.get_notifications(session, user.id, skip, limit, unread_only)
    return [_to_response(n) for n in notifs]


@router.post("", response_model=NotificationResponse)
async def create_notification(req: CreateNotificationRequest, user: UserDep, session: SessionDep):
    """创建通知并推送"""
    notif = await push_service.create_notification(
        session,
        user_id=user.id,
        title=req.title,
        content=req.content,
        notification_type=req.notification_type,
        related_todo_uid=req.related_todo_uid,
    )
    return _to_response(notif)


@router.put("/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: UserDep, session: SessionDep):
    """标记通知为已读"""
    ok = await push_service.mark_read(session, notification_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="通知不存在")
    return {"success": True}


@router.put("/read-all")
async def mark_all_read(user: UserDep, session: SessionDep):
    """标记所有通知为已读"""
    count = await push_service.mark_all_read(session, user.id)
    return {"success": True, "count": count}


@router.delete("/{notification_id}")
async def delete_notification(notification_id: str, user: UserDep, session: SessionDep):
    """删除通知"""
    ok = await push_service.delete_notification(session, notification_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="通知不存在")
    return {"success": True}
