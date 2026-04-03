"""Sensor node remote control API.

Sensor polls GET /api/sensor/config for desired configuration.
Sensor reports status via POST /api/sensor/heartbeat.
Frontend queries GET /api/sensor/nodes to display connected sensors.
"""

from __future__ import annotations

import time
import uuid
from collections import defaultdict
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()

router = APIRouter(prefix="/api/sensor", tags=["sensor-control"])

_sensor_nodes: dict[str, dict[str, Any]] = {}
_notification_queues: dict[str, list[dict[str, Any]]] = defaultdict(list)
_runtime_overrides: dict[str, Any] = {}

_OFFLINE_THRESHOLD_SECONDS = 90


class AudioDeviceInfo(BaseModel):
    id: int
    name: str
    channels: int = 1


class HeartbeatRequest(BaseModel):
    node_id: str
    screenshot_running: bool = False
    proactive_ocr_running: bool = False
    audio_running: bool = False
    audio_loopback_running: bool = False
    screenshot_interval: float = 10.0
    proactive_ocr_interval: float = 1.0
    last_screenshot_at: str | None = None
    last_proactive_ocr_at: str | None = None
    uptime_seconds: float = 0
    audio_devices: list[AudioDeviceInfo] = []
    audio_device_selected: str | int | None = None


@router.post("/heartbeat")
async def sensor_heartbeat(req: HeartbeatRequest):
    _sensor_nodes[req.node_id] = {
        **req.model_dump(),
        "last_seen": time.time(),
        "online": True,
    }
    return {"ok": True}


def _read_sensor_config() -> dict[str, Any]:
    cfg: dict[str, Any] = {
        "screenshot_enabled": settings.get("sensor.screenshot_enabled", True),
        "screenshot_interval": float(settings.get("sensor.screenshot_interval", 10.0)),
        "proactive_ocr_enabled": settings.get("sensor.proactive_ocr_enabled", True),
        "proactive_ocr_interval": float(settings.get("sensor.proactive_ocr_interval", 1.0)),
        "audio_enabled": settings.get("sensor.audio_enabled", True),
        "audio_loopback_enabled": settings.get("sensor.audio_loopback_enabled", True),
        "recorder_blacklist_enabled": settings.get("jobs.recorder.params.blacklist.enabled", False),
        "recorder_blacklist_apps": settings.get("jobs.recorder.params.blacklist.apps", []),
    }
    audio_device = _runtime_overrides.get("audio_device", settings.get("sensor.audio_device"))
    if audio_device is not None:
        cfg["audio_device"] = audio_device
    return cfg


@router.get("/config")
async def get_sensor_config():
    return _read_sensor_config()


@router.get("/nodes")
async def list_sensor_nodes():
    now = time.time()
    nodes = []
    for info in _sensor_nodes.values():
        info["online"] = (now - info.get("last_seen", 0)) < _OFFLINE_THRESHOLD_SECONDS
        nodes.append(info)
    return {"nodes": nodes}


# ---------------------------------------------------------------------------
# Audio device management
# ---------------------------------------------------------------------------


@router.get("/nodes/{node_id}/audio-devices")
async def get_audio_devices(node_id: str):
    """Return the list of audio input devices last reported by a sensor node."""
    node = _sensor_nodes.get(node_id)
    if node is None:
        return {"devices": [], "error": f"Node '{node_id}' not found"}
    return {
        "devices": node.get("audio_devices", []),
        "selected": node.get("audio_device_selected"),
        "config_device": _runtime_overrides.get(
            "audio_device", settings.get("sensor.audio_device")
        ),
    }


class SetAudioDeviceRequest(BaseModel):
    device: str | int | None = None


@router.put("/audio-device")
async def set_audio_device(req: SetAudioDeviceRequest):
    """Set the preferred audio input device. Sensor picks it up on next config poll.

    Pass ``null`` / omit ``device`` to revert to auto-detection.
    """
    if req.device is None:
        _runtime_overrides.pop("audio_device", None)
    else:
        _runtime_overrides["audio_device"] = req.device
    return {"ok": True, "audio_device": req.device}


# ---------------------------------------------------------------------------
# Notification queue — Center writes, Sensor polls
# ---------------------------------------------------------------------------


class NotificationLinkItem(BaseModel):
    name: str
    url: str
    platform: str = ""


class NotificationRequest(BaseModel):
    node_id: str = ""
    title: str = "通知"
    subtitle: str = ""
    links: list[NotificationLinkItem] = []


@router.post("/notifications")
async def push_notification(req: NotificationRequest):
    """向指定 sensor 节点推送一条弹窗通知。node_id 为空则广播给所有节点。"""
    entry: dict[str, Any] = {
        "id": uuid.uuid4().hex[:12],
        "title": req.title,
        "subtitle": req.subtitle,
        "links": [lk.model_dump() for lk in req.links],
        "created_at": time.time(),
    }
    targets: list[str] = []
    if req.node_id:
        _notification_queues[req.node_id].append(entry)
        targets.append(req.node_id)
    else:
        known = set(_sensor_nodes.keys())
        if not known:
            known = {"__broadcast__"}
        for nid in known:
            _notification_queues[nid].append(entry)
            targets.append(nid)
    logger.info("Notification queued for %s: %s", targets, req.title)
    return {"status": "ok", "targets": targets, "notification_id": entry["id"]}


@router.get("/notifications")
async def pull_notifications(node_id: str):
    """Sensor 节点拉取并消费待推送的通知。"""
    items = _notification_queues.pop(node_id, [])
    broadcast = _notification_queues.pop("__broadcast__", [])
    all_items = broadcast + items
    return {"notifications": all_items}
