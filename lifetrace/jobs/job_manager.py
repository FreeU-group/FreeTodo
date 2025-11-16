#!/usr/bin/env python3
"""
后台任务管理器
负责管理所有后台任务的启动、停止和配置更新
"""

from lifetrace.jobs.ocr import execute_ocr_task
from lifetrace.jobs.recorder import execute_capture_task, get_recorder_instance
from lifetrace.jobs.scheduler import get_scheduler_manager
from lifetrace.jobs.task_context_mapper import execute_mapper_task, get_mapper_instance
from lifetrace.jobs.task_summary import execute_summary_task, get_summary_instance
from lifetrace.util.config import config
from lifetrace.util.config_watcher import ConfigChangeType
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class JobManager:
    """后台任务管理器 - 实现 ConfigChangeHandler 协议"""

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

        # 启动录制器任务
        self._start_recorder_job()

        # 启动OCR任务
        self._start_ocr_job()

        # 启动任务上下文映射服务
        self._start_task_context_mapper()

        # 启动任务摘要服务
        self._start_task_summary_service()

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
        enabled = config.get("jobs.recorder.enabled", True)

        try:
            # 预先初始化全局录制器实例（避免首次调用时延迟）
            get_recorder_instance()
            logger.info("录制器实例已初始化")

            # 添加录制器定时任务（使用可序列化的函数，无论是否启用都添加）
            recorder_interval = config.get("jobs.recorder.interval", 1)
            recorder_name = config.get("jobs.recorder.name", "屏幕录制")
            self.scheduler_manager.add_interval_job(
                func=execute_capture_task,  # 使用模块级别的函数
                job_id="recorder_job",
                name=recorder_name,
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

    def _start_ocr_job(self):
        """启动OCR任务"""
        enabled = config.get("jobs.ocr.enabled", True)

        try:
            # 添加OCR定时任务（无论是否启用都添加）
            ocr_interval = config.get("jobs.ocr.interval", 5)
            ocr_name = config.get("jobs.ocr.name", "OCR识别")
            self.scheduler_manager.add_interval_job(
                func=execute_ocr_task,
                job_id="ocr_job",
                name=ocr_name,
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
        enabled = config.get("jobs.task_context_mapper.enabled", False)

        try:
            # 预先初始化全局实例
            get_mapper_instance()
            logger.info("任务上下文映射服务实例已初始化")

            # 添加到调度器（无论是否启用都添加）
            interval = config.get("jobs.task_context_mapper.interval", 60)
            mapper_name = config.get("jobs.task_context_mapper.name", "任务上下文映射")
            self.scheduler_manager.add_interval_job(
                func=execute_mapper_task,
                job_id="task_context_mapper_job",
                name=mapper_name,
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
        enabled = config.get("jobs.task_summary.enabled", False)

        try:
            # 预先初始化全局实例
            get_summary_instance()
            logger.info("任务摘要服务实例已初始化")

            # 添加到调度器（无论是否启用都添加）
            interval = config.get("jobs.task_summary.interval", 3600)
            summary_name = config.get("jobs.task_summary.name", "任务摘要生成")
            self.scheduler_manager.add_interval_job(
                func=execute_summary_task,
                job_id="task_summary_job",
                name=summary_name,
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

    def handle_config_change(self, change_type: ConfigChangeType, old_value: dict, new_value: dict):
        """处理配置变更 - 实现 ConfigChangeHandler 协议

        Args:
            change_type: 配置变更类型
            old_value: 旧配置值
            new_value: 新配置值
        """
        try:
            if change_type == ConfigChangeType.JOBS:
                logger.info("JobManager 处理 Jobs 配置变更")
                # 检查录制器配置
                self._handle_recorder_config_change(old_value, new_value)
                # 检查 OCR 配置
                self._handle_ocr_config_change(old_value, new_value)
                # 检查任务上下文映射配置
                self._handle_task_context_mapper_config_change(old_value, new_value)
                # 检查任务摘要配置
                self._handle_task_summary_config_change_in_jobs(old_value, new_value)

        except Exception as e:
            logger.error(f"JobManager 处理配置变更失败: {e}", exc_info=True)

    def _handle_recorder_config_change(self, old_jobs: dict, new_jobs: dict):
        """处理录制器配置变更

        Args:
            old_jobs: 旧的 jobs 配置
            new_jobs: 新的 jobs 配置
        """
        old_recorder = old_jobs.get("recorder", {})
        new_recorder = new_jobs.get("recorder", {})

        # 检查是否启用状态变更
        old_enabled = old_recorder.get("enabled", True)
        new_enabled = new_recorder.get("enabled", True)

        if old_enabled != new_enabled:
            logger.info(f"录制器服务启用状态变更: {old_enabled} -> {new_enabled}")
            job = self.scheduler_manager.get_job("recorder_job")
            if new_enabled:
                # 恢复任务
                if job:
                    self.scheduler_manager.resume_job("recorder_job")
                    logger.info("录制器服务已恢复")
                else:
                    # 任务不存在，需要创建
                    self._start_recorder_job()
            else:
                # 暂停任务（不移除）
                if job:
                    self.scheduler_manager.pause_job("recorder_job")
                    logger.info("录制器服务已暂停")

        # 检查间隔配置变更（无论是否启用都允许修改）
        elif old_recorder.get("interval") != new_recorder.get("interval"):
            new_interval = new_recorder.get("interval", 1)
            logger.info(f"检测到录制间隔配置变更: {new_interval}秒")

            # 修改调度器中的任务间隔
            if self.scheduler_manager:
                self.scheduler_manager.modify_job_interval("recorder_job", seconds=new_interval)

    def _handle_ocr_config_change(self, old_jobs: dict, new_jobs: dict):
        """处理 OCR 配置变更

        Args:
            old_jobs: 旧的 jobs 配置
            new_jobs: 新的 jobs 配置
        """
        old_ocr = old_jobs.get("ocr", {})
        new_ocr = new_jobs.get("ocr", {})

        # 检查是否启用状态变更
        old_enabled = old_ocr.get("enabled", True)
        new_enabled = new_ocr.get("enabled", True)

        if old_enabled != new_enabled:
            logger.info(f"OCR服务启用状态变更: {old_enabled} -> {new_enabled}")
            job = self.scheduler_manager.get_job("ocr_job")
            if new_enabled:
                # 恢复任务
                if job:
                    self.scheduler_manager.resume_job("ocr_job")
                    logger.info("OCR服务已恢复")
                else:
                    # 任务不存在，需要创建
                    self._start_ocr_job()
            else:
                # 暂停任务（不移除）
                if job:
                    self.scheduler_manager.pause_job("ocr_job")
                    logger.info("OCR服务已暂停")

        # 检查间隔配置变更（无论是否启用都允许修改）
        elif old_ocr.get("interval") != new_ocr.get("interval"):
            new_interval = new_ocr.get("interval", 5)
            logger.info(f"检测到 OCR 检查间隔配置变更: {new_interval}秒")

            # 修改调度器中的任务间隔
            if self.scheduler_manager:
                self.scheduler_manager.modify_job_interval("ocr_job", seconds=new_interval)

    def _handle_task_context_mapper_config_change(self, old_jobs: dict, new_jobs: dict):
        """处理任务上下文映射配置变更

        Args:
            old_jobs: 旧的 jobs 配置
            new_jobs: 新的 jobs 配置
        """
        old_mapper = old_jobs.get("task_context_mapper", {})
        new_mapper = new_jobs.get("task_context_mapper", {})

        # 检查是否启用状态变更
        old_enabled = old_mapper.get("enabled", False)
        new_enabled = new_mapper.get("enabled", False)

        if old_enabled != new_enabled:
            logger.info(f"任务上下文映射服务启用状态变更: {old_enabled} -> {new_enabled}")
            job = self.scheduler_manager.get_job("task_context_mapper_job")
            if new_enabled:
                # 恢复任务
                if job:
                    self.scheduler_manager.resume_job("task_context_mapper_job")
                    logger.info("任务上下文映射服务已恢复")
                else:
                    # 任务不存在，需要创建
                    self._start_task_context_mapper()
            else:
                # 暂停任务（不移除）
                if job:
                    self.scheduler_manager.pause_job("task_context_mapper_job")
                    logger.info("任务上下文映射服务已暂停")

        # 检查间隔配置变更（无论是否启用都允许修改）
        elif old_mapper.get("interval") != new_mapper.get("interval"):
            new_interval = new_mapper.get("interval", 60)
            logger.info(f"检测到任务上下文映射间隔配置变更: {new_interval}秒")
            if self.scheduler_manager:
                self.scheduler_manager.modify_job_interval(
                    "task_context_mapper_job", seconds=new_interval
                )

        # 检查其他配置参数（如阈值、批次大小等）
        if new_enabled:
            mapper_instance = get_mapper_instance()
            # 检查项目置信度阈值
            if old_mapper.get("project_confidence_threshold") != new_mapper.get(
                "project_confidence_threshold"
            ):
                threshold = new_mapper.get("project_confidence_threshold", 0.7)
                logger.info(f"更新任务上下文映射项目置信度阈值: {threshold}")
                mapper_instance.project_confidence_threshold = threshold
            # 检查任务置信度阈值
            if old_mapper.get("task_confidence_threshold") != new_mapper.get(
                "task_confidence_threshold"
            ):
                threshold = new_mapper.get("task_confidence_threshold", 0.7)
                logger.info(f"更新任务上下文映射任务置信度阈值: {threshold}")
                mapper_instance.task_confidence_threshold = threshold

    def _handle_task_summary_config_change_in_jobs(self, old_jobs: dict, new_jobs: dict):
        """处理任务摘要配置变更（在 jobs 配置中）

        Args:
            old_jobs: 旧的 jobs 配置
            new_jobs: 新的 jobs 配置
        """
        old_summary = old_jobs.get("task_summary", {})
        new_summary = new_jobs.get("task_summary", {})

        # 检查是否启用状态变更
        old_enabled = old_summary.get("enabled", False)
        new_enabled = new_summary.get("enabled", False)

        if old_enabled != new_enabled:
            logger.info(f"任务摘要服务启用状态变更: {old_enabled} -> {new_enabled}")
            job = self.scheduler_manager.get_job("task_summary_job")
            if new_enabled:
                # 恢复任务
                if job:
                    self.scheduler_manager.resume_job("task_summary_job")
                    logger.info("任务摘要服务已恢复")
                else:
                    # 任务不存在，需要创建
                    self._start_task_summary_service()
            else:
                # 暂停任务（不移除）
                if job:
                    self.scheduler_manager.pause_job("task_summary_job")
                    logger.info("任务摘要服务已暂停")

        # 检查间隔配置变更（无论是否启用都允许修改）
        elif old_summary.get("interval") != new_summary.get("interval"):
            new_interval = new_summary.get("interval", 3600)
            logger.info(f"检测到任务摘要间隔配置变更: {new_interval}秒")
            if self.scheduler_manager:
                self.scheduler_manager.modify_job_interval("task_summary_job", seconds=new_interval)

        # 检查其他配置参数
        if new_enabled:
            summary_instance = get_summary_instance()
            if old_summary.get("min_new_contexts") != new_summary.get("min_new_contexts"):
                min_contexts = new_summary.get("min_new_contexts", 5)
                logger.info(f"更新任务摘要最小上下文数: {min_contexts}")
                summary_instance.min_new_contexts = min_contexts


# 全局单例
_job_manager_instance: JobManager | None = None


def get_job_manager() -> JobManager:
    """获取任务管理器单例"""
    global _job_manager_instance
    if _job_manager_instance is None:
        _job_manager_instance = JobManager()
    return _job_manager_instance
