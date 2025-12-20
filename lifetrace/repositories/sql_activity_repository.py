"""基于 SQLAlchemy 的 Activity 仓库实现

复用现有的 ActivityManager 逻辑，提供符合仓库接口的数据访问层。
"""

from datetime import datetime
from typing import Any

from lifetrace.repositories.interfaces import IActivityRepository
from lifetrace.storage.activity_manager import ActivityManager
from lifetrace.storage.database_base import DatabaseBase


class SqlActivityRepository(IActivityRepository):
    """基于 SQLAlchemy 的 Activity 仓库实现"""

    def __init__(self, db_base: DatabaseBase):
        self._manager = ActivityManager(db_base)

    def get_by_id(self, activity_id: int) -> dict[str, Any] | None:
        return self._manager.get_activity(activity_id)

    def get_activities(
        self,
        limit: int,
        offset: int,
        start_date: datetime | None,
        end_date: datetime | None,
    ) -> list[dict[str, Any]]:
        return self._manager.get_activities(
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date,
        )

    def count_activities(
        self,
        start_date: datetime | None,
        end_date: datetime | None,
    ) -> int:
        return self._manager.count_activities(
            start_date=start_date,
            end_date=end_date,
        )

    def get_activity_events(self, activity_id: int) -> list[int]:
        return self._manager.get_activity_events(activity_id)

    def create_activity(
        self,
        start_time: datetime,
        end_time: datetime,
        ai_title: str,
        ai_summary: str,
        event_ids: list[int],
    ) -> int | None:
        return self._manager.create_activity(
            start_time=start_time,
            end_time=end_time,
            ai_title=ai_title,
            ai_summary=ai_summary,
            event_ids=event_ids,
        )

    def activity_exists_for_event_id(self, event_id: int) -> bool:
        return self._manager.activity_exists_for_event_id(event_id)
