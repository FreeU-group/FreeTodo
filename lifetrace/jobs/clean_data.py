"""
数据清理任务
负责清理旧的截图数据，防止磁盘空间占用过大
"""

import os
from datetime import datetime, timedelta

from lifetrace.storage import get_session, screenshot_mgr
from lifetrace.util.logging_config import get_logger
from lifetrace.util.path_utils import get_user_data_dir
from lifetrace.util.settings import settings

logger = get_logger()


class CleanDataService:
    """数据清理服务"""

    def __init__(self):
        """初始化数据清理服务"""
        self.max_screenshots = settings.get("jobs.clean_data.params.max_screenshots")
        self.max_days = settings.get("jobs.clean_data.params.max_days")
        self.delete_file_only = settings.get("jobs.clean_data.params.delete_file_only")
        logger.info("数据清理服务已初始化")

    def execute(self) -> dict:
        """执行数据清理任务

        Returns:
            执行结果字典，包含清理统计信息
        """
        try:
            logger.info("开始执行数据清理任务")
            result = {
                "deleted_files": 0,
                "deleted_records": 0,
                "freed_space": 0,
                "errors": [],
            }

            # 1. 按数量清理（保留最新的 N 张截图）
            if self.max_screenshots:
                deleted = self._clean_by_count()
                result["deleted_files"] += deleted["files"]
                result["deleted_records"] += deleted["records"]
                result["freed_space"] += deleted["space"]

            # 2. 按时间清理（删除超过 N 天的数据）
            if self.max_days:
                deleted = self._clean_by_date()
                result["deleted_files"] += deleted["files"]
                result["deleted_records"] += deleted["records"]
                result["freed_space"] += deleted["space"]

            logger.info(
                f"数据清理完成 - 删除文件: {result['deleted_files']}, "
                f"删除记录: {result['deleted_records']}, "
                f"释放空间: {result['freed_space'] / 1024 / 1024:.2f}MB"
            )
            return result

        except Exception as e:
            logger.error(f"执行数据清理任务失败: {e}", exc_info=True)
            return {"error": str(e)}

    def _clean_by_count(self) -> dict:
        """按数量清理截图

        Returns:
            清理结果统计
        """
        result = {"files": 0, "records": 0, "space": 0}

        try:
            # 获取截图总数（排除已删除文件的记录）
            total = screenshot_mgr.get_screenshot_count(exclude_deleted=True)

            if total <= self.max_screenshots:
                logger.debug(
                    f"截图数量 ({total}) 未超过限制 ({self.max_screenshots})，跳过按数量清理"
                )
                return result

            # 计算需要删除的数量
            to_delete_count = total - self.max_screenshots
            logger.info(
                f"截图数量超限 ({total} > {self.max_screenshots})，需要删除 {to_delete_count} 张"
            )

            # 获取最旧的截图列表（排除已删除文件的记录）
            with get_session() as session:
                from lifetrace.storage.models import Screenshot

                old_screenshots = (
                    session.query(Screenshot)
                    .filter(Screenshot.file_deleted.is_not(True))
                    .order_by(Screenshot.created_at.asc())
                    .limit(to_delete_count)
                    .all()
                )

                for screenshot in old_screenshots:
                    deleted = self._delete_screenshot(screenshot, session)
                    if deleted["success"]:
                        result["files"] += 1
                        result["space"] += deleted["size"]
                        if not self.delete_file_only:
                            result["records"] += 1

            return result

        except Exception as e:
            logger.error(f"按数量清理截图失败: {e}", exc_info=True)
            return result

    def _clean_by_date(self) -> dict:
        """按日期清理截图

        Returns:
            清理结果统计
        """
        result = {"files": 0, "records": 0, "space": 0}

        try:
            # 计算截止日期
            cutoff_date = datetime.now() - timedelta(days=self.max_days)
            logger.info(f"开始清理 {cutoff_date.strftime('%Y-%m-%d')} 之前的截图数据")

            # 获取需要清理的截图（排除已删除文件的记录）
            with get_session() as session:
                from lifetrace.storage.models import Screenshot

                old_screenshots = (
                    session.query(Screenshot)
                    .filter(Screenshot.created_at < cutoff_date)
                    .filter(Screenshot.file_deleted.is_not(True))
                    .all()
                )

                if not old_screenshots:
                    logger.debug("没有超过保留期限的截图，跳过按日期清理")
                    return result

                logger.info(f"找到 {len(old_screenshots)} 张过期截图")

                for screenshot in old_screenshots:
                    deleted = self._delete_screenshot(screenshot, session)
                    if deleted["success"]:
                        result["files"] += 1
                        result["space"] += deleted["size"]
                        if not self.delete_file_only:
                            result["records"] += 1

            return result

        except Exception as e:
            logger.error(f"按日期清理截图失败: {e}", exc_info=True)
            return result

    def _delete_screenshot(self, screenshot, session) -> dict:
        """删除单个截图

        Args:
            screenshot: 截图对象
            session: 数据库会话

        Returns:
            删除结果字典
        """
        result = {"success": False, "size": 0}

        try:
            # 构造完整路径
            base_dir = str(get_user_data_dir())
            file_path = os.path.join(base_dir, screenshot.file_path)

            # 删除文件
            if os.path.exists(file_path):
                file_size = os.path.getsize(file_path)
                os.remove(file_path)
                result["size"] = file_size
                logger.debug(f"已删除文件: {file_path}")
            # 检查是否已经标记为已删除
            elif getattr(screenshot, "file_deleted", False):
                logger.debug(f"文件已在之前被删除: {file_path}")
            else:
                logger.warning(f"文件不存在: {file_path}")

            # 如果配置为同时删除记录，则从数据库中删除
            if not self.delete_file_only:
                session.delete(screenshot)
                session.flush()
                logger.debug(f"已删除数据库记录: screenshot_id={screenshot.id}")
            else:
                # 如果只删除文件，标记数据库记录为已删除（前端可根据此标识显示占位图）
                screenshot.file_deleted = True
                session.flush()
                logger.debug(f"已标记文件为已删除: screenshot_id={screenshot.id}")

            result["success"] = True

        except Exception as e:
            logger.error(f"删除截图失败 (id={screenshot.id}): {e}")

        return result


# 全局单例
_clean_data_instance: CleanDataService | None = None


def get_clean_data_instance() -> CleanDataService:
    """获取数据清理服务单例"""
    global _clean_data_instance
    if _clean_data_instance is None:
        _clean_data_instance = CleanDataService()
    return _clean_data_instance


def execute_clean_data_task():
    """执行数据清理任务 - 供调度器调用的可序列化函数"""
    try:
        logger.info("开始执行数据清理任务")
        service = get_clean_data_instance()
        service.execute()
        logger.info("数据清理任务完成")

    except Exception as e:
        logger.error(f"执行数据清理任务失败: {e}", exc_info=True)
