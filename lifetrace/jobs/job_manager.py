"""
后台任务管理器
负责管理所有后台任务的启动、停止和配置更新
"""

from lifetrace.jobs.activity_aggregator import (
    execute_activity_aggregation_task,
    get_aggregator_instance,
)
from lifetrace.jobs.clean_data import execute_clean_data_task, get_clean_data_instance
from lifetrace.jobs.deadline_reminder import execute_deadline_reminder_task
from lifetrace.jobs.ocr import execute_ocr_task
from lifetrace.jobs.recorder import execute_capture_task, get_recorder_instance
from lifetrace.jobs.scheduler import get_scheduler_manager
from lifetrace.jobs.task_context_mapper import execute_mapper_task, get_mapper_instance
from lifetrace.jobs.task_summary import execute_summary_task, get_summary_instance
from lifetrace.jobs.todo_recorder import execute_todo_capture_task, get_todo_recorder_instance
from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings

logger = get_logger()


class JobManager:
    """后台任务管理器"""

    def __init__(self):
        """初始化任务管理器"""
        # 后台服务实例
        self.scheduler_manager = None

        logger.info("任务管理器已初始化")

    def start_all(self):
        """启动所有后台任务"""
        logger.info("开始启动所有后台任务")

        # 启动调度器
        self._start_scheduler()

        # 启动录制器任务（事件处理已集成到录制器中，截图后立即处理）
        self._start_recorder_job()

        # 启动 Todo 专用录制器任务（与自动待办检测联动）
        self._start_todo_recorder_job()

        # 启动OCR任务
        self._start_ocr_job()

        # 启动任务上下文映射服务
        self._start_task_context_mapper()

        # 启动任务摘要服务
        self._start_task_summary_service()

        # 启动活动聚合任务
        self._start_activity_aggregator()

        # 启动数据清理任务
        self._start_clean_data_job()

        # 启动 DDL 提醒任务
        self._start_deadline_reminder_job()

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

    def _start_recorder_job(self):
        """启动录制器任务"""
        enabled = settings.get("jobs.recorder.enabled")

        try:
            # 预先初始化全局录制器实例（避免首次调用时延迟）
            get_recorder_instance()
            logger.info("录制器实例已初始化")

            # 添加录制器定时任务（使用可序列化的函数，无论是否启用都添加）
            recorder_interval = settings.get("jobs.recorder.interval")
            recorder_id = settings.get("jobs.recorder.id")
            self.scheduler_manager.add_interval_job(
                func=execute_capture_task,  # 使用模块级别的函数
                job_id="recorder_job",
                name=recorder_id,
                seconds=recorder_interval,
                replace_existing=True,
            )
            logger.info(f"录制器定时任务已添加，间隔: {recorder_interval}秒")

            # 如果未启用，则暂停任务
            if not enabled:
                self.scheduler_manager.pause_job("recorder_job")
                logger.info("录制器服务未启用，已暂停")
        except Exception as e:
            logger.error(f"启动录制器任务失败: {e}", exc_info=True)

    def _start_todo_recorder_job(self):
        """启动 Todo 专用录制器任务

        此任务与自动待办检测功能联动：
        - 仅在白名单应用激活时截图
        - 截图后直接触发自动待办检测
        - 与通用录制器完全独立
        """
        enabled = settings.get("jobs.todo_recorder.enabled", False)

        try:
            # 预先初始化全局 Todo 录制器实例
            get_todo_recorder_instance()
            logger.info("Todo 录制器实例已初始化")

            # 添加 Todo 录制器定时任务（无论是否启用都添加）
            todo_recorder_interval = settings.get("jobs.todo_recorder.interval", 5)
            todo_recorder_id = settings.get("jobs.todo_recorder.id", "todo_recorder")
            self.scheduler_manager.add_interval_job(
                func=execute_todo_capture_task,
                job_id="todo_recorder_job",
                name=todo_recorder_id,
                seconds=todo_recorder_interval,
                replace_existing=True,
            )
            logger.info(f"Todo 录制器定时任务已添加，间隔: {todo_recorder_interval}秒")

            # 如果未启用，则暂停任务
            if not enabled:
                self.scheduler_manager.pause_job("todo_recorder_job")
                logger.info("Todo 录制器服务未启用，已暂停")
        except Exception as e:
            logger.error(f"启动 Todo 录制器任务失败: {e}", exc_info=True)

    def _start_ocr_job(self):
        """启动OCR任务"""
        enabled = settings.get("jobs.ocr.enabled")

        try:
            # 添加OCR定时任务（无论是否启用都添加）
            ocr_interval = settings.get("jobs.ocr.interval")
            ocr_id = settings.get("jobs.ocr.id")
            self.scheduler_manager.add_interval_job(
                func=execute_ocr_task,
                job_id="ocr_job",
                name=ocr_id,
                seconds=ocr_interval,
                replace_existing=True,
            )
            logger.info(f"OCR定时任务已添加，间隔: {ocr_interval}秒")

            # 如果未启用，则暂停任务
            if not enabled:
                self.scheduler_manager.pause_job("ocr_job")
                logger.info("OCR服务未启用，已暂停")
        except Exception as e:
            logger.error(f"启动OCR任务失败: {e}", exc_info=True)

    def _start_task_context_mapper(self):
        """启动任务上下文映射服务"""
        enabled = settings.get("jobs.task_context_mapper.enabled")

        try:
            # 预先初始化全局实例
            get_mapper_instance()
            logger.info("任务上下文映射服务实例已初始化")

            # 添加到调度器（无论是否启用都添加）
            interval = settings.get("jobs.task_context_mapper.interval")
            mapper_id = settings.get("jobs.task_context_mapper.id")
            self.scheduler_manager.add_interval_job(
                func=execute_mapper_task,
                job_id="task_context_mapper_job",
                name=mapper_id,
                seconds=interval,
                replace_existing=True,
            )
            logger.info(f"任务上下文映射定时任务已添加，间隔: {interval}秒")

            # 如果未启用，则暂停任务
            if not enabled:
                self.scheduler_manager.pause_job("task_context_mapper_job")
                logger.info("任务上下文映射服务未启用，已暂停")
        except Exception as e:
            logger.error(f"启动任务上下文映射服务失败: {e}", exc_info=True)

    def _start_task_summary_service(self):
        """启动任务摘要服务"""
        enabled = settings.get("jobs.task_summary.enabled")

        try:
            # 预先初始化全局实例
            get_summary_instance()
            logger.info("任务摘要服务实例已初始化")

            # 添加到调度器（无论是否启用都添加）
            interval = settings.get("jobs.task_summary.interval")
            summary_id = settings.get("jobs.task_summary.id")
            self.scheduler_manager.add_interval_job(
                func=execute_summary_task,
                job_id="task_summary_job",
                name=summary_id,
                seconds=interval,
                replace_existing=True,
            )
            logger.info(f"任务摘要定时任务已添加，间隔: {interval}秒")

            # 如果未启用，则暂停任务
            if not enabled:
                self.scheduler_manager.pause_job("task_summary_job")
                logger.info("任务摘要服务未启用，已暂停")
        except Exception as e:
            logger.error(f"启动任务摘要服务失败: {e}", exc_info=True)

    def _start_activity_aggregator(self):
        """启动活动聚合任务"""
        enabled = settings.get("jobs.activity_aggregator.enabled")

        try:
            # 预先初始化全局实例
            get_aggregator_instance()
            logger.info("活动聚合服务实例已初始化")

            # 添加到调度器（无论是否启用都添加）
            interval = settings.get("jobs.activity_aggregator.interval")
            aggregator_id = settings.get("jobs.activity_aggregator.id")
            self.scheduler_manager.add_interval_job(
                func=execute_activity_aggregation_task,
                job_id="activity_aggregator_job",
                name=aggregator_id,
                seconds=interval,
                replace_existing=True,
            )
            logger.info(f"活动聚合定时任务已添加，间隔: {interval}秒")

            # 如果未启用，则暂停任务
            if not enabled:
                self.scheduler_manager.pause_job("activity_aggregator_job")
                logger.info("活动聚合服务未启用，已暂停")
        except Exception as e:
            logger.error(f"启动活动聚合服务失败: {e}", exc_info=True)

    def _start_clean_data_job(self):
        """启动数据清理任务"""
        enabled = settings.get("jobs.clean_data.enabled")

        try:
            # 预先初始化全局实例
            get_clean_data_instance()
            logger.info("数据清理服务实例已初始化")

            # 添加到调度器（无论是否启用都添加）
            interval = settings.get("jobs.clean_data.interval")
            clean_data_id = settings.get("jobs.clean_data.id")
            self.scheduler_manager.add_interval_job(
                func=execute_clean_data_task,
                job_id="clean_data_job",
                name=clean_data_id,
                seconds=interval,
                replace_existing=True,
            )
            logger.info(f"数据清理定时任务已添加，间隔: {interval}秒")

            # 如果未启用，则暂停任务
            if not enabled:
                self.scheduler_manager.pause_job("clean_data_job")
                logger.info("数据清理服务未启用，已暂停")
        except Exception as e:
            logger.error(f"启动数据清理服务失败: {e}", exc_info=True)

    def _start_deadline_reminder_job(self):
        """启动 DDL 提醒任务"""
        enabled = settings.get("jobs.deadline_reminder.enabled")

        try:
            # 添加到调度器（无论是否启用都添加）
            interval = settings.get("jobs.deadline_reminder.interval")
            reminder_id = settings.get("jobs.deadline_reminder.id")
            self.scheduler_manager.add_interval_job(
                func=execute_deadline_reminder_task,
                job_id="deadline_reminder_job",
                name=reminder_id,
                seconds=interval,
                replace_existing=True,
            )
            logger.info(f"DDL 提醒定时任务已添加，间隔: {interval}秒")

            # 如果未启用，则暂停任务
            if not enabled:
                self.scheduler_manager.pause_job("deadline_reminder_job")
                logger.info("DDL 提醒服务未启用，已暂停")
        except Exception as e:
            logger.error(f"启动 DDL 提醒任务失败: {e}", exc_info=True)


# 全局单例
_job_manager_instance: JobManager | None = None


def get_job_manager() -> JobManager:
    """获取任务管理器单例"""
    global _job_manager_instance
    if _job_manager_instance is None:
        _job_manager_instance = JobManager()
    return _job_manager_instance
