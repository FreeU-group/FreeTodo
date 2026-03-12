"""GPS 位置记录的 CRUD 管理器"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlmodel import col, func, select

from storage.models import LocationRecord
from util.logging_config import get_logger

if TYPE_CHECKING:
    from datetime import datetime

    from storage.database_base import DatabaseBase

logger = get_logger()


class LocationManager:
    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    def add(self, record: LocationRecord) -> LocationRecord:
        with self.db_base.get_session() as session:
            session.add(record)
            session.commit()
            session.refresh(record)
            session.expunge(record)
            return record

    def get_latest(self) -> LocationRecord | None:
        with self.db_base.get_session() as session:
            stmt = select(LocationRecord).order_by(col(LocationRecord.timestamp).desc()).limit(1)
            record = session.exec(stmt).first()
            if record:
                session.expunge(record)
            return record

    def get_history(
        self,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[LocationRecord]:
        with self.db_base.get_session() as session:
            stmt = select(LocationRecord)
            if start:
                stmt = stmt.where(col(LocationRecord.timestamp) >= start)
            if end:
                stmt = stmt.where(col(LocationRecord.timestamp) <= end)
            stmt = stmt.order_by(col(LocationRecord.timestamp).desc()).offset(offset).limit(limit)
            records = list(session.exec(stmt).all())
            for r in records:
                session.expunge(r)
            return records

    def count(self, start: datetime | None = None, end: datetime | None = None) -> int:
        with self.db_base.get_session() as session:
            stmt = select(func.count()).select_from(LocationRecord)
            if start:
                stmt = stmt.where(col(LocationRecord.timestamp) >= start)
            if end:
                stmt = stmt.where(col(LocationRecord.timestamp) <= end)
            return session.exec(stmt).one()
