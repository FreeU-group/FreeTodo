"""Sensor node remote control API.

Sensor polls GET /api/sensor/config for desired configuration.
Sensor reports status via POST /api/sensor/heartbeat.
Frontend queries GET /api/sensor/nodes to display connected sensors.
"""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()

router = APIRouter(prefix="/api/sensor", tags=["sensor-control"])

_sensor_nodes: dict[str, dict[str, Any]] = {}

_OFFLINE_THRESHOLD_SECONDS = 90


class HeartbeatRequest(BaseModel):
    node_id: str
    screenshot_running: bool = False
    proactive_ocr_running: bool = False
    screenshot_interval: float = 10.0
    proactive_ocr_interval: float = 1.0
    last_screenshot_at: str | None = None
    last_proactive_ocr_at: str | None = None
    uptime_seconds: float = 0


@router.post("/heartbeat")
async def sensor_heartbeat(req: HeartbeatRequest):
    _sensor_nodes[req.node_id] = {
        **req.model_dump(),
        "last_seen": time.time(),
        "online": True,
    }
    return {"ok": True}


def _read_sensor_config() -> dict[str, Any]:
    return {
        "screenshot_enabled": settings.get("sensor.screenshot_enabled", True),
        "screenshot_interval": float(settings.get("sensor.screenshot_interval", 10.0)),
        "proactive_ocr_enabled": settings.get("sensor.proactive_ocr_enabled", True),
        "proactive_ocr_interval": float(settings.get("sensor.proactive_ocr_interval", 1.0)),
        "recorder_blacklist_enabled": settings.get("jobs.recorder.params.blacklist.enabled", False),
        "recorder_blacklist_apps": settings.get("jobs.recorder.params.blacklist.apps", []),
    }


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
