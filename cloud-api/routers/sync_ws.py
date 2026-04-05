"""WebSocket 实时同步端点 — 双向数据同步 + 在线设备池"""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import async_session_factory
from core.security import decode_token
from services import sync_service

router = APIRouter(tags=["sync-ws"])

# user_id -> {device_id -> WebSocket}
_online_pool: dict[str, dict[str, WebSocket]] = defaultdict(dict)
_pool_lock = asyncio.Lock()

ENTITY_TYPES = ("todo", "chat", "message")


async def _add_connection(user_id: str, device_id: str, ws: WebSocket) -> None:
    async with _pool_lock:
        _online_pool[user_id][device_id] = ws


async def _remove_connection(user_id: str, device_id: str) -> None:
    async with _pool_lock:
        _online_pool[user_id].pop(device_id, None)
        if not _online_pool[user_id]:
            _online_pool.pop(user_id, None)


async def broadcast_to_user(
    user_id: str, message: dict, *, exclude_device: str | None = None
) -> None:
    """Push a message to all devices of a user except the source device."""
    async with _pool_lock:
        devices = dict(_online_pool.get(user_id, {}))

    for dev_id, ws in devices.items():
        if dev_id == exclude_device:
            continue
        try:
            await ws.send_json(message)
        except Exception:
            logger.debug("Failed to broadcast to device %s", dev_id)


def get_online_devices(user_id: str) -> set[str]:
    return set(_online_pool.get(user_id, {}).keys())


def _authenticate(token: str) -> str | None:
    """Decode JWT and return user_id, or None on failure."""
    payload = decode_token(token)
    if payload is None:
        return None
    if payload.get("token_type", "access") != "access":
        return None
    return payload.get("sub")


async def _handle_sync_init(
    session: AsyncSession, user_id: str, device_id: str, ws: WebSocket, data: dict
) -> None:
    """Send catch-up data for each entity type."""
    cursors = data.get("cursors", {})
    for etype in ENTITY_TYPES:
        since = cursors.get(etype, 0)
        changes = await sync_service.get_changes_since(session, user_id, etype, since, limit=200)
        if changes:
            payload = {
                "type": "sync_catchup",
                "entity_type": etype,
                "changes": [
                    json.loads(c.snapshot)
                    if c.snapshot
                    else {"entity_id": c.entity_id, "operation": c.operation}
                    for c in changes
                ],
                "cursor": changes[-1].id,
            }
            await ws.send_json(payload)
            await sync_service.update_cursor(session, device_id, etype, changes[-1].id)
        else:
            payload = {"type": "sync_catchup", "entity_type": etype, "changes": [], "cursor": since}
            await ws.send_json(payload)


async def _handle_change(
    session: AsyncSession, user_id: str, device_id: str, ws: WebSocket, data: dict
) -> None:
    result = await sync_service.apply_change(
        session,
        user_id=user_id,
        entity_type=data["entity_type"],
        entity_id=data["entity_id"],
        operation=data["operation"],
        version=data.get("version", 0),
        data=data.get("data"),
        source_device_id=device_id,
    )

    if result["status"] == "conflict":
        await ws.send_json({
            "type": "conflict",
            "entity_type": data["entity_type"],
            "entity_id": data["entity_id"],
            "server_version": result["server_version"],
            "server_data": result["server_data"],
            "resolution": result["resolution"],
        })
        return

    broadcast_msg = {
        "type": "change",
        "entity_type": data["entity_type"],
        "entity_id": data["entity_id"],
        "operation": data["operation"],
        "version": result.get("version", 1),
        "data": data.get("data"),
        "changelog_id": result.get("changelog_id"),
    }
    await broadcast_to_user(user_id, broadcast_msg, exclude_device=device_id)

    await ws.send_json({
        "type": "ack",
        "changelog_id": result.get("changelog_id"),
        "status": result["status"],
        "version": result.get("version"),
    })


async def _handle_change_batch(
    session: AsyncSession, user_id: str, device_id: str, ws: WebSocket, data: dict
) -> None:
    changes = data.get("changes", [])
    results = []
    for change in changes:
        result = await sync_service.apply_change(
            session,
            user_id=user_id,
            entity_type=change["entity_type"],
            entity_id=change["entity_id"],
            operation=change["operation"],
            version=change.get("version", 0),
            data=change.get("data"),
            source_device_id=device_id,
        )
        results.append(result)

        if result["status"] != "conflict":
            broadcast_msg = {
                "type": "change",
                "entity_type": change["entity_type"],
                "entity_id": change["entity_id"],
                "operation": change["operation"],
                "version": result.get("version", 1),
                "data": change.get("data"),
                "changelog_id": result.get("changelog_id"),
            }
            await broadcast_to_user(user_id, broadcast_msg, exclude_device=device_id)

    await ws.send_json({"type": "batch_ack", "results": results})


async def _handle_ack(
    session: AsyncSession, device_id: str, msg: dict
) -> None:
    changelog_id = msg.get("changelog_id")
    if changelog_id:
        entity_type = msg.get("entity_type", "todo")
        await sync_service.update_cursor(
            session, device_id, entity_type, changelog_id
        )


async def _dispatch_message(
    session: AsyncSession,
    user_id: str,
    device_id: str,
    ws: WebSocket,
    msg: dict,
) -> None:
    """Route an incoming WS message to the appropriate handler."""
    msg_type = msg.get("type")
    if msg_type == "sync_init":
        await _handle_sync_init(session, user_id, device_id, ws, msg)
    elif msg_type == "change":
        await _handle_change(session, user_id, device_id, ws, msg)
    elif msg_type == "change_batch":
        await _handle_change_batch(session, user_id, device_id, ws, msg)
    elif msg_type == "ack":
        await _handle_ack(session, device_id, msg)
    elif msg_type == "ping":
        await ws.send_json({"type": "pong"})
        await sync_service.update_device_seen(session, device_id)
    else:
        detail = f"Unknown message type: {msg_type}"
        await ws.send_json({"type": "error", "detail": detail})


@router.websocket("/api/v1/sync/ws")
async def sync_websocket(ws: WebSocket):
    """Real-time bidirectional sync over WebSocket.

    Query params:
        token: JWT access token
        device_id: unique device identifier
    """
    token = ws.query_params.get("token")
    device_id = ws.query_params.get("device_id")

    if not token or not device_id:
        await ws.close(code=4001, reason="Missing token or device_id")
        return

    user_id = _authenticate(token)
    if not user_id:
        await ws.close(code=4003, reason="Invalid token")
        return

    await ws.accept()
    await _add_connection(user_id, device_id, ws)
    logger.info("Sync WS connected: user=%s device=%s", user_id, device_id)

    try:
        async with async_session_factory() as session:
            await sync_service.register_device(session, user_id, device_id)

        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "detail": "Invalid JSON"})
                continue

            async with async_session_factory() as session:
                await _dispatch_message(session, user_id, device_id, ws, msg)

    except WebSocketDisconnect:
        logger.info("Sync WS disconnected: user=%s device=%s", user_id, device_id)
    except Exception:
        logger.exception("Sync WS error: user=%s device=%s", user_id, device_id)
    finally:
        await _remove_connection(user_id, device_id)
