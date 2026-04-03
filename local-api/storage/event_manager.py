"""事件管理器 - 负责事件相关的数据库操作"""

import importlib
from datetime import datetime
from typing import Any

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from storage.database_base import DatabaseBase
from storage.models import Event, Screenshot
from storage.sql_utils import col
from util.logging_config import get_logger
from util.time_utils import get_utc_now

from .event_queries import (
    count_events,
    get_event_id_by_screenshot,
    get_event_screenshots,
    get_event_summary,
    get_event_text,
    get_events_by_ids,
    list_events,
    search_events_simple,
)
from .event_stats import get_app_usage_stats

logger = get_logger()


class EventManager:
    """事件管理类"""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    def _get_last_open_event(self, session: Session) -> Event | None:
        """获取最后一个未结束的事件"""
        return (
            session.query(Event)
            .filter(col(Event.end_time).is_(None))
            .order_by(col(Event.start_time).desc())
            .first()
        )

    def _should_reuse_event(
        self,
        old_app: str | None,
        old_title: str | None,
        new_app: str | None,
        new_title: str | None,
    ) -> bool:
        """判断是否应该复用事件"""
        old_app_norm = (old_app or "").strip().lower()
        new_app_norm = (new_app or "").strip().lower()
        old_title_norm = (old_title or "").strip()
        new_title_norm = (new_title or "").strip()

        if old_app_norm != new_app_norm:
            logger.info(f"🔄 应用切换: {old_app} → {new_app} (创建新事件)")
            return False

        if old_title_norm != new_title_norm:
            logger.info(f"📝 窗口标题变化: {old_title} → {new_title} (创建新事件)")
            return False

        logger.info("♻️  应用名和窗口标题都相同，复用事件")
        return True

    def get_active_event(self) -> int | None:
        """获取当前活跃的事件ID"""
        try:
            with self.db_base.get_session() as session:
                last_event = self._get_last_open_event(session)
                if last_event:
                    return last_event.id
                return None
        except SQLAlchemyError as e:
            logger.error(f"获取活跃事件失败: {e}")
            return None

    def get_or_create_event(
        self,
        app_name: str | None,
        window_title: str | None,
        timestamp: datetime | None = None,
    ) -> int | None:
        """按当前前台应用和窗口标题维护事件"""
        try:
            closed_event_id = None

            with self.db_base.get_session() as session:
                now_ts = timestamp or get_utc_now()
                last_event = self._get_last_open_event(session)

                if last_event:
                    logger.info(
                        f"🔍 检查事件复用 - 旧事件ID: {last_event.id}, "
                        f"旧应用: '{last_event.app_name}', 新应用: '{app_name}', "
                        f"旧标题: '{last_event.window_title}', 新标题: '{window_title}'"
                    )
                    should_reuse = self._should_reuse_event(
                        old_app=last_event.app_name,
                        old_title=last_event.window_title,
                        new_app=app_name,
                        new_title=window_title,
                    )
                    logger.info(f"📊 事件复用判断结果: {should_reuse}")

                    if should_reuse:
                        session.flush()
                        logger.info(f"♻️  复用事件 {last_event.id}（不关闭）")
                        return last_event.id
                    else:
                        last_event.end_time = now_ts
                        closed_event_id = last_event.id
                        session.flush()
                        logger.info(
                            f"🔚 关闭旧事件 {closed_event_id}: {last_event.app_name} - {last_event.window_title}"
                        )
                else:
                    logger.info("❌ 没有找到未结束的事件，需要创建新事件")

                new_event = Event(app_name=app_name, window_title=window_title, start_time=now_ts)
                session.add(new_event)
                session.flush()
                new_event_id = new_event.id
                logger.info(
                    f"✨ 创建新事件 {new_event_id}: {app_name} - {window_title} (end_time=NULL)"
                )

            if closed_event_id:
                try:
                    logger.info(f"📝 触发已关闭事件 {closed_event_id} 的摘要生成")
                    summary_module = importlib.import_module("llm.event_summary_service")
                    summary_module.generate_event_summary_async(closed_event_id)
                except Exception as e:
                    logger.error(f"触发事件摘要生成失败: {e}")
            else:
                logger.info(f"✅ 无需生成摘要（新事件 {new_event_id}，无旧事件关闭）")

            return new_event_id
        except SQLAlchemyError as e:
            logger.error(f"获取或创建事件失败: {e}")
            return None

    def close_active_event(self, end_time: datetime | None = None) -> bool:
        """主动结束当前事件"""
        try:
            closed_event_id = None
            with self.db_base.get_session() as session:
                last_event = self._get_last_open_event(session)
                if last_event and last_event.end_time is None:
                    last_event.end_time = end_time or get_utc_now()
                    closed_event_id = last_event.id
                    session.flush()

            if closed_event_id:
                try:
                    summary_module = importlib.import_module("llm.event_summary_service")
                    summary_module.generate_event_summary_async(closed_event_id)
                except Exception as e:
                    logger.error(f"触发事件摘要生成失败: {e}")

            return closed_event_id is not None
        except SQLAlchemyError as e:
            logger.error(f"结束事件失败: {e}")
            return False

    def update_event_summary(self, event_id: int, ai_title: str, ai_summary: str) -> bool:
        """更新事件的AI生成标题和摘要"""
        try:
            with self.db_base.get_session() as session:
                event = session.query(Event).filter(col(Event.id) == event_id).first()
                if event:
                    event.ai_title = ai_title
                    event.ai_summary = ai_summary
                    session.commit()
                    logger.info(f"事件 {event_id} AI摘要更新成功")
                    return True
                else:
                    logger.warning(f"事件 {event_id} 不存在")
                    return False
        except SQLAlchemyError as e:
            logger.error(f"更新事件AI摘要失败: {e}")
            return False

    def get_active_event_by_app(self, app_name: str) -> int | None:
        """获取指定应用的活跃事件ID"""
        try:
            with self.db_base.get_session() as session:
                event = (
                    session.query(Event)
                    .filter(
                        col(Event.app_name) == app_name,
                        col(Event.status).in_(["new", "processing"]),
                    )
                    .order_by(col(Event.start_time).desc())
                    .first()
                )
                return event.id if event else None
        except SQLAlchemyError as e:
            logger.error(f"获取活跃事件失败: {e}")
            return None

    def create_event_for_screenshot(
        self,
        screenshot_id: int,
        app_name: str,
        window_title: str,
        timestamp: datetime,
    ) -> int | None:
        """为截图创建新事件"""
        try:
            with self.db_base.get_session() as session:
                new_event = Event(
                    app_name=app_name,
                    window_title=window_title,
                    start_time=timestamp,
                    status="new",
                )
                session.add(new_event)
                session.flush()

                screenshot = (
                    session.query(Screenshot).filter(col(Screenshot.id) == screenshot_id).first()
                )
                if screenshot:
                    screenshot.event_id = new_event.id
                    session.flush()

                logger.info(f"✨ 创建新事件 {new_event.id}: {app_name} (status=new)")
                return new_event.id
        except SQLAlchemyError as e:
            logger.error(f"创建事件失败: {e}")
            return None

    def add_screenshot_to_event(self, screenshot_id: int, event_id: int) -> bool:
        """将截图添加到指定事件"""
        try:
            with self.db_base.get_session() as session:
                screenshot = (
                    session.query(Screenshot).filter(col(Screenshot.id) == screenshot_id).first()
                )
                if not screenshot:
                    logger.warning(f"截图 {screenshot_id} 不存在")
                    return False

                event = session.query(Event).filter(col(Event.id) == event_id).first()
                if not event:
                    logger.warning(f"事件 {event_id} 不存在")
                    return False

                screenshot.event_id = event_id

                if event.status == "new":
                    event.status = "processing"

                session.flush()
                logger.debug(
                    f"截图 {screenshot_id} 已添加到事件 {event_id}，事件状态: {event.status}"
                )
                return True
        except SQLAlchemyError as e:
            logger.error(f"添加截图到事件失败: {e}")
            return False

    def complete_event(self, event_id: int, end_time: datetime) -> bool:
        """完成事件"""
        try:
            with self.db_base.get_session() as session:
                event = session.query(Event).filter(col(Event.id) == event_id).first()
                if not event:
                    logger.warning(f"事件 {event_id} 不存在")
                    return False

                event.status = "done"
                event.end_time = end_time
                session.flush()

                logger.info(f"🔚 完成事件 {event_id}: {event.app_name} (status=done)")

            try:
                logger.info(f"📝 触发已完成事件 {event_id} 的摘要生成")
                summary_module = importlib.import_module("llm.event_summary_service")
                summary_module.generate_event_summary_async(event_id)
            except Exception as e:
                logger.error(f"触发事件摘要生成失败: {e}")

            return True
        except SQLAlchemyError as e:
            logger.error(f"完成事件失败: {e}")
            return False

    # 委托给 event_queries 模块的方法
    def list_events(
        self,
        limit: int = 50,
        offset: int = 0,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        app_name: str | None = None,
    ) -> list[dict[str, Any]]:
        """列出事件摘要"""
        return list_events(self.db_base, limit, offset, start_date, end_date, app_name)

    def count_events(
        self,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        app_name: str | None = None,
    ) -> int:
        """统计事件总数"""
        return count_events(self.db_base, start_date, end_date, app_name)

    def get_event_screenshots(self, event_id: int) -> list[dict[str, Any]]:
        """获取事件内截图列表"""
        return get_event_screenshots(self.db_base, event_id)

    def search_events_simple(
        self,
        query: str | None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        app_name: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """搜索事件"""
        return search_events_simple(self.db_base, query, start_date, end_date, app_name, limit)

    def get_event_summary(self, event_id: int) -> dict[str, Any] | None:
        """获取单个事件的摘要信息"""
        return get_event_summary(self.db_base, event_id)

    def get_events_by_ids(self, event_ids: list[int]) -> list[dict[str, Any]]:
        """批量获取事件的摘要信息"""
        return get_events_by_ids(self.db_base, event_ids)

    def get_event_id_by_screenshot(self, screenshot_id: int) -> int | None:
        """根据截图ID获取所属事件ID"""
        return get_event_id_by_screenshot(self.db_base, screenshot_id)

    def get_event_text(self, event_id: int) -> str:
        """聚合事件下所有截图的OCR文本内容"""
        return get_event_text(self.db_base, event_id)

    # 委托给 event_stats 模块的方法
    def get_app_usage_stats(
        self,
        days: int | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> dict[str, Any]:
        """获取应用使用统计"""
        return get_app_usage_stats(self.db_base, days, start_date, end_date)
