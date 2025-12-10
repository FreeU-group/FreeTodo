"""活动管理器 - 负责活动相关的数据库操作"""

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.models import Activity, ActivityEventRelation, Event
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class ActivityManager:
    """活动管理类"""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    def create_activity(
        self,
        start_time: datetime,
        end_time: datetime,
        ai_title: str,
        ai_summary: str,
        event_ids: list[int],
    ) -> int | None:
        """创建活动记录并关联事件

        Args:
            start_time: 活动开始时间
            end_time: 活动结束时间
            ai_title: AI生成的活动标题
            ai_summary: AI生成的活动摘要
            event_ids: 关联的事件ID列表

        Returns:
            活动ID，失败返回None
        """
        try:
            with self.db_base.get_session() as session:
                # 创建活动记录
                activity = Activity(
                    start_time=start_time,
                    end_time=end_time,
                    ai_title=ai_title,
                    ai_summary=ai_summary,
                    event_count=len(event_ids),
                )
                session.add(activity)
                session.flush()

                # 创建关联关系
                for event_id in event_ids:
                    relation = ActivityEventRelation(
                        activity_id=activity.id,
                        event_id=event_id,
                    )
                    session.add(relation)

                session.commit()
                logger.info(f"创建活动 {activity.id}: {ai_title}，包含 {len(event_ids)} 个事件")
                return activity.id
        except SQLAlchemyError as e:
            logger.error(f"创建活动失败: {e}")
            return None

    def get_activities(
        self,
        limit: int = 50,
        offset: int = 0,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """查询活动列表

        Args:
            limit: 返回数量限制
            offset: 偏移量
            start_date: 开始日期
            end_date: 结束日期

        Returns:
            活动列表
        """
        try:
            with self.db_base.get_session() as session:
                q = session.query(Activity).filter(Activity.deleted_at.is_(None))
                if start_date:
                    q = q.filter(Activity.start_time >= start_date)
                if end_date:
                    q = q.filter(Activity.start_time <= end_date)

                q = q.order_by(Activity.start_time.desc()).offset(offset).limit(limit)
                activities = q.all()

                results: list[dict[str, Any]] = []
                for activity in activities:
                    results.append(
                        {
                            "id": activity.id,
                            "start_time": activity.start_time,
                            "end_time": activity.end_time,
                            "ai_title": activity.ai_title,
                            "ai_summary": activity.ai_summary,
                            "event_count": activity.event_count,
                            "created_at": activity.created_at,
                            "updated_at": activity.updated_at,
                        }
                    )
                return results
        except SQLAlchemyError as e:
            logger.error(f"查询活动列表失败: {e}")
            return []

    def count_activities(
        self,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> int:
        """统计活动总数"""
        try:
            with self.db_base.get_session() as session:
                q = session.query(Activity).filter(Activity.deleted_at.is_(None))
                if start_date:
                    q = q.filter(Activity.start_time >= start_date)
                if end_date:
                    q = q.filter(Activity.start_time <= end_date)
                return q.count()
        except SQLAlchemyError as e:
            logger.error(f"统计活动数量失败: {e}")
            return 0

    def get_activity_events(self, activity_id: int) -> list[int]:
        """获取活动关联的事件ID列表

        Args:
            activity_id: 活动ID

        Returns:
            事件ID列表
        """
        try:
            with self.db_base.get_session() as session:
                relations = (
                    session.query(ActivityEventRelation)
                    .filter(
                        ActivityEventRelation.activity_id == activity_id,
                        ActivityEventRelation.deleted_at.is_(None),
                    )
                    .all()
                )
                return [r.event_id for r in relations]
        except SQLAlchemyError as e:
            logger.error(f"获取活动关联事件失败: {e}")
            return []

    def get_unprocessed_events(self, query_start_time: datetime) -> list[Event]:
        """查询未关联到活动的已完成且有AI总结的事件

        Args:
            query_start_time: 查询起始时间

        Returns:
            事件列表
        """
        try:
            with self.db_base.get_session() as session:
                # 查询已完成且有AI总结的事件
                events = (
                    session.query(Event)
                    .filter(
                        Event.end_time.isnot(None),
                        Event.ai_title.isnot(None),
                        Event.ai_summary.isnot(None),
                        Event.start_time >= query_start_time,
                        Event.deleted_at.is_(None),
                    )
                    .order_by(Event.start_time.asc())
                    .all()
                )

                # 过滤掉已关联到活动的事件
                unprocessed_events = []
                for event in events:
                    # 检查是否已关联
                    relation = (
                        session.query(ActivityEventRelation)
                        .filter(
                            ActivityEventRelation.event_id == event.id,
                            ActivityEventRelation.deleted_at.is_(None),
                        )
                        .first()
                    )
                    if not relation:
                        # 在session关闭前访问所有需要的属性，确保它们被加载
                        # 这样可以避免在session外访问时触发refresh操作
                        _ = (
                            event.id,
                            event.start_time,
                            event.end_time,
                            event.ai_title,
                            event.ai_summary,
                            event.app_name,
                            event.window_title,
                        )
                        # 将对象从session中分离，使其可以在session外使用
                        session.expunge(event)
                        unprocessed_events.append(event)

                return unprocessed_events
        except SQLAlchemyError as e:
            logger.error(f"查询未处理事件失败: {e}")
            return []

    def activity_exists_for_time_window(self, window_start: datetime, window_end: datetime) -> bool:
        """检查指定时间窗口是否已存在活动记录

        Args:
            window_start: 窗口开始时间
            window_end: 窗口结束时间

        Returns:
            是否存在
        """
        try:
            with self.db_base.get_session() as session:
                activity = (
                    session.query(Activity)
                    .filter(
                        Activity.start_time == window_start,
                        Activity.end_time == window_end,
                        Activity.deleted_at.is_(None),
                    )
                    .first()
                )
                return activity is not None
        except SQLAlchemyError as e:
            logger.error(f"检查活动是否存在失败: {e}")
            return False

    def activity_exists_for_event(self, event: Event) -> bool:
        """检查事件是否已关联到某个活动

        Args:
            event: 事件对象

        Returns:
            是否已关联
        """
        try:
            with self.db_base.get_session() as session:
                relation = (
                    session.query(ActivityEventRelation)
                    .filter(
                        ActivityEventRelation.event_id == event.id,
                        ActivityEventRelation.deleted_at.is_(None),
                    )
                    .first()
                )
                return relation is not None
        except SQLAlchemyError as e:
            logger.error(f"检查事件是否已关联失败: {e}")
            return False

    def activity_overlaps_with_event(self, event: Event, tolerance_seconds: int = 60) -> bool:
        """检查是否存在与事件时间范围重叠的活动记录

        Args:
            event: 事件对象
            tolerance_seconds: 容忍的时间差（秒），用于处理边界情况

        Returns:
            是否存在重叠
        """
        try:
            if not event.end_time:
                return False

            with self.db_base.get_session() as session:
                # 查询与事件时间范围有重叠的活动
                # 重叠条件：活动的开始时间 < 事件的结束时间 + 容忍度
                # 且活动的结束时间 > 事件的开始时间 - 容忍度
                activities = (
                    session.query(Activity)
                    .filter(
                        Activity.start_time < event.end_time + timedelta(seconds=tolerance_seconds),
                        Activity.end_time > event.start_time - timedelta(seconds=tolerance_seconds),
                        Activity.deleted_at.is_(None),
                    )
                    .all()
                )
                return len(activities) > 0
        except SQLAlchemyError as e:
            logger.error(f"检查活动重叠失败: {e}")
            return False
