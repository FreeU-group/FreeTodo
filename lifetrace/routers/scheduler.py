"""
定时任务管理路由
提供定时任务的查询、管理和控制接口
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lifetrace.jobs.scheduler import get_scheduler_manager
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])


# 数据模型
class JobInfo(BaseModel):
    """任务信息"""

    id: str
    name: str | None = None
    func: str
    trigger: str
    next_run_time: str | None = None
    pending: bool = False


class JobListResponse(BaseModel):
    """任务列表响应"""

    total: int
    jobs: list[JobInfo]


class JobOperationRequest(BaseModel):
    """任务操作请求"""

    job_id: str


class JobIntervalUpdateRequest(BaseModel):
    """任务间隔更新请求"""

    job_id: str
    seconds: int | None = None
    minutes: int | None = None
    hours: int | None = None


class JobOperationResponse(BaseModel):
    """任务操作响应"""

    success: bool
    message: str


@router.get("/jobs", response_model=JobListResponse)
async def get_all_jobs():
    """获取所有定时任务"""
    try:
        scheduler_manager = get_scheduler_manager()
        jobs = scheduler_manager.get_all_jobs()

        job_list = []
        for job in jobs:
            job_info = JobInfo(
                id=job.id,
                name=job.name,
                func=str(job.func_ref),
                trigger=str(job.trigger),
                next_run_time=(job.next_run_time.isoformat() if job.next_run_time else None),
                pending=job.next_run_time is not None,
            )
            job_list.append(job_info)

        return JobListResponse(total=len(job_list), jobs=job_list)
    except Exception as e:
        logger.error(f"获取任务列表失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/jobs/{job_id}", response_model=JobInfo)
async def get_job_detail(job_id: str):
    """获取指定任务的详细信息"""
    try:
        scheduler_manager = get_scheduler_manager()
        job = scheduler_manager.get_job(job_id)

        if not job:
            raise HTTPException(status_code=404, detail="任务不存在")

        return JobInfo(
            id=job.id,
            name=job.name,
            func=str(job.func_ref),
            trigger=str(job.trigger),
            next_run_time=(job.next_run_time.isoformat() if job.next_run_time else None),
            pending=job.next_run_time is not None,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取任务详情失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/jobs/{job_id}/pause", response_model=JobOperationResponse)
async def pause_job(job_id: str):
    """暂停指定任务"""
    try:
        scheduler_manager = get_scheduler_manager()
        success = scheduler_manager.pause_job(job_id)

        if success:
            # 同步更新配置文件中的 enabled 状态
            _sync_job_enabled_to_config(job_id, False)
            return JobOperationResponse(success=True, message=f"任务 {job_id} 已暂停")
        else:
            raise HTTPException(status_code=400, detail="暂停任务失败")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"暂停任务失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/jobs/{job_id}/resume", response_model=JobOperationResponse)
async def resume_job(job_id: str):
    """恢复指定任务"""
    try:
        scheduler_manager = get_scheduler_manager()
        success = scheduler_manager.resume_job(job_id)

        if success:
            # 同步更新配置文件中的 enabled 状态
            _sync_job_enabled_to_config(job_id, True)
            return JobOperationResponse(success=True, message=f"任务 {job_id} 已恢复")
        else:
            raise HTTPException(status_code=400, detail="恢复任务失败")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"恢复任务失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.put("/jobs/{job_id}/interval", response_model=JobOperationResponse)
async def update_job_interval(job_id: str, request: JobIntervalUpdateRequest):
    """更新任务执行间隔"""
    try:
        scheduler_manager = get_scheduler_manager()

        # 验证至少提供一个时间参数
        if request.seconds is None and request.minutes is None and request.hours is None:
            raise HTTPException(status_code=400, detail="必须提供至少一个时间间隔参数")

        success = scheduler_manager.modify_job_interval(
            job_id,
            seconds=request.seconds,
            minutes=request.minutes,
            hours=request.hours,
        )

        if success:
            # 同步更新配置文件中的间隔
            _sync_job_interval_to_config(job_id, request.seconds, request.minutes, request.hours)

            interval_parts = []
            if request.hours:
                interval_parts.append(f"{request.hours}小时")
            if request.minutes:
                interval_parts.append(f"{request.minutes}分钟")
            if request.seconds:
                interval_parts.append(f"{request.seconds}秒")
            interval_str = "".join(interval_parts)

            return JobOperationResponse(
                success=True,
                message=f"任务 {job_id} 的执行间隔已更新为 {interval_str}",
            )
        else:
            raise HTTPException(status_code=400, detail="更新任务间隔失败")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新任务间隔失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete("/jobs/{job_id}", response_model=JobOperationResponse)
async def remove_job(job_id: str):
    """删除指定任务"""
    try:
        scheduler_manager = get_scheduler_manager()
        success = scheduler_manager.remove_job(job_id)

        if success:
            return JobOperationResponse(success=True, message=f"任务 {job_id} 已删除")
        else:
            raise HTTPException(status_code=400, detail="删除任务失败")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除任务失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/status")
async def get_scheduler_status():
    """获取调度器状态"""
    try:
        scheduler_manager = get_scheduler_manager()
        jobs = scheduler_manager.get_all_jobs()

        running_jobs = [job for job in jobs if job.next_run_time is not None]
        paused_jobs = [job for job in jobs if job.next_run_time is None]

        return {
            "running": scheduler_manager.scheduler.running
            if scheduler_manager.scheduler
            else False,
            "total_jobs": len(jobs),
            "running_jobs": len(running_jobs),
            "paused_jobs": len(paused_jobs),
        }
    except Exception as e:
        logger.error(f"获取调度器状态失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/jobs/pause-all", response_model=JobOperationResponse)
async def pause_all_jobs():
    """暂停所有任务"""
    try:
        scheduler_manager = get_scheduler_manager()

        # 获取所有任务列表
        jobs = scheduler_manager.get_all_jobs()
        paused_jobs = []

        # 逐个暂停任务并同步配置
        for job in jobs:
            if job.next_run_time is not None:  # 只暂停未暂停的任务
                try:
                    scheduler_manager.pause_job(job.id)
                    # 同步更新配置文件
                    _sync_job_enabled_to_config(job.id, False)
                    paused_jobs.append(job.id)
                except Exception as e:
                    logger.error(f"暂停任务 {job.id} 失败: {e}")

        return JobOperationResponse(
            success=True,
            message=f"已暂停 {len(paused_jobs)} 个任务",
        )
    except Exception as e:
        logger.error(f"批量暂停任务失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/jobs/resume-all", response_model=JobOperationResponse)
async def resume_all_jobs():
    """恢复所有任务"""
    try:
        scheduler_manager = get_scheduler_manager()

        # 获取所有任务列表
        jobs = scheduler_manager.get_all_jobs()
        resumed_jobs = []

        # 逐个恢复任务并同步配置
        for job in jobs:
            if job.next_run_time is None:  # 只恢复已暂停的任务
                try:
                    scheduler_manager.resume_job(job.id)
                    # 同步更新配置文件
                    _sync_job_enabled_to_config(job.id, True)
                    resumed_jobs.append(job.id)
                except Exception as e:
                    logger.error(f"恢复任务 {job.id} 失败: {e}")

        return JobOperationResponse(
            success=True,
            message=f"已恢复 {len(resumed_jobs)} 个任务",
        )
    except Exception as e:
        logger.error(f"批量恢复任务失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


def _sync_job_enabled_to_config(job_id: str, enabled: bool):
    """同步任务的启用状态到配置文件（持久化到 YAML 文件）

    Args:
        job_id: 任务ID
        enabled: 是否启用
    """
    from lifetrace.services.config_service import ConfigService

    # 定义任务ID到配置路径的映射
    job_config_map = {
        "recorder_job": "jobs.recorder.enabled",
        "ocr_job": "jobs.ocr.enabled",
        "task_context_mapper_job": "jobs.task_context_mapper.enabled",
        "task_summary_job": "jobs.task_summary.enabled",
        "clean_data_job": "jobs.clean_data.enabled",
        "activity_aggregator_job": "jobs.activity_aggregator.enabled",
    }

    if job_id in job_config_map:
        config_key = job_config_map[job_id]
        try:
            # 使用 ConfigService 持久化配置到文件
            config_service = ConfigService()
            config_service.update_config_file({config_key: enabled}, config_service._config_path)
            # 重新加载配置到内存
            from lifetrace.util.settings import reload_settings

            reload_settings()
            logger.info(f"已同步任务 {job_id} 的启用状态到配置文件: {enabled}")
        except Exception as e:
            logger.error(f"同步任务启用状态到配置失败: {e}")


def _sync_job_interval_to_config(
    job_id: str, seconds: int | None = None, minutes: int | None = None, hours: int | None = None
):
    """同步任务的执行间隔到配置文件（持久化到 YAML 文件）

    Args:
        job_id: 任务ID
        seconds: 秒数
        minutes: 分钟数
        hours: 小时数
    """
    from lifetrace.services.config_service import ConfigService

    # 定义任务ID到配置路径的映射
    job_config_map = {
        "recorder_job": "jobs.recorder.interval",
        "ocr_job": "jobs.ocr.interval",
        "task_context_mapper_job": "jobs.task_context_mapper.interval",
        "task_summary_job": "jobs.task_summary.interval",
        "clean_data_job": "jobs.clean_data.interval",
        "activity_aggregator_job": "jobs.activity_aggregator.interval",
    }

    if job_id in job_config_map:
        config_key = job_config_map[job_id]
        try:
            # 计算总间隔秒数
            total_seconds = 0
            if seconds:
                total_seconds += seconds
            if minutes:
                total_seconds += minutes * 60
            if hours:
                total_seconds += hours * 3600

            # 使用 ConfigService 持久化配置到文件
            config_service = ConfigService()
            config_service.update_config_file(
                {config_key: total_seconds}, config_service._config_path
            )
            # 重新加载配置到内存
            from lifetrace.util.settings import reload_settings

            reload_settings()
            logger.info(f"已同步任务 {job_id} 的执行间隔到配置文件: {total_seconds}秒")
        except Exception as e:
            logger.error(f"同步任务执行间隔到配置失败: {e}")
