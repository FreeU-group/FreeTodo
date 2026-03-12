"""统计管理器 - 负责统计信息和数据清理相关的数据库操作"""

import os
from datetime import timedelta
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from storage.database_base import DatabaseBase
from storage.models import OCRResult, Screenshot
from storage.sql_utils import col
from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()


class StatsManager:
    """统计和数据清理管理类"""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    def get_statistics(self) -> dict[str, Any]:
        """获取统计信息"""
        try:
            with self.db_base.get_session() as session:
                total_screenshots = session.query(Screenshot).count()
                processed_screenshots = (
                    session.query(Screenshot).filter_by(is_processed=True).count()
                )

                # 今日统计
                now = get_utc_now()
                today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                today_screenshots = (
                    session.query(Screenshot)
                    .filter(col(Screenshot.created_at) >= today_start)
                    .count()
                )

                return {
                    "total_screenshots": total_screenshots,
                    "processed_screenshots": processed_screenshots,
                    "today_screenshots": today_screenshots,
                    "processing_rate": processed_screenshots / max(total_screenshots, 1) * 100,
                }

        except SQLAlchemyError as e:
            logger.error(f"获取统计信息失败: {e}")
            return {}

    def cleanup_old_data(self, max_days: int):
        """清理旧数据"""
        if max_days <= 0:
            return

        try:
            cutoff_date = get_utc_now() - timedelta(days=max_days)

            with self.db_base.get_session() as session:
                # 获取要删除的截图
                old_screenshots = (
                    session.query(Screenshot).filter(col(Screenshot.created_at) < cutoff_date).all()
                )

                deleted_count = 0
                for screenshot in old_screenshots:
                    # 删除相关的OCR结果
                    session.query(OCRResult).filter_by(screenshot_id=screenshot.id).delete()

                    # 删除文件
                    if os.path.exists(screenshot.file_path):
                        try:
                            os.remove(screenshot.file_path)
                        except Exception as e:
                            logger.error(f"删除文件失败 {screenshot.file_path}: {e}")

                    # 删除截图记录
                    session.delete(screenshot)
                    deleted_count += 1

                logger.info(f"清理了 {deleted_count} 条旧数据")

        except SQLAlchemyError as e:
            logger.error(f"清理旧数据失败: {e}")
