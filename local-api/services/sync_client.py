"""云端同步客户端 — WebSocket 长连接、自动重连、变更队列"""

from __future__ import annotations

import asyncio
import json
from collections import deque
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()

_client: SyncClient | None = None


def _utc_now() -> datetime:
    return datetime.now(UTC)


class SyncClient:
    """WebSocket client that maintains a persistent connection to cloud-api for real-time sync."""

    def __init__(self):
        self._ws = None
        self._connected = False
        self._device_id = str(uuid4())
        self._cloud_token: str | None = None
        self._change_queue: deque[dict[str, Any]] = deque(maxlen=10000)
        self._task: asyncio.Task | None = None
        self._heartbeat_task: asyncio.Task | None = None
        self._reconnect_interval = int(settings.get("sync.reconnect_interval", 5))
        self._max_reconnect_interval = int(settings.get("sync.max_reconnect_interval", 300))
        self._heartbeat_interval = int(settings.get("sync.heartbeat_interval", 30))
        self._batch_size = int(settings.get("sync.batch_size", 50))
        self._cursors: dict[str, int] = {"todo": 0, "chat": 0, "message": 0}
        self._running = False
        self._change_handlers: list = []

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def device_id(self) -> str:
        return self._device_id

    def set_cloud_token(self, token: str) -> None:
        self._cloud_token = token

    def register_change_handler(self, handler) -> None:
        """Register a callback for incoming remote changes: handler(entity_type, operation, data)."""
        self._change_handlers.append(handler)

    async def start(self, cloud_token: str) -> None:
        """Start the sync connection in the background."""
        self._cloud_token = cloud_token
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("SyncClient started (device=%s)", self._device_id)

    async def stop(self) -> None:
        """Stop the sync connection."""
        self._running = False
        if self._heartbeat_task and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()
        if self._task and not self._task.done():
            self._task.cancel()
        if self._ws:
            import contextlib  # noqa: PLC0415

            with contextlib.suppress(Exception):
                await self._ws.close()
        self._connected = False
        logger.info("SyncClient stopped")

    def enqueue_change(
        self,
        entity_type: str,
        entity_id: str,
        operation: str,
        version: int = 0,
        data: dict | None = None,
    ) -> None:
        """Queue a local change for sync to cloud."""
        change = {
            "type": "change",
            "entity_type": entity_type,
            "entity_id": entity_id,
            "operation": operation,
            "version": version,
            "data": data,
            "client_ts": _utc_now().isoformat(),
        }
        self._change_queue.append(change)
        logger.debug("Enqueued sync change: %s/%s %s", entity_type, entity_id, operation)

    async def _run_loop(self) -> None:
        """Main connection loop with exponential backoff reconnect."""
        interval = self._reconnect_interval
        while self._running:
            try:
                await self._connect_and_process()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("SyncClient connection error")

            if not self._running:
                break

            logger.info("SyncClient reconnecting in %ds...", interval)
            await asyncio.sleep(interval)
            interval = min(interval * 2, self._max_reconnect_interval)

    async def _connect_and_process(self) -> None:
        """Establish WebSocket connection and process messages."""
        if not self._cloud_token:
            logger.warning("SyncClient: no cloud token, skipping connect")
            return

        ws_url = str(settings.get("sync.ws_url", "ws://127.0.0.1:8000/api/v1/sync/ws"))
        url = f"{ws_url}?token={self._cloud_token}&device_id={self._device_id}"

        try:
            import websockets  # noqa: PLC0415

            async with websockets.connect(url) as ws:
                self._ws = ws
                self._connected = True
                logger.info("SyncClient connected to %s", ws_url)

                # Send sync_init
                init_msg = json.dumps({"type": "sync_init", "cursors": self._cursors})
                await ws.send(init_msg)

                # Start heartbeat
                self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

                # Flush queued changes
                await self._flush_queue()

                # Process incoming messages
                async for raw in ws:
                    if not self._running:
                        break
                    try:
                        msg = json.loads(raw)
                        await self._handle_message(msg)
                    except json.JSONDecodeError:
                        logger.warning("SyncClient: invalid JSON from server")
        except ImportError:
            logger.error("websockets package not installed, sync disabled")
            self._running = False
        finally:
            self._connected = False
            if self._heartbeat_task and not self._heartbeat_task.done():
                self._heartbeat_task.cancel()

    async def _heartbeat_loop(self) -> None:
        """Send periodic pings to keep the connection alive."""
        try:
            while self._running and self._connected and self._ws:
                await asyncio.sleep(self._heartbeat_interval)
                if self._ws and self._connected:
                    await self._ws.send(json.dumps({"type": "ping"}))
                    await self._flush_queue()
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.debug("Heartbeat error (connection may have closed)")

    async def _flush_queue(self) -> None:
        """Send all queued changes to cloud."""
        if not self._ws or not self._connected:
            return

        batch: list[dict] = []
        while self._change_queue and len(batch) < self._batch_size:
            batch.append(self._change_queue.popleft())

        if not batch:
            return

        if len(batch) == 1:
            await self._ws.send(json.dumps(batch[0]))
        else:
            await self._ws.send(json.dumps({"type": "change_batch", "changes": batch}))

        logger.debug("Flushed %d sync changes", len(batch))

    async def _handle_message(self, msg: dict) -> None:
        """Handle an incoming message from cloud."""
        msg_type = msg.get("type")
        handler = {
            "sync_catchup": self._on_sync_catchup,
            "change": self._on_change,
            "conflict": self._on_conflict,
            "notification": self._on_notification,
            "ack": self._on_ack,
            "batch_ack": self._on_batch_ack,
            "pong": self._on_pong,
            "error": self._on_error,
        }.get(msg_type)
        if handler:
            await handler(msg)
        else:
            logger.debug("Unknown message type: %s", msg_type)

    async def _on_sync_catchup(self, msg: dict) -> None:
        entity_type = msg.get("entity_type", "")
        changes = msg.get("changes", [])
        cursor = msg.get("cursor", 0)
        for change_data in changes:
            await self._invoke_handlers(entity_type, "sync", change_data)
        if cursor:
            self._cursors[entity_type] = cursor
        logger.info(
            "Catchup received: %s (%d changes, cursor=%d)",
            entity_type,
            len(changes),
            cursor,
        )

    async def _on_change(self, msg: dict) -> None:
        entity_type = msg.get("entity_type", "")
        operation = msg.get("operation", "")
        data = msg.get("data")
        changelog_id = msg.get("changelog_id", 0)
        await self._invoke_handlers(entity_type, operation, data)
        if changelog_id and entity_type in self._cursors:
            self._cursors[entity_type] = max(self._cursors[entity_type], changelog_id)

    async def _on_conflict(self, msg: dict) -> None:
        logger.warning(
            "Sync conflict: %s/%s — server v%d wins",
            msg.get("entity_type"),
            msg.get("entity_id"),
            msg.get("server_version", 0),
        )
        await self._invoke_handlers(
            msg.get("entity_type", ""),
            "conflict",
            msg.get("server_data"),
        )

    async def _on_notification(self, msg: dict) -> None:
        logger.info("Remote notification: %s", msg.get("title"))

    async def _on_ack(self, msg: dict) -> None:
        logger.debug("Change acknowledged: changelog_id=%s", msg.get("changelog_id"))

    async def _on_batch_ack(self, msg: dict) -> None:
        logger.debug("Batch acknowledged: %d results", len(msg.get("results", [])))

    async def _on_pong(self, _msg: dict) -> None:
        pass

    async def _on_error(self, msg: dict) -> None:
        logger.warning("Sync server error: %s", msg.get("detail"))

    async def _invoke_handlers(self, entity_type: str, operation: str, data: Any) -> None:
        for handler in self._change_handlers:
            try:
                await handler(entity_type, operation, data)
            except Exception:
                logger.exception("Change handler error")


def get_sync_client() -> SyncClient:
    """Get the global sync client instance."""
    global _client  # noqa: PLW0603
    if _client is None:
        _client = SyncClient()
    return _client


async def start_sync(cloud_token: str) -> None:
    """Start the global sync client if sync is enabled."""
    enabled = settings.get("sync.enabled", False)
    if not enabled:
        logger.debug("Sync is disabled in config")
        return
    client = get_sync_client()
    await client.start(cloud_token)


async def stop_sync() -> None:
    """Stop the global sync client."""
    if _client:
        await _client.stop()
