"""系统资源相关的 Pydantic 模型"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ProcessInfo(BaseModel):
    pid: int
    name: str
    cmdline: str
    memory_mb: float
    memory_vms_mb: float
    cpu_percent: float


class SystemResourcesResponse(BaseModel):
    memory: dict[str, float]
    cpu: dict[str, Any]
    disk: dict[str, dict[str, float]]
    lifetrace_processes: list[ProcessInfo]
    storage: dict[str, Any]
    summary: dict[str, Any]
    timestamp: datetime


class CapabilitiesResponse(BaseModel):
    enabled_modules: list[str]
    available_modules: list[str]
    disabled_modules: list[str]
    missing_deps: dict[str, list[str]]
