"""
数据清理任务
负责定期检查截图数量，超过限制时删除最老的截图
"""

import os
from datetime import datetime

from lifetrace.storage.database import db_manager
from lifetrace.util.config import config
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class DataCleaner:
    """数据清理服务"""

    def __init__(self):
        """初始化数据清理服务"""
        self.max_screenshots = config.get("jobs.clean_data.max_screenshots", 10000)
        self.delete_file_only = config.get("jobs.clean_data.delete_file_only", True)
        mode = "只删除文件" if self.delete_file_only else "删除文件和记录"
        logger.info(f"数据清理服务已初始化，最大截图数量: {self.max_screenshots}，清理模式: {mode}")

    def clean_old_screenshots(self):
        """清理超出限制的旧截图"""
        try:
            # 获取当前截图总数
            with db_manager.get_session() as session:
                from lifetrace.storage.models import Screenshot

                total_count = session.query(Screenshot).count()

                if total_count <= self.max_screenshots:
                    logger.info(
                        f"截图数量 ({total_count}) 未超过限制 ({self.max_screenshots})，无需清理"
                    )
                    return

                # 计算需要删除的数量
                delete_count = total_count - self.max_screenshots
                mode_desc = (
                    "文件（保留数据库记录）" if self.delete_file_only else "文件和数据库记录"
                )
                logger.info(
                    f"截图数量 ({total_count}) 超过限制 ({self.max_screenshots})，"
                    f"需要删除 {delete_count} 张最老的截图{mode_desc}"
                )

                # 获取最老的截图（按创建时间排序）
                old_screenshots = (
                    session.query(Screenshot)
                    .order_by(Screenshot.created_at.asc())
                    .limit(delete_count)
                    .all()
                )

                deleted_files = 0
                deleted_records = 0

                for screenshot in old_screenshots:
                    try:
                        # 删除文件
                        if os.path.exists(screenshot.file_path):
                            try:
                                os.remove(screenshot.file_path)
                                deleted_files += 1
                                logger.debug(f"已删除文件: {screenshot.file_path}")
                            except Exception as e:
                                logger.error(f"删除文件失败 {screenshot.file_path}: {e}")

                        # 如果配置为同时删除记录
                        if not self.delete_file_only:
                            from lifetrace.storage.models import (
                                OCRResult,
                                ProcessingQueue,
                                SearchIndex,
                            )

                            # 删除相关的OCR结果
                            session.query(OCRResult).filter_by(screenshot_id=screenshot.id).delete()

                            # 删除相关的搜索索引
                            session.query(SearchIndex).filter_by(
                                screenshot_id=screenshot.id
                            ).delete()

                            # 删除相关的处理队列
                            session.query(ProcessingQueue).filter_by(
                                screenshot_id=screenshot.id
                            ).delete()

                            # 删除截图记录
                            session.delete(screenshot)
                            deleted_records += 1

                    except Exception as e:
                        logger.error(f"处理截图失败 (id={screenshot.id}): {e}")
                        continue

                session.commit()

                if self.delete_file_only:
                    logger.info(
                        f"数据清理完成: 删除了 {deleted_files} 个截图文件（保留了数据库记录）"
                    )
                else:
                    logger.info(
                        f"数据清理完成: 删除了 {deleted_files} 个文件，{deleted_records} 条数据库记录"
                    )

        except Exception as e:
            logger.error(f"清理旧截图失败: {e}", exc_info=True)

    def clean_orphaned_files(self):
        """清理孤立的截图文件（数据库中没有记录的文件）"""
        try:
            screenshots_dir = config.screenshots_dir
            if not os.path.exists(screenshots_dir):
                logger.warning(f"截图目录不存在: {screenshots_dir}")
                return

            # 获取所有文件
            all_files = set()
            for root, _, files in os.walk(screenshots_dir):
                for file in files:
                    if file.endswith((".png", ".jpg", ".jpeg")):
                        file_path = os.path.join(root, file)
                        all_files.add(file_path)

            logger.info(f"扫描到 {len(all_files)} 个截图文件")

            # 获取数据库中的文件路径
            with db_manager.get_session() as session:
                from lifetrace.storage.models import Screenshot

                db_files = set()
                screenshots = session.query(Screenshot.file_path).all()
                for screenshot in screenshots:
                    db_files.add(screenshot.file_path)

            # 找出孤立文件
            orphaned_files = all_files - db_files

            if not orphaned_files:
                logger.info("未发现孤立文件")
                return

            logger.info(f"发现 {len(orphaned_files)} 个孤立文件，开始清理")
            deleted_count = 0

            for file_path in orphaned_files:
                try:
                    os.remove(file_path)
                    deleted_count += 1
                    logger.debug(f"已删除孤立文件: {file_path}")
                except Exception as e:
                    logger.error(f"删除孤立文件失败 {file_path}: {e}")

            logger.info(f"孤立文件清理完成: 删除了 {deleted_count} 个文件")

        except Exception as e:
            logger.error(f"清理孤立文件失败: {e}", exc_info=True)

    def run(self):
        """执行清理任务"""
        logger.info("开始执行数据清理任务")
        start_time = datetime.now()

        # 清理超出限制的旧截图
        self.clean_old_screenshots()

        # 清理孤立文件（可选，不在每次都执行）
        # self.clean_orphaned_files()

        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"数据清理任务完成，耗时: {elapsed:.2f}秒")


# 全局单例
_cleaner_instance: DataCleaner | None = None


def get_cleaner_instance() -> DataCleaner:
    """获取数据清理服务单例"""
    global _cleaner_instance
    if _cleaner_instance is None:
        _cleaner_instance = DataCleaner()
    return _cleaner_instance


def execute_clean_task():
    """执行清理任务（用于调度器调用）"""
    try:
        cleaner = get_cleaner_instance()
        cleaner.run()
    except Exception as e:
        logger.error(f"执行清理任务失败: {e}", exc_info=True)
