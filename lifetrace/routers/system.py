"""系统资源相关路由"""

import logging
from datetime import datetime
from pathlib import Path

import psutil
from fastapi import APIRouter, HTTPException, Query

from lifetrace.routers import dependencies as deps
from lifetrace.schemas.stats import StatisticsResponse
from lifetrace.schemas.system import ProcessInfo, SystemResourcesResponse

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/statistics", response_model=StatisticsResponse)
async def get_statistics():
    """获取系统统计信息"""
    stats = deps.db_manager.get_statistics()
    return StatisticsResponse(**stats)


@router.post("/cleanup")
async def cleanup_old_data(days: int = Query(30, ge=1)):
    """清理旧数据"""
    try:
        deps.db_manager.cleanup_old_data(days)
        return {"success": True, "message": f"清理了 {days} 天前的数据"}
    except Exception as e:
        logging.error(f"清理数据失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/queue/status")
async def get_queue_status():
    """获取处理队列状态"""
    try:
        with deps.db_manager.get_session() as session:
            from lifetrace.storage.models import ProcessingQueue

            pending_count = session.query(ProcessingQueue).filter_by(status="pending").count()
            processing_count = session.query(ProcessingQueue).filter_by(status="processing").count()
            completed_count = session.query(ProcessingQueue).filter_by(status="completed").count()
            failed_count = session.query(ProcessingQueue).filter_by(status="failed").count()

            return {
                "pending": pending_count,
                "processing": processing_count,
                "completed": completed_count,
                "failed": failed_count,
                "total": pending_count + processing_count + completed_count + failed_count,
            }

    except Exception as e:
        logging.error(f"获取队列状态失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/system-resources", response_model=SystemResourcesResponse)
async def get_system_resources():
    """获取系统资源使用情况"""
    try:
        # 获取LifeTrace相关进程
        lifetrace_processes = []
        total_memory = 0
        total_cpu = 0

        for proc in psutil.process_iter(["pid", "name", "cmdline", "memory_info"]):
            try:
                cmdline = " ".join(proc.info["cmdline"]) if proc.info["cmdline"] else ""

                if any(
                    keyword in cmdline.lower()
                    for keyword in [
                        "lifetrace",
                        "lifetrace.recorder",
                        "lifetrace.processor",
                        "lifetrace.ocr",
                        "lifetrace.jobs.recorder",
                        "lifetrace.jobs.processor",
                        "lifetrace.jobs.ocr",
                        "recorder.py",
                        "processor.py",
                        "ocr.py",
                        "server.py",
                        "start_all_services.py",
                    ]
                ):
                    # 使用非阻塞的CPU百分比获取，避免卡死
                    try:
                        cpu_percent = proc.cpu_percent(interval=None)  # 非阻塞调用
                    except:  # noqa: E722
                        cpu_percent = 0.0
                    memory_mb = proc.info["memory_info"].rss / 1024 / 1024
                    memory_vms_mb = proc.info["memory_info"].vms / 1024 / 1024

                    process_info = ProcessInfo(
                        pid=proc.info["pid"],
                        name=proc.info["name"],
                        cmdline=cmdline,
                        memory_mb=memory_mb,
                        memory_vms_mb=memory_vms_mb,
                        cpu_percent=cpu_percent,
                    )
                    lifetrace_processes.append(process_info)
                    total_memory += memory_mb
                    total_cpu += cpu_percent

            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        # 获取系统资源信息
        memory = psutil.virtual_memory()
        # 使用非阻塞的CPU百分比获取，避免卡死
        cpu_percent = psutil.cpu_percent(interval=None)  # 非阻塞调用
        cpu_count = psutil.cpu_count()

        # 获取磁盘信息
        disk_usage = {}
        for partition in psutil.disk_partitions():
            try:
                usage = psutil.disk_usage(partition.mountpoint)
                disk_usage[partition.device] = {
                    "total_gb": usage.total / 1024**3,
                    "used_gb": usage.used / 1024**3,
                    "free_gb": usage.free / 1024**3,
                    "percent": (usage.used / usage.total) * 100,
                }
            except PermissionError:
                continue

        # 获取数据库和截图存储信息
        db_path = Path(deps.config.database_path)
        db_size_mb = db_path.stat().st_size / 1024 / 1024 if db_path.exists() else 0

        screenshots_path = Path(deps.config.screenshots_dir)
        screenshots_size_mb = 0
        screenshots_count = 0
        if screenshots_path.exists():
            for file_path in screenshots_path.glob("*.png"):
                if file_path.is_file():
                    screenshots_size_mb += file_path.stat().st_size / 1024 / 1024
                    screenshots_count += 1

        total_storage_mb = db_size_mb + screenshots_size_mb

        return SystemResourcesResponse(
            memory={
                "total_gb": memory.total / 1024**3,
                "available_gb": memory.available / 1024**3,
                "used_gb": (memory.total - memory.available) / 1024**3,
                "percent": memory.percent,
            },
            cpu={"percent": cpu_percent, "count": cpu_count},
            disk=disk_usage,
            lifetrace_processes=lifetrace_processes,
            storage={
                "database_mb": db_size_mb,
                "screenshots_mb": screenshots_size_mb,
                "screenshots_count": screenshots_count,
                "total_mb": total_storage_mb,
            },
            summary={
                "total_memory_mb": total_memory,
                "total_cpu_percent": total_cpu,
                "process_count": len(lifetrace_processes),
                "total_storage_mb": total_storage_mb,
            },
            timestamp=datetime.now(),
        )

    except Exception as e:
        logging.error(f"获取系统资源信息失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e
