"""REST 同步端点 — 用于不支持 WebSocket 的场景或初始全量同步"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from dependencies.auth import SessionDep, UserDep
from schemas.sync import (
    DeviceRegisterRequest,
    DeviceRegisterResponse,
    SyncFullRequest,
    SyncPullRequest,
    SyncPullResponse,
    SyncPushRequest,
    SyncPushResponse,
    SyncStatusResponse,
)
from services import sync_service

router = APIRouter(prefix="/api/v1/sync", tags=["sync"])

ENTITY_TYPES = ("todo", "chat", "message")


@router.post("/push", response_model=SyncPushResponse)
async def sync_push(req: SyncPushRequest, user: UserDep, session: SessionDep):
    """批量推送本地变更到云端"""
    results = []
    max_changelog_id = 0
    for change in req.changes:
        result = await sync_service.apply_change(
            session,
            user_id=user.id,
            entity_type=change.entity_type,
            entity_id=change.entity_id,
            operation=change.operation,
            version=change.version,
            data=change.data,
            source_device_id=req.device_id,
        )
        results.append(result)
        cid = result.get("changelog_id", 0) or 0
        max_changelog_id = max(max_changelog_id, cid)

    # Broadcast to WebSocket-connected devices
    from routers.sync_ws import broadcast_to_user  # noqa: PLC0415

    for change, result in zip(req.changes, results, strict=True):
        if result["status"] != "conflict":
            await broadcast_to_user(
                user.id,
                {
                    "type": "change",
                    "entity_type": change.entity_type,
                    "entity_id": change.entity_id,
                    "operation": change.operation,
                    "version": result.get("version", 1),
                    "data": change.data,
                    "changelog_id": result.get("changelog_id"),
                },
                exclude_device=req.device_id,
            )

    return SyncPushResponse(results=results, new_cursor=max_changelog_id)


@router.post("/pull", response_model=SyncPullResponse)
async def sync_pull(req: SyncPullRequest, user: UserDep, session: SessionDep):
    """拉取云端变更"""
    all_changes = []
    new_cursors = {}

    for etype in ENTITY_TYPES:
        since = req.cursors.get(etype, 0)
        changes = await sync_service.get_changes_since(
            session, user.id, etype, since, limit=req.limit
        )
        for c in changes:
            entry = {
                "entity_type": c.entity_type,
                "entity_id": c.entity_id,
                "operation": c.operation,
                "changelog_id": c.id,
                "data": json.loads(c.snapshot) if c.snapshot else None,
            }
            all_changes.append(entry)
        if changes:
            new_cursors[etype] = changes[-1].id
            await sync_service.update_cursor(session, req.device_id, etype, changes[-1].id)
        else:
            new_cursors[etype] = since

    has_more = len(all_changes) >= req.limit
    return SyncPullResponse(changes=all_changes, cursors=new_cursors, has_more=has_more)


@router.get("/status", response_model=SyncStatusResponse)
async def sync_status(device_id: str, user: UserDep, session: SessionDep):  # noqa: ARG001
    """查询设备同步状态"""
    result = await sync_service.get_sync_status(session, device_id)
    return SyncStatusResponse(**result)


@router.post("/device", response_model=DeviceRegisterResponse)
async def register_device(req: DeviceRegisterRequest, user: UserDep, session: SessionDep):
    """注册或更新同步设备"""
    await sync_service.register_device(
        session,
        user_id=user.id,
        device_id=req.device_id,
        device_name=req.device_name,
        device_type=req.device_type,
        push_token=req.push_token,
    )
    return DeviceRegisterResponse(device_id=req.device_id, registered=True)


@router.delete("/device/{device_id}")
async def unregister_device(device_id: str, user: UserDep, session: SessionDep):  # noqa: ARG001
    """注销同步设备"""
    ok = await sync_service.unregister_device(session, device_id)
    if not ok:
        raise HTTPException(status_code=404, detail="设备不存在")
    return {"success": True}


@router.post("/full")
async def sync_full(req: SyncFullRequest, user: UserDep, session: SessionDep):
    """全量同步（首次使用时上传全部本地数据）"""
    stats = {"todo": 0, "chat": 0, "message": 0}

    if req.todos:
        for todo_data in req.todos:
            entity_id = todo_data.get("uid")
            if not entity_id:
                continue
            await sync_service.apply_change(
                session,
                user_id=user.id,
                entity_type="todo",
                entity_id=entity_id,
                operation="create",
                version=0,
                data=todo_data,
                source_device_id=req.device_id,
            )
            stats["todo"] += 1

    if req.chats:
        for chat_data in req.chats:
            entity_id = chat_data.get("session_id")
            if not entity_id:
                continue
            await sync_service.apply_change(
                session,
                user_id=user.id,
                entity_type="chat",
                entity_id=entity_id,
                operation="create",
                version=0,
                data=chat_data,
                source_device_id=req.device_id,
            )
            stats["chat"] += 1

    if req.messages:
        for msg_data in req.messages:
            entity_id = msg_data.get("uid")
            if not entity_id:
                continue
            await sync_service.apply_change(
                session,
                user_id=user.id,
                entity_type="message",
                entity_id=entity_id,
                operation="create",
                version=0,
                data=msg_data,
                source_device_id=req.device_id,
            )
            stats["message"] += 1

    return {"success": True, "synced": stats}
