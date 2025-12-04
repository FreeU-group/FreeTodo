"""截图管理器 - 负责截图相关的数据库操作"""

import os
from datetime import datetime
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.models import OCRResult, Screenshot
from lifetrace.util.config import config
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class ScreenshotManager:
    """截图管理类"""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    def add_screenshot(
        self,
        file_path: str,
        file_hash: str,
        width: int,
        height: int,
        metadata: dict = None,
    ) -> int | None:
        """添加截图记录

        Args:
            file_path: 截图文件路径
            file_hash: 文件哈希值
            width: 图像宽度
            height: 图像高度
            metadata: 元数据字典，可包含以下键：
                - screen_id: 屏幕ID (默认0)
                - app_name: 应用名称
                - window_title: 窗口标题
                - event_id: 事件ID
        """
        if metadata is None:
            metadata = {}

        screen_id = metadata.get("screen_id", 0)
        app_name = metadata.get("app_name")
        window_title = metadata.get("window_title")
        event_id = metadata.get("event_id")
        try:
            with self.db_base.get_session() as session:
                # 首先检查是否已存在相同路径的截图
                existing_path = session.query(Screenshot).filter_by(file_path=file_path).first()
                if existing_path:
                    logger.debug(f"跳过重复路径截图: {file_path}")
                    return existing_path.id

                # 检查是否已存在相同哈希的截图
                existing_hash = session.query(Screenshot).filter_by(file_hash=file_hash).first()
                if existing_hash and config.get("jobs.recorder.params.deduplicate"):
                    logger.debug(f"跳过重复哈希截图: {file_path}")
                    return existing_hash.id

                file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0

                screenshot = Screenshot(
                    file_path=file_path,
                    file_hash=file_hash,
                    file_size=file_size,
                    width=width,
                    height=height,
                    screen_id=screen_id,
                    app_name=app_name,
                    window_title=window_title,
                    event_id=event_id,
                )

                session.add(screenshot)
                session.flush()  # 获取ID

                logger.debug(f"添加截图记录: {screenshot.id}")
                return screenshot.id

        except SQLAlchemyError as e:
            logger.error(f"添加截图记录失败: {e}")
            return None

    def get_screenshot_by_id(self, screenshot_id: int) -> dict | None:
        """根据ID获取截图"""
        try:
            with self.db_base.get_session() as session:
                screenshot = session.query(Screenshot).filter_by(id=screenshot_id).first()
                if screenshot:
                    # 转换为字典避免会话分离问题
                    return {
                        "id": screenshot.id,
                        "file_path": screenshot.file_path,
                        "file_hash": screenshot.file_hash,
                        "file_size": screenshot.file_size,
                        "width": screenshot.width,
                        "height": screenshot.height,
                        "screen_id": screenshot.screen_id,
                        "app_name": screenshot.app_name,
                        "window_title": screenshot.window_title,
                        "created_at": screenshot.created_at,
                        "processed_at": screenshot.processed_at,
                        "is_processed": screenshot.is_processed,
                        "file_deleted": screenshot.file_deleted or False,
                    }
                return None
        except SQLAlchemyError as e:
            logger.error(f"获取截图失败: {e}")
            return None

    def get_screenshot_by_path(self, file_path: str) -> dict | None:
        """根据文件路径获取截图"""
        try:
            with self.db_base.get_session() as session:
                screenshot = session.query(Screenshot).filter_by(file_path=file_path).first()
                if screenshot:
                    # 转换为字典避免会话分离问题
                    return {
                        "id": screenshot.id,
                        "file_path": screenshot.file_path,
                        "file_hash": screenshot.file_hash,
                        "file_size": screenshot.file_size,
                        "width": screenshot.width,
                        "height": screenshot.height,
                        "screen_id": screenshot.screen_id,
                        "app_name": screenshot.app_name,
                        "window_title": screenshot.window_title,
                        "created_at": screenshot.created_at,
                        "processed_at": screenshot.processed_at,
                        "is_processed": screenshot.is_processed,
                    }
                return None
        except SQLAlchemyError as e:
            logger.error(f"根据路径获取截图失败: {e}")
            return None

    def update_screenshot_processed(self, screenshot_id: int):
        """更新截图处理状态"""
        try:
            with self.db_base.get_session() as session:
                screenshot = session.query(Screenshot).filter_by(id=screenshot_id).first()
                if screenshot:
                    screenshot.is_processed = True
                    screenshot.processed_at = datetime.now()
                    logger.debug(f"更新截图处理状态: {screenshot_id}")
                else:
                    logger.warning(f"未找到截图记录: {screenshot_id}")
        except SQLAlchemyError as e:
            logger.error(f"更新截图处理状态失败: {e}")

    def get_screenshot_count(self, exclude_deleted: bool = False) -> int:
        """获取截图总数

        Args:
            exclude_deleted: 是否排除已删除文件的记录

        Returns:
            截图总数
        """
        try:
            with self.db_base.get_session() as session:
                query = session.query(Screenshot)
                if exclude_deleted:
                    # 排除 file_deleted=True 的记录（包括 None 和 False）
                    query = query.filter(Screenshot.file_deleted.is_not(True))
                count = query.count()
                return count
        except SQLAlchemyError as e:
            logger.error(f"获取截图总数失败: {e}")
            return 0

    def search_screenshots(
        self,
        query: str = None,
        start_date: datetime = None,
        end_date: datetime = None,
        app_name: str = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """搜索截图"""
        try:
            with self.db_base.get_session() as session:
                # 基础查询
                query_obj = session.query(Screenshot, OCRResult.text_content).outerjoin(
                    OCRResult, Screenshot.id == OCRResult.screenshot_id
                )

                # 添加条件
                if start_date:
                    query_obj = query_obj.filter(Screenshot.created_at >= start_date)

                if end_date:
                    query_obj = query_obj.filter(Screenshot.created_at <= end_date)

                if app_name:
                    query_obj = query_obj.filter(Screenshot.app_name.like(f"%{app_name}%"))

                if query:
                    query_obj = query_obj.filter(OCRResult.text_content.like(f"%{query}%"))

                # 应用分页：先排序，再应用offset和limit
                results = (
                    query_obj.order_by(Screenshot.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                    .all()
                )

                # 格式化结果
                formatted_results = []
                for screenshot, text_content in results:
                    formatted_results.append(
                        {
                            "id": screenshot.id,
                            "file_path": screenshot.file_path,
                            "app_name": screenshot.app_name,
                            "window_title": screenshot.window_title,
                            "created_at": screenshot.created_at,
                            "text_content": text_content,
                            "width": screenshot.width,
                            "height": screenshot.height,
                            "file_deleted": screenshot.file_deleted or False,
                        }
                    )

                return formatted_results

        except SQLAlchemyError as e:
            logger.error(f"搜索截图失败: {e}")
            return []

    def get_unprocessed_screenshots(self, limit: int = 100) -> list[dict[str, Any]]:
        """获取未分配事件的截图列表（按时间升序）

        Args:
            limit: 最多返回的截图数量

        Returns:
            截图列表
        """
        try:
            with self.db_base.get_session() as session:
                screenshots = (
                    session.query(Screenshot)
                    .filter(Screenshot.event_id.is_(None))
                    .order_by(Screenshot.created_at.asc())
                    .limit(limit)
                    .all()
                )

                return [
                    {
                        "id": s.id,
                        "file_path": s.file_path,
                        "app_name": s.app_name,
                        "window_title": s.window_title,
                        "created_at": s.created_at,
                    }
                    for s in screenshots
                ]
        except SQLAlchemyError as e:
            logger.error(f"获取未处理截图失败: {e}")
            return []
