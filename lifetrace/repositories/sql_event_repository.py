"""基于 SQLAlchemy 的 Event 仓库实现

复用现有的 EventManager 和 OcrManager 逻辑，提供符合仓库接口的数据访问层。
"""

from datetime import datetime
from typing import Any

from lifetrace.repositories.interfaces import IEventRepository, IOcrRepository
from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.event_manager import EventManager
from lifetrace.storage.ocr_manager import OCRManager


class SqlEventRepository(IEventRepository):
    """基于 SQLAlchemy 的 Event 仓库实现"""

    def __init__(self, db_base: DatabaseBase):
        self._manager = EventManager(db_base)

    def get_summary(self, event_id: int) -> dict[str, Any] | None:
        return self._manager.get_event_summary(event_id)

    def list_events(
        self,
        limit: int,
        offset: int,
        start_date: datetime | None,
        end_date: datetime | None,
        app_name: str | None,
    ) -> list[dict[str, Any]]:
        return self._manager.list_events(
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date,
            app_name=app_name,
        )

    def count_events(
        self,
        start_date: datetime | None,
        end_date: datetime | None,
        app_name: str | None,
    ) -> int:
        return self._manager.count_events(
            start_date=start_date,
            end_date=end_date,
            app_name=app_name,
        )

    def get_screenshots(self, event_id: int) -> list[dict[str, Any]]:
        return self._manager.get_event_screenshots(event_id)

    def update_summary(self, event_id: int, ai_title: str, ai_summary: str) -> bool:
        return self._manager.update_event_summary(event_id, ai_title, ai_summary)

    def get_events_by_ids(self, event_ids: list[int]) -> list[dict[str, Any]]:
        return self._manager.get_events_by_ids(event_ids)


class SqlOcrRepository(IOcrRepository):
    """基于 SQLAlchemy 的 OCR 仓库实现"""

    def __init__(self, db_base: DatabaseBase):
        self._manager = OCRManager(db_base)

    def get_results_by_screenshot(self, screenshot_id: int) -> list[dict[str, Any]]:
        return self._manager.get_ocr_results_by_screenshot(screenshot_id)
