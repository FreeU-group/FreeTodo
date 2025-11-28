"""
APScheduler 调度器管理模块，用于管理 LifeTrace 的定时任务
"""

import os

from apscheduler.events import (
    EVENT_JOB_ADDED,
    EVENT_JOB_ERROR,
    EVENT_JOB_EXECUTED,
    EVENT_JOB_REMOVED,
)
from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from lifetrace.util.config import config
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class SchedulerManager:
    """APScheduler 调度器管理器"""

    def __init__(self):
        """初始化调度器管理器"""
        self.scheduler: BackgroundScheduler | None = None
        self._setup_scheduler()

    def _setup_scheduler(self):
        """设置 APScheduler 调度器"""
        # 从配置获取调度器数据库路径
        scheduler_db_path = config.scheduler_database_path

        # 确保数据库目录存在
        os.makedirs(os.path.dirname(scheduler_db_path), exist_ok=True)

        # 配置作业存储（持久化到 SQLite）
        jobstores = {"default": SQLAlchemyJobStore(url=f"sqlite:///{scheduler_db_path}")}

        # 配置执行器（线程池）
        max_workers = config.get("scheduler.max_workers")
        executors = {"default": ThreadPoolExecutor(max_workers=max_workers)}

        # 调度器配置
        job_defaults = {
            "coalesce": config.get("scheduler.coalesce"),  # 合并错过的任务
            "max_instances": config.get("scheduler.max_instances"),  # 同一任务同时只能有一个实例
            "misfire_grace_time": config.get(
                "scheduler.misfire_grace_time"
            ),  # 错过触发时间的容忍度（秒）
        }

        # 创建调度器
        timezone = config.get("scheduler.timezone")
        self.scheduler = BackgroundScheduler(
            jobstores=jobstores,
            executors=executors,
            job_defaults=job_defaults,
            timezone=timezone,  # 从配置读取时区
        )

        # 添加事件监听器
        self.scheduler.add_listener(self._job_executed_listener, EVENT_JOB_EXECUTED)
        self.scheduler.add_listener(self._job_error_listener, EVENT_JOB_ERROR)
        self.scheduler.add_listener(self._job_added_listener, EVENT_JOB_ADDED)
        self.scheduler.add_listener(self._job_removed_listener, EVENT_JOB_REMOVED)

        logger.info(f"调度器已初始化，作业数据库: {scheduler_db_path}")

    def _job_executed_listener(self, event):
        """任务执行成功的监听器"""
        logger.debug(
            f"任务执行成功: {event.job_id}, "
            f"返回值: {event.retval if hasattr(event, 'retval') else 'None'}"
        )

    def _job_error_listener(self, event):
        """任务执行错误的监听器"""
        logger.error(
            f"任务执行失败: {event.job_id}, 异常: {event.exception}, traceback: {event.traceback}"
        )

    def _job_added_listener(self, event):
        """任务添加的监听器"""
        logger.info(f"任务已添加: {event.job_id}")

    def _job_removed_listener(self, event):
        """任务移除的监听器"""
        logger.info(f"任务已移除: {event.job_id}")

    def start(self):
        """启动调度器"""
        if self.scheduler and not self.scheduler.running:
            self.scheduler.start()
            logger.info("调度器已启动")
        else:
            logger.warning("调度器已经在运行中")

    def shutdown(self, wait: bool = True):
        """关闭调度器

        Args:
            wait: 是否等待所有任务执行完毕
        """
        if self.scheduler and self.scheduler.running:
            self.scheduler.shutdown(wait=wait)
            logger.error("调度器已关闭")
        else:
            logger.warning("调度器未运行")

    def add_interval_job(
        self,
        func,
        job_id: str,
        name: str = None,
        seconds: int = None,
        minutes: int = None,
        hours: int = None,
        replace_existing: bool = True,
        **kwargs,
    ):
        """添加间隔型任务

        Args:
            func: 要执行的函数
            job_id: 任务ID
            name: 任务名称（显示用）
            seconds: 间隔秒数
            minutes: 间隔分钟数
            hours: 间隔小时数
            replace_existing: 如果任务已存在是否替换
            **kwargs: 传递给函数的参数
        """
        if not self.scheduler:
            logger.error("调度器未初始化")
            return None

        try:
            # 构建间隔参数
            interval_kwargs = {}
            if seconds is not None:
                interval_kwargs["seconds"] = seconds
            if minutes is not None:
                interval_kwargs["minutes"] = minutes
            if hours is not None:
                interval_kwargs["hours"] = hours

            if not interval_kwargs:
                logger.error("必须指定至少一个时间间隔参数")
                return None

            job = self.scheduler.add_job(
                func,
                trigger="interval",
                id=job_id,
                name=name,
                replace_existing=replace_existing,
                kwargs=kwargs,
                **interval_kwargs,
            )
            logger.info(
                f"添加间隔任务: {job_id} ({name}), 间隔: {interval_kwargs}, 下次运行: {job.next_run_time}"
            )
            return job
        except Exception as e:
            logger.error(f"添加任务失败: {e}")
            return None

    def remove_job(self, job_id: str):
        """移除任务

        Args:
            job_id: 任务ID
        """
        if not self.scheduler:
            logger.error("调度器未初始化")
            return False

        try:
            self.scheduler.remove_job(job_id)
            logger.info(f"任务已移除: {job_id}")
            return True
        except Exception as e:
            logger.error(f"移除任务失败: {e}")
            return False

    def pause_job(self, job_id: str):
        """暂停任务

        Args:
            job_id: 任务ID
        """
        if not self.scheduler:
            logger.error("调度器未初始化")
            return False

        try:
            self.scheduler.pause_job(job_id)
            logger.warning(f"任务已暂停: {job_id}")
            return True
        except Exception as e:
            logger.error(f"暂停任务失败: {e}")
            return False

    def resume_job(self, job_id: str):
        """恢复任务

        Args:
            job_id: 任务ID
        """
        if not self.scheduler:
            logger.error("调度器未初始化")
            return False

        try:
            self.scheduler.resume_job(job_id)
            logger.warning(f"任务已恢复: {job_id}")
            return True
        except Exception as e:
            logger.error(f"恢复任务失败: {e}")
            return False

    def get_job(self, job_id: str):
        """获取任务信息

        Args:
            job_id: 任务ID

        Returns:
            任务对象或None
        """
        if not self.scheduler:
            logger.error("调度器未初始化")
            return None

        return self.scheduler.get_job(job_id)

    def get_all_jobs(self):
        """获取所有任务

        Returns:
            任务列表
        """
        if not self.scheduler:
            logger.error("调度器未初始化")
            return []

        return self.scheduler.get_jobs()

    def modify_job_interval(
        self,
        job_id: str,
        seconds: int = None,
        minutes: int = None,
        hours: int = None,
    ):
        """修改任务的执行间隔

        Args:
            job_id: 任务ID
            seconds: 新的间隔秒数
            minutes: 新的间隔分钟数
            hours: 新的间隔小时数
        """
        if not self.scheduler:
            logger.error("调度器未初始化")
            return False

        try:
            # 构建间隔参数
            interval_kwargs = {}
            if seconds is not None:
                interval_kwargs["seconds"] = seconds
            if minutes is not None:
                interval_kwargs["minutes"] = minutes
            if hours is not None:
                interval_kwargs["hours"] = hours

            if not interval_kwargs:
                logger.error("必须指定至少一个时间间隔参数")
                return False

            # 创建新的触发器
            new_trigger = IntervalTrigger(**interval_kwargs)
            self.scheduler.modify_job(job_id, trigger=new_trigger)
            logger.info(f"任务间隔已修改: {job_id}, 新间隔: {interval_kwargs}")
            return True
        except Exception as e:
            logger.error(f"修改任务间隔失败: {e}")
            return False

    def pause_all_jobs(self):
        """暂停所有任务

        Returns:
            暂停成功的任务数量
        """
        if not self.scheduler:
            logger.error("调度器未初始化")
            return 0

        try:
            jobs = self.get_all_jobs()
            paused_count = 0

            for job in jobs:
                # 只暂停未暂停的任务
                if job.next_run_time is not None:
                    try:
                        self.scheduler.pause_job(job.id)
                        paused_count += 1
                    except Exception as e:
                        logger.error(f"暂停任务 {job.id} 失败: {e}")

            logger.warning(f"已暂停 {paused_count} 个任务")
            return paused_count
        except Exception as e:
            logger.error(f"批量暂停任务失败: {e}")
            return 0

    def resume_all_jobs(self):
        """恢复所有任务

        Returns:
            恢复成功的任务数量
        """
        if not self.scheduler:
            logger.error("调度器未初始化")
            return 0

        try:
            jobs = self.get_all_jobs()
            resumed_count = 0

            for job in jobs:
                # 只恢复已暂停的任务
                if job.next_run_time is None:
                    try:
                        self.scheduler.resume_job(job.id)
                        resumed_count += 1
                    except Exception as e:
                        logger.error(f"恢复任务 {job.id} 失败: {e}")

            logger.warning(f"已恢复 {resumed_count} 个任务")
            return resumed_count
        except Exception as e:
            logger.error(f"批量恢复任务失败: {e}")
            return 0


# 全局调度器实例
scheduler_manager: SchedulerManager | None = None


def get_scheduler_manager() -> SchedulerManager:
    """获取全局调度器管理器实例

    Returns:
        SchedulerManager 实例
    """
    global scheduler_manager
    if scheduler_manager is None:
        scheduler_manager = SchedulerManager()
    return scheduler_manager
