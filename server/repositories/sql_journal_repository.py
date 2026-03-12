"""基于 SQLAlchemy 的 Journal 仓库实现

复用现有的 JournalManager 逻辑，提供符合仓库接口的数据访问层。
"""

from datetime import datetime
from typing import Any

from repositories.interfaces import IJournalRepository
from storage.database_base import DatabaseBase
from storage.journal_manager import JournalManager


class SqlJournalRepository(IJournalRepository):
    """基于 SQLAlchemy 的 Journal 仓库实现"""

    def __init__(self, db_base: DatabaseBase):
        self._manager = JournalManager(db_base)

    def get_by_id(self, journal_id: int) -> dict[str, Any] | None:
        return self._manager.get_journal(journal_id)

    def list_journals(
        self,
        limit: int,
        offset: int,
        start_date: datetime | None,
        end_date: datetime | None,
    ) -> list[dict[str, Any]]:
        return self._manager.list_journals(
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date,
        )

    def count(self, start_date: datetime | None, end_date: datetime | None) -> int:
        return self._manager.count_journals(start_date=start_date, end_date=end_date)

    def create(self, payload: Any) -> int | None:
        return self._manager.create_journal(payload)

    def update(self, journal_id: int, payload: Any) -> bool:
        return self._manager.update_journal(journal_id, payload)

    def delete(self, journal_id: int) -> bool:
        return self._manager.delete_journal(journal_id)
