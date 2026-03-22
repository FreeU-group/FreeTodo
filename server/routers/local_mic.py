"""本地麦克风采集路由

提供 REST API 控制本地麦克风采集（开始/停止/状态/设备列表），
以及 WebSocket 端点接收实时转录结果。

前端不再需要 getUserMedia，只需：
  1. POST /local-mic/start  → 后端开始采集
  2. WS   /local-mic/stream → 接收实时转录/提取结果
  3. POST /local-mic/stop   → 后端停止采集
"""

from __future__ import annotations

import contextlib
import json
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from services.local_mic_capture import (
    get_capture,
    get_or_create_capture,
    list_audio_devices,
)
from util.logging_config import get_logger

if TYPE_CHECKING:
    from services.asr_client import ASRClient
    from services.audio_service import AudioService

logger = get_logger()


class LocalMicStartRequest(BaseModel):
    device: int | None = None
    is_24x7: bool = False


async def _handle_local_mic_stream(websocket: WebSocket) -> None:
    """WebSocket 端点内部逻辑：订阅实时转录结果。"""
    await websocket.accept()

    capture = await get_capture()
    if not capture or not capture.is_active:
        await websocket.send_json(
            {
                "header": {"name": "TaskFailed"},
                "payload": {
                    "error": "本地麦克风未在运行。请先调用 POST /api/audio/local-mic/start",
                },
            }
        )
        await websocket.close()
        return

    capture.subscribe(websocket)
    logger.info("[local-mic] WebSocket subscriber connected")

    try:
        await _listen_ws_commands(websocket, capture)
    finally:
        capture.unsubscribe(websocket)
        logger.info("[local-mic] WebSocket subscriber disconnected")


async def _listen_ws_commands(websocket: WebSocket, capture: Any) -> None:
    """等待客户端消息直到断开连接。"""
    while True:
        try:
            data = await websocket.receive()
            if data.get("type") == "websocket.disconnect":
                break
            if "text" in data and _is_stop_command(data["text"]):
                await capture.stop()
                break
        except WebSocketDisconnect:
            break


def _is_stop_command(text: str) -> bool:
    with contextlib.suppress(json.JSONDecodeError):
        msg = json.loads(text)
        return msg.get("type") == "stop"
    return False


def register_local_mic_routes(
    *,
    router: APIRouter,
    asr_client: ASRClient,
    audio_service: AudioService,
) -> None:
    """将本地麦克风端点注册到路由。"""

    @router.post("/local-mic/start")
    async def start_local_mic(request: LocalMicStartRequest) -> dict[str, Any]:
        """启动本地麦克风采集。"""
        capture = await get_or_create_capture(asr_client, audio_service, device=request.device)
        if capture.is_active:
            return {"status": "already_running", **capture.get_status()}
        await capture.start(is_24x7=request.is_24x7)
        return {"status": "started", **capture.get_status()}

    @router.post("/local-mic/stop")
    async def stop_local_mic() -> dict[str, Any]:
        """停止本地麦克风采集。"""
        capture = await get_capture()
        if not capture or not capture.is_active:
            return {"status": "not_running"}
        status_snapshot = capture.get_status()
        await capture.stop()
        return {"status": "stopped", **status_snapshot}

    @router.get("/local-mic/status")
    async def local_mic_status() -> dict[str, Any]:
        """查询本地麦克风采集状态。"""
        capture = await get_capture()
        if not capture:
            return {"is_active": False}
        return capture.get_status()

    @router.get("/local-mic/devices")
    async def local_mic_devices() -> dict[str, Any]:
        """列出系统中所有可用的音频输入设备。"""
        try:
            devices = list_audio_devices()
            return {"devices": devices}
        except Exception as exc:
            logger.error(f"Failed to list audio devices: {exc}")
            return {"devices": [], "error": str(exc)}

    @router.websocket("/local-mic/stream")
    async def local_mic_stream(websocket: WebSocket) -> None:
        """WebSocket 端点：订阅实时转录结果。

        前端连接此端点后，会收到与原 /transcribe 相同格式的消息：
        - TranscriptionResultChanged  (转录文本)
        - ExtractionChanged           (实时提取的待办)
        - TaskFailed                   (错误)
        """
        await _handle_local_mic_stream(websocket)
