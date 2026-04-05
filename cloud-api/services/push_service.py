"""多渠道通知推送服务 — WebSocket / FCM / APNs"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.notification import CloudNotification
from models.sync import SyncDevice


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


# ========== FCM (Firebase Cloud Messaging) ==========

_fcm_app = None


def _init_fcm():
    """Lazy-init Firebase Admin SDK. Requires FIREBASE_CREDENTIALS_PATH env."""
    global _fcm_app  # noqa: PLW0603
    if _fcm_app is not None:
        return True
    try:
        import os  # noqa: PLC0415

        import firebase_admin  # noqa: PLC0415
        from firebase_admin import credentials  # noqa: PLC0415
        cred_path = os.environ.get("FIREBASE_CREDENTIALS_PATH")
        if not cred_path:
            logger.debug("FIREBASE_CREDENTIALS_PATH not set, FCM disabled")
            return False
        cred = credentials.Certificate(cred_path)
        _fcm_app = firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin SDK initialized")
        return True
    except ImportError:
        logger.debug("firebase-admin not installed, FCM disabled")
        return False
    except Exception as e:
        logger.warning("Failed to initialize Firebase: %s", e)
        return False


async def _send_fcm(token: str, title: str, body: str, data: dict | None = None) -> bool:
    """Send a push notification via FCM."""
    if not _init_fcm():
        return False
    try:
        from firebase_admin import messaging  # noqa: PLC0415

        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            token=token,
        )
        messaging.send(message)
        return True
    except Exception as e:
        logger.warning("FCM send failed: %s", e)
        return False


# ========== Core Push Logic ==========


async def create_notification(
    session: AsyncSession,
    user_id: str,
    title: str,
    content: str,
    notification_type: str | None = None,
    related_todo_uid: str | None = None,
) -> CloudNotification:
    """Create a persistent notification and push to all channels."""
    notif = CloudNotification(
        user_id=user_id,
        title=title,
        content=content,
        notification_type=notification_type,
        related_todo_uid=related_todo_uid,
    )
    session.add(notif)
    await session.commit()
    await session.refresh(notif)

    pushed_channels = await _push_to_all_channels(session, notif)
    notif.is_pushed = bool(pushed_channels)
    notif.push_channels = (
        json.dumps(pushed_channels, ensure_ascii=False) if pushed_channels else None
    )
    session.add(notif)
    await session.commit()

    return notif


async def _push_to_all_channels(
    session: AsyncSession, notif: CloudNotification
) -> list[str]:
    """Push notification through all available channels."""
    channels: list[str] = []

    # 1. WebSocket push (online devices)
    try:
        from routers.sync_ws import broadcast_to_user  # noqa: PLC0415

        await broadcast_to_user(
            notif.user_id,
            {
                "type": "notification",
                "id": notif.id,
                "title": notif.title,
                "content": notif.content,
                "notification_type": notif.notification_type,
                "related_todo_uid": notif.related_todo_uid,
                "created_at": notif.created_at.isoformat() if notif.created_at else None,
            },
        )
        channels.append("websocket")
    except Exception as e:
        logger.debug("WebSocket push skipped: %s", e)

    # 2. FCM push (offline/mobile devices with push_token)
    stmt = select(SyncDevice).where(
        SyncDevice.user_id == notif.user_id,
        SyncDevice.push_enabled == True,  # noqa: E712
        SyncDevice.push_token != None,  # noqa: E711
    )
    result = await session.execute(stmt)
    devices = result.scalars().all()

    for device in devices:
        ok = await _send_fcm(
            device.push_token,
            notif.title,
            notif.content,
            data={
                "notification_id": notif.id,
                "notification_type": notif.notification_type or "",
                "related_todo_uid": notif.related_todo_uid or "",
            },
        )
        if ok:
            channels.append(f"fcm:{device.device_type}")

    return channels


async def get_notifications(
    session: AsyncSession, user_id: str, skip: int = 0, limit: int = 50, unread_only: bool = False
) -> list[CloudNotification]:
    stmt = select(CloudNotification).where(CloudNotification.user_id == user_id)
    if unread_only:
        stmt = stmt.where(CloudNotification.is_read == False)  # noqa: E712
    stmt = stmt.order_by(CloudNotification.created_at.desc()).offset(skip).limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def mark_read(session: AsyncSession, notification_id: str, user_id: str) -> bool:
    notif = await session.get(CloudNotification, notification_id)
    if not notif or notif.user_id != user_id:
        return False
    notif.is_read = True
    notif.read_at = _utc_now()
    session.add(notif)
    await session.commit()
    return True


async def mark_all_read(session: AsyncSession, user_id: str) -> int:
    stmt = select(CloudNotification).where(
        CloudNotification.user_id == user_id,
        CloudNotification.is_read == False,  # noqa: E712
    )
    result = await session.execute(stmt)
    count = 0
    for notif in result.scalars().all():
        notif.is_read = True
        notif.read_at = _utc_now()
        session.add(notif)
        count += 1
    await session.commit()
    return count


async def delete_notification(session: AsyncSession, notification_id: str, user_id: str) -> bool:
    notif = await session.get(CloudNotification, notification_id)
    if not notif or notif.user_id != user_id:
        return False
    await session.delete(notif)
    await session.commit()
    return True
