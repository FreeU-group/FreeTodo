"""初始化向导路由 — 首次启动的引导流程 API"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, UploadFile
from pydantic import BaseModel

from services.config_service import ConfigService
from util.base_paths import get_user_data_dir
from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()

router = APIRouter(prefix="/api/setup", tags=["setup"])

_config_service = ConfigService()


class ScanRequest(BaseModel):
    directory: str
    max_files: int = 500


class ScanResult(BaseModel):
    valid: bool = True
    directory: str
    file_count: int
    files: list[dict[str, Any]]
    scan_time_ms: int


class CompleteRequest(BaseModel):
    user_name: str = ""
    agent_name: str = "Free U"
    scan_directories: list[str] = []
    allowed_apps: list[str] = ["微信"]


@router.get("/status")
async def get_setup_status():
    """检查初始化向导是否已完成。"""
    completed = (
        getattr(settings, "setup", {}).get("completed", False)
        if hasattr(settings, "setup")
        else False
    )
    return {"completed": completed}


@router.post("/scan-directory")
async def scan_directory(req: ScanRequest) -> ScanResult:
    """扫描指定目录下最近修改的文件名（不读取文件内容）。"""
    target = Path(req.directory).expanduser().resolve()
    if not target.exists() or not target.is_dir():
        return ScanResult(
            valid=False, directory=str(target), file_count=0, files=[], scan_time_ms=0
        )

    t0 = time.perf_counter()
    entries: list[dict[str, Any]] = []

    try:
        for root, _dirs, filenames in os.walk(target):
            for fname in filenames:
                if fname.startswith("."):
                    continue
                fp = Path(root) / fname
                try:
                    stat = fp.stat()
                    entries.append(
                        {
                            "name": fname,
                            "path": str(fp),
                            "size": stat.st_size,
                            "modified": stat.st_mtime,
                            "ext": fp.suffix.lower(),
                        }
                    )
                except OSError:
                    continue
                if len(entries) >= req.max_files * 3:
                    break
            if len(entries) >= req.max_files * 3:
                break
    except PermissionError:
        pass

    entries.sort(key=lambda e: e["modified"], reverse=True)
    entries = entries[: req.max_files]

    elapsed = int((time.perf_counter() - t0) * 1000)
    return ScanResult(
        directory=str(target),
        file_count=len(entries),
        files=entries,
        scan_time_ms=elapsed,
    )


@router.post("/complete")
async def complete_setup(req: CompleteRequest):
    """标记初始化向导完成，保存设置到 config。"""
    config_updates: dict[str, Any] = {
        "setup.completed": True,
        "setup.user_name": req.user_name,
        "setup.agent_name": req.agent_name,
        "setup.scan_directories": req.scan_directories,
        "setup.allowed_apps": req.allowed_apps,
    }

    # 将第一个扫描目录设为 Agno Agent 的默认工作区
    if req.scan_directories:
        workspace = req.scan_directories[0]
        config_updates["agno.default_workspace"] = workspace
        logger.info(f"设置 Agno 默认工作区: {workspace}")

    _config_service.save_config(config_updates)
    logger.info(f"初始化向导完成: user={req.user_name}, agent={req.agent_name}")
    return {"success": True}


@router.post("/save-voiceprint")
async def save_voiceprint(file: UploadFile):
    """接收录制的声纹音频文件并保存到本地。"""
    voiceprint_dir = get_user_data_dir() / "voiceprint"
    voiceprint_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    dest = voiceprint_dir / f"voiceprint_{timestamp}.webm"
    content = await file.read()
    dest.write_bytes(content)
    logger.info(f"声纹音频已保存: {dest} ({len(content)} bytes)")
    return {"success": True, "path": str(dest), "size": len(content)}


@router.post("/reset")
async def reset_setup():
    """重置初始化向导，并将 memory 文件夹重命名为 backup。"""
    # 1. 设置 setup.completed = False
    config_updates: dict[str, Any] = {
        "setup.completed": False,
    }
    _config_service.save_config(config_updates)

    # 2. 备份 memory 文件夹
    memory_dir = get_user_data_dir() / "memory"
    if memory_dir.exists() and memory_dir.is_dir():
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        backup_dir = get_user_data_dir() / f"memory_backup_{timestamp}"
        try:
            os.rename(memory_dir, backup_dir)
            logger.info(f"已将 memory 文件夹备份为: {backup_dir}")
            # 重新创建一个空的 memory 文件夹，避免其他模块找不到目录报错
            memory_dir.mkdir(parents=True, exist_ok=True)
            logger.info("已重新创建空的 memory 文件夹")
        except Exception as e:
            logger.error(f"备份 memory 文件夹失败: {e}")

    return {"success": True}
