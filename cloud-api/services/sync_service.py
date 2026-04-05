"""同步核心服务 — 变更接收、冲突解决、changelog 写入、广播"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.chat import CloudChat, CloudMessage
from models.sync import SyncChangelog, SyncCursor, SyncDevice
from models.todo import CloudTodo

ENTITY_MODEL_MAP = {
    "todo": CloudTodo,
    "chat": CloudChat,
    "message": CloudMessage,
}

ENTITY_PK_MAP = {
    "todo": "uid",
    "chat": "session_id",
    "message": "uid",
}


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


async def register_device(
    session: AsyncSession,
    user_id: str,
    device_id: str,
    device_name: str | None = None,
    device_type: str = "desktop",
    push_token: str | None = None,
) -> SyncDevice:
    existing = await session.get(SyncDevice, device_id)
    if existing:
        existing.user_id = user_id
        existing.device_name = device_name or existing.device_name
        existing.device_type = device_type
        existing.push_token = push_token if push_token is not None else existing.push_token
        existing.last_seen_at = _utc_now()
        existing.updated_at = _utc_now()
        session.add(existing)
        await session.commit()
        return existing

    device = SyncDevice(
        id=device_id,
        user_id=user_id,
        device_name=device_name,
        device_type=device_type,
        push_token=push_token,
        last_seen_at=_utc_now(),
    )
    session.add(device)
    await session.commit()
    return device


async def unregister_device(session: AsyncSession, device_id: str) -> bool:
    device = await session.get(SyncDevice, device_id)
    if not device:
        return False
    await session.delete(device)
    # Also clean cursors
    stmt = select(SyncCursor).where(SyncCursor.device_id == device_id)
    result = await session.execute(stmt)
    for cursor in result.scalars().all():
        await session.delete(cursor)
    await session.commit()
    return True


async def update_device_seen(session: AsyncSession, device_id: str) -> None:
    device = await session.get(SyncDevice, device_id)
    if device:
        device.last_seen_at = _utc_now()
        session.add(device)
        await session.commit()


async def get_device_cursors(
    session: AsyncSession, device_id: str
) -> dict[str, int]:
    stmt = select(SyncCursor).where(SyncCursor.device_id == device_id)
    result = await session.execute(stmt)
    return {c.entity_type: c.last_cursor for c in result.scalars().all()}


async def update_cursor(
    session: AsyncSession, device_id: str, entity_type: str, cursor_value: int
) -> None:
    stmt = select(SyncCursor).where(
        SyncCursor.device_id == device_id, SyncCursor.entity_type == entity_type
    )
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        existing.last_cursor = cursor_value
        existing.updated_at = _utc_now()
        session.add(existing)
    else:
        session.add(
            SyncCursor(
                device_id=device_id,
                entity_type=entity_type,
                last_cursor=cursor_value,
                updated_at=_utc_now(),
            )
        )
    await session.commit()


async def get_changes_since(
    session: AsyncSession, user_id: str, entity_type: str, since_cursor: int, limit: int = 100
) -> list[SyncChangelog]:
    stmt = (
        select(SyncChangelog)
        .where(
            SyncChangelog.user_id == user_id,
            SyncChangelog.entity_type == entity_type,
            SyncChangelog.id > since_cursor,
        )
        .order_by(SyncChangelog.id)
        .limit(limit)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def _write_changelog(
    session: AsyncSession,
    user_id: str,
    entity_type: str,
    entity_id: str,
    operation: str,
    source_device_id: str | None,
    snapshot_dict: dict | None,
) -> SyncChangelog:
    entry = SyncChangelog(
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        operation=operation,
        source_device_id=source_device_id,
        snapshot=(
            json.dumps(snapshot_dict, ensure_ascii=False, default=str)
            if snapshot_dict
            else None
        ),
        changed_at=_utc_now(),
    )
    session.add(entry)
    await session.flush()
    return entry


def _model_to_dict(obj) -> dict:
    """Convert a SQLModel instance to a plain dict (excluding None-only internal attrs)."""
    data = {}
    for key in obj.__class__.__fields__:
        data[key] = getattr(obj, key)
    return data


def _apply_data_to_model(model_instance, data: dict, skip_keys: set | None = None):
    """Apply data dict fields to an existing model instance."""
    skip = skip_keys or set()
    for key, value in data.items():
        if key in skip:
            continue
        if hasattr(model_instance, key):
            setattr(model_instance, key, value)


async def apply_change(  # noqa: PLR0911, PLR0913, PLR0915
    session: AsyncSession,
    user_id: str,
    entity_type: str,
    entity_id: str,
    operation: str,
    version: int,
    data: dict | None,
    source_device_id: str | None = None,
) -> dict:
    """Apply a single change from a device. Returns result dict with status.

    Returns:
        {"status": "applied" | "conflict" | "created", "version": int, "changelog_id": int, ...}
    """
    model_cls = ENTITY_MODEL_MAP.get(entity_type)
    pk_field = ENTITY_PK_MAP.get(entity_type)
    if not model_cls or not pk_field:
        return {"status": "error", "detail": f"Unknown entity_type: {entity_type}"}

    if operation == "delete":
        existing = await session.get(model_cls, entity_id)
        if existing:
            existing.is_deleted = True
            existing.updated_at = _utc_now()
            existing.version = (existing.version or 0) + 1
            session.add(existing)
            changelog = await _write_changelog(
                session, user_id, entity_type, entity_id, "delete", source_device_id, None
            )
            await session.commit()
            return {
                "status": "applied",
                "version": existing.version,
                "changelog_id": changelog.id,
            }
        return {"status": "not_found", "detail": "Entity not found for deletion"}

    if operation == "create":
        existing = await session.get(model_cls, entity_id)
        if existing and not existing.is_deleted:
            # Entity already exists — treat as update
            return await apply_change(
                session, user_id, entity_type, entity_id,
                "update", version, data, source_device_id,
            )

        if existing and existing.is_deleted:
            # Un-delete and update
            _apply_data_to_model(existing, data or {}, skip_keys={"version", pk_field})
            existing.is_deleted = False
            existing.version = 1
            existing.user_id = user_id
            existing.updated_at = _utc_now()
            session.add(existing)
        else:
            obj_data = dict(data) if data else {}
            obj_data[pk_field] = entity_id
            obj_data["user_id"] = user_id
            obj_data["version"] = 1
            obj_data.pop("is_deleted", None)
            now = _utc_now()
            obj_data.setdefault("created_at", now)
            obj_data.setdefault("updated_at", now)
            obj = model_cls(**obj_data)
            session.add(obj)

        snapshot = dict(data) if data else {}
        snapshot[pk_field] = entity_id
        changelog = await _write_changelog(
            session, user_id, entity_type, entity_id, "create", source_device_id, snapshot
        )
        await session.commit()
        return {"status": "created", "version": 1, "changelog_id": changelog.id}

    # operation == "update"
    existing = await session.get(model_cls, entity_id)
    if not existing:
        # Promote to create
        return await apply_change(
            session, user_id, entity_type, entity_id,
            "create", version, data, source_device_id,
        )

    cloud_version = existing.version or 0

    if version == cloud_version:
        # No conflict — apply
        _apply_data_to_model(existing, data or {}, skip_keys={"version", pk_field, "user_id"})
        existing.version = cloud_version + 1
        existing.updated_at = _utc_now()
        session.add(existing)

        snapshot = _model_to_dict(existing)
        changelog = await _write_changelog(
            session, user_id, entity_type, entity_id, "update", source_device_id, snapshot
        )
        await session.commit()
        return {
            "status": "applied",
            "version": existing.version,
            "changelog_id": changelog.id,
        }

    # Version mismatch — compare timestamps (last-write-wins)
    incoming_ts = _parse_dt(data.get("updated_at")) if data else None
    cloud_ts = existing.updated_at

    if incoming_ts and cloud_ts and incoming_ts > cloud_ts:
        _apply_data_to_model(existing, data or {}, skip_keys={"version", pk_field, "user_id"})
        existing.version = cloud_version + 1
        existing.updated_at = _utc_now()
        session.add(existing)

        snapshot = _model_to_dict(existing)
        changelog = await _write_changelog(
            session, user_id, entity_type, entity_id, "update", source_device_id, snapshot
        )
        await session.commit()
        logger.info(
            "Conflict resolved (incoming wins): %s/%s v%d->v%d",
            entity_type, entity_id, cloud_version, existing.version,
        )
        return {
            "status": "applied",
            "version": existing.version,
            "changelog_id": changelog.id,
        }

    # Cloud version wins
    server_data = _model_to_dict(existing)
    return {
        "status": "conflict",
        "server_version": cloud_version,
        "server_data": server_data,
        "resolution": "server_wins",
    }


async def get_sync_status(
    session: AsyncSession, device_id: str
) -> dict:
    device = await session.get(SyncDevice, device_id)
    cursors = await get_device_cursors(session, device_id)
    return {
        "device_id": device_id,
        "cursors": cursors,
        "last_seen_at": device.last_seen_at.isoformat() if device and device.last_seen_at else None,
    }
