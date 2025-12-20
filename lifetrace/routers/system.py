"""系统资源相关路由"""

from datetime import datetime

import psutil
from fastapi import APIRouter, HTTPException, Query

from lifetrace.schemas.stats import StatisticsResponse
from lifetrace.schemas.system import ProcessInfo, SystemResourcesResponse
from lifetrace.storage import stats_mgr
from lifetrace.util.logging_config import get_logger
from lifetrace.util.path_utils import get_database_path, get_screenshots_dir

logger = get_logger()

router = APIRouter(prefix="/api", tags=["system"])

# LifeTrace 相关进程关键字
LIFETRACE_KEYWORDS = [
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

# 单位转换常量
BYTES_PER_MB = 1024 * 1024
BYTES_PER_GB = 1024**3


def _get_lifetrace_processes() -> tuple[list[ProcessInfo], float, float]:
    """获取 LifeTrace 相关进程信息

    Returns:
        tuple: (进程列表, 总内存MB, 总CPU百分比)
    """
    processes = []
    total_memory = 0.0
    total_cpu = 0.0

    for proc in psutil.process_iter(["pid", "name", "cmdline", "memory_info"]):
        try:
            cmdline = " ".join(proc.info["cmdline"]) if proc.info["cmdline"] else ""

            if any(keyword in cmdline.lower() for keyword in LIFETRACE_KEYWORDS):
                try:
                    cpu_percent = proc.cpu_percent(interval=None)
                except Exception:
                    cpu_percent = 0.0

                memory_mb = proc.info["memory_info"].rss / BYTES_PER_MB
                memory_vms_mb = proc.info["memory_info"].vms / BYTES_PER_MB

                process_info = ProcessInfo(
                    pid=proc.info["pid"],
                    name=proc.info["name"],
                    cmdline=cmdline,
                    memory_mb=memory_mb,
                    memory_vms_mb=memory_vms_mb,
                    cpu_percent=cpu_percent,
                )
                processes.append(process_info)
                total_memory += memory_mb
                total_cpu += cpu_percent

        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    return processes, total_memory, total_cpu


def _get_disk_usage() -> dict:
    """获取磁盘使用信息"""
    disk_usage = {}
    for partition in psutil.disk_partitions():
        try:
            usage = psutil.disk_usage(partition.mountpoint)
            disk_usage[partition.device] = {
                "total_gb": usage.total / BYTES_PER_GB,
                "used_gb": usage.used / BYTES_PER_GB,
                "free_gb": usage.free / BYTES_PER_GB,
                "percent": (usage.used / usage.total) * 100,
            }
        except PermissionError:
            continue
    return disk_usage


def _get_storage_info() -> dict:
    """获取数据库和截图存储信息"""
    db_path = get_database_path()
    db_size_mb = db_path.stat().st_size / BYTES_PER_MB if db_path.exists() else 0

    screenshots_path = get_screenshots_dir()
    screenshots_size_mb = 0.0
    screenshots_count = 0

    if screenshots_path.exists():
        for file_path in screenshots_path.glob("*.png"):
            if file_path.is_file():
                screenshots_size_mb += file_path.stat().st_size / BYTES_PER_MB
                screenshots_count += 1

    return {
        "database_mb": db_size_mb,
        "screenshots_mb": screenshots_size_mb,
        "screenshots_count": screenshots_count,
        "total_mb": db_size_mb + screenshots_size_mb,
    }


@router.get("/statistics", response_model=StatisticsResponse)
async def get_statistics():
    """获取系统统计信息"""
    stats = stats_mgr.get_statistics()
    return StatisticsResponse(**stats)


@router.post("/cleanup")
async def cleanup_old_data(days: int = Query(30, ge=1)):
    """清理旧数据"""
    try:
        stats_mgr.cleanup_old_data(days)
        return {"success": True, "message": f"清理了 {days} 天前的数据"}
    except Exception as e:
        logger.error(f"清理数据失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/system-resources", response_model=SystemResourcesResponse)
async def get_system_resources():
    """获取系统资源使用情况"""
    try:
        # 获取 LifeTrace 相关进程
        lifetrace_processes, total_memory, total_cpu = _get_lifetrace_processes()

        # 获取系统资源信息
        memory = psutil.virtual_memory()
        cpu_percent = psutil.cpu_percent(interval=None)
        cpu_count = psutil.cpu_count()

        # 获取磁盘和存储信息
        disk_usage = _get_disk_usage()
        storage_info = _get_storage_info()

        return SystemResourcesResponse(
            memory={
                "total_gb": memory.total / BYTES_PER_GB,
                "available_gb": memory.available / BYTES_PER_GB,
                "used_gb": (memory.total - memory.available) / BYTES_PER_GB,
                "percent": memory.percent,
            },
            cpu={"percent": cpu_percent, "count": cpu_count},
            disk=disk_usage,
            lifetrace_processes=lifetrace_processes,
            storage=storage_info,
            summary={
                "total_memory_mb": total_memory,
                "total_cpu_percent": total_cpu,
                "process_count": len(lifetrace_processes),
                "total_storage_mb": storage_info["total_mb"],
            },
            timestamp=datetime.now(),
        )

    except Exception as e:
        logger.error(f"获取系统资源信息失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e
