# ruff: noqa: PLC0415
"""
后台任务管理器
负责管理所有后台任务的启动、停止和配置更新
"""

from functools import lru_cache

from core.module_registry import get_module_states
from jobs.scheduler import SchedulerManager, get_scheduler_manager
from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()


def _execute_activity_aggregation_task():
    from jobs.activity_aggregator import execute_activity_aggregation_task

    return execute_activity_aggregation_task()


def _execute_clean_data_task():
    from jobs.clean_data import execute_clean_data_task

    return execute_clean_data_task()


def _execute_deadline_reminder_task():
    from jobs.deadline_reminder import execute_deadline_reminder_task

    return execute_deadline_reminder_task()


class JobManager:
    """后台任务管理器"""

    def __init__(self):
        """初始化任务管理器"""
        # 后台服务实例
        self.scheduler_manager: SchedulerManager | None = None
        self.module_states = {}

        logger.info("任务管理器已初始化")

    def _get_scheduler(self) -> SchedulerManager | None:
        if not self.scheduler_manager:
            logger.warning("调度器未初始化，跳过任务配置")
            return None
        return self.scheduler_manager

    def _is_module_active(self, *module_ids: str) -> bool:
        """检查模块是否启用且依赖可用"""
        if not self.module_states:
            self.module_states = get_module_states()

        for module_id in module_ids:
            state = self.module_states.get(module_id)
            if not state or not state.enabled or not state.available:
                return False
        return True

    def start_all(self):
        """启动所有后台任务"""
        logger.info("开始启动所有后台任务")

        self.module_states = get_module_states()

        if not self._is_module_active("scheduler"):
            logger.warning("调度器模块未启用或依赖缺失，跳过后台任务启动")
            return

        # 启动调度器
        self._start_scheduler()
        if not self.scheduler_manager:
            logger.warning("调度器启动失败，停止后台任务初始化")
            return

        # 启动活动聚合任务
        self._start_activity_aggregator()

        # 启动数据清理任务
        self._start_clean_data_job()

        # 启动 DDL 提醒任务
        self._start_deadline_reminder_job()

        # 启动用户自定义自动化任务
        self._start_automation_tasks()

        logger.info("所有后台任务已启动")

    def stop_all(self):
        """停止所有后台任务"""
        logger.error("正在停止所有后台任务")

        # 停止调度器（会自动停止所有调度任务）
        self._stop_scheduler()

        logger.error("所有后台任务已停止")

    def _start_scheduler(self):
        """启动调度器"""
        try:
            self.scheduler_manager = get_scheduler_manager()
            self.scheduler_manager.start()
            logger.info("调度器已启动")
        except Exception as e:
            logger.error(f"启动调度器失败: {e}", exc_info=True)

    def _stop_scheduler(self):
        """停止调度器"""
        if self.scheduler_manager:
            try:
                logger.error("正在停止调度器...")
                self.scheduler_manager.shutdown(wait=True)
                logger.error("调度器已停止")
            except Exception as e:
                logger.error(f"停止调度器失败: {e}")

    def _start_activity_aggregator(self):
        """启动活动聚合任务"""
        if not self._is_module_active("activity"):
            logger.info("活动模块未启用，跳过活动聚合任务")
            return
        enabled = settings.get("jobs.activity_aggregator.enabled")

        try:
            # 仅在启用时预先初始化
            if enabled:
                from jobs.activity_aggregator import get_aggregator_instance

                get_aggregator_instance()
                logger.info("活动聚合服务实例已初始化")

            scheduler = self._get_scheduler()
            if not scheduler:
                return

            # 添加到调度器（无论是否启用都添加）
            interval = settings.get("jobs.activity_aggregator.interval")
            aggregator_id = settings.get("jobs.activity_aggregator.id")
            scheduler.add_interval_job(
                func=_execute_activity_aggregation_task,
                job_id="activity_aggregator_job",
                name=aggregator_id,
                seconds=interval,
                replace_existing=True,
            )
            logger.info(f"活动聚合定时任务已添加，间隔: {interval}秒")

            # 如果未启用，则暂停任务
            if not enabled:
                scheduler.pause_job("activity_aggregator_job")
                logger.info("活动聚合服务未启用，已暂停")
        except Exception as e:
            logger.error(f"启动活动聚合服务失败: {e}", exc_info=True)

    def _start_clean_data_job(self):
        """启动数据清理任务"""
        enabled = settings.get("jobs.clean_data.enabled")

        try:
            # 仅在启用时预先初始化
            if enabled:
                from jobs.clean_data import get_clean_data_instance

                get_clean_data_instance()
                logger.info("数据清理服务实例已初始化")

            scheduler = self._get_scheduler()
            if not scheduler:
                return

            # 添加到调度器（无论是否启用都添加）
            interval = settings.get("jobs.clean_data.interval")
            clean_data_id = settings.get("jobs.clean_data.id")
            scheduler.add_interval_job(
                func=_execute_clean_data_task,
                job_id="clean_data_job",
                name=clean_data_id,
                seconds=interval,
                replace_existing=True,
            )
            logger.info(f"数据清理定时任务已添加，间隔: {interval}秒")

            # 如果未启用，则暂停任务
            if not enabled:
                scheduler.pause_job("clean_data_job")
                logger.info("数据清理服务未启用，已暂停")
        except Exception as e:
            logger.error(f"启动数据清理服务失败: {e}", exc_info=True)

    def _start_deadline_reminder_job(self):
        """启动 DDL 提醒任务"""
        if not self._is_module_active("todo", "notification"):
            logger.info("待办/通知模块未启用，跳过 DDL 提醒任务")
            return
        enabled = settings.get("jobs.deadline_reminder.enabled")

        try:
            scheduler = self._get_scheduler()
            if not scheduler:
                return

            # 清理旧的定时扫描任务（历史遗留）
            if scheduler.get_job("deadline_reminder_job"):
                scheduler.remove_job("deadline_reminder_job")
                logger.info("已移除旧的 DDL 提醒扫描任务")

            if not enabled:
                from jobs.deadline_reminder import clear_all_todo_reminder_jobs

                clear_all_todo_reminder_jobs()
                logger.info("DDL 提醒服务未启用，已清理提醒任务")
                return

            from jobs.deadline_reminder import sync_all_todo_reminders

            sync_all_todo_reminders()
            logger.info("DDL 提醒任务已同步")
        except Exception as e:
            logger.error(f"启动 DDL 提醒任务失败: {e}", exc_info=True)

    def _start_automation_tasks(self):
        """启动用户自定义自动化任务"""
        if not self._is_module_active("automation", "scheduler"):
            logger.info("自动化模块未启用，跳过自动化任务")
            return

        scheduler = self._get_scheduler()
        if not scheduler:
            return

        try:
            from services.automation_task_service import AutomationTaskService

            AutomationTaskService().sync_all_tasks()
            logger.info("自动化任务同步完成")
        except Exception as e:
            logger.error(f"自动化任务同步失败: {e}", exc_info=True)


# 全局单例


@lru_cache(maxsize=1)
def get_job_manager() -> JobManager:
    """获取任务管理器单例"""
    return JobManager()
