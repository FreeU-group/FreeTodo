"""日记管理器 - 负责日记及标签关联的数据库操作"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from storage.database_base import DatabaseBase
from storage.models import (
    Journal,
    JournalActivityRelation,
    JournalTagRelation,
    JournalTodoRelation,
    Tag,
)
from storage.sql_utils import col
from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()

_UNSET = object()


@dataclass(frozen=True)
class JournalCreatePayload:
    """创建日记的聚合参数"""

    name: str
    user_notes: str
    date: datetime
    uid: str | None = None
    content_format: str = "markdown"
    content_objective: str | None = None
    content_ai: str | None = None
    mood: str | None = None
    energy: int | None = None
    day_bucket_start: datetime | None = None
    tags: list[str] | None = None
    related_todo_ids: list[int] | None = None
    related_activity_ids: list[int] | None = None


@dataclass(frozen=True)
class JournalUpdatePayload:
    """更新日记的聚合参数"""

    name: str | Any = _UNSET
    user_notes: str | Any = _UNSET
    date: datetime | Any = _UNSET
    content_format: str | Any = _UNSET
    content_objective: str | None | Any = _UNSET
    content_ai: str | None | Any = _UNSET
    mood: str | None | Any = _UNSET
    energy: int | None | Any = _UNSET
    day_bucket_start: datetime | None | Any = _UNSET
    tags: list[str] | None | Any = _UNSET
    related_todo_ids: list[int] | None | Any = _UNSET
    related_activity_ids: list[int] | None | Any = _UNSET


class JournalManager:
    """日记管理类"""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    # ===== 工具方法 =====
    def _serialize_journal(
        self,
        journal: Journal,
        tags: Iterable[Tag] | None = None,
        related_todo_ids: list[int] | None = None,
        related_activity_ids: list[int] | None = None,
    ) -> dict[str, Any]:
        tag_list = [{"id": t.id, "tag_name": t.tag_name} for t in tags] if tags else []
        return {
            "id": journal.id,
            "uid": journal.uid,
            "name": journal.name,
            "user_notes": journal.user_notes,
            "date": journal.date,
            "content_format": journal.content_format or "markdown",
            "content_objective": journal.content_objective,
            "content_ai": journal.content_ai,
            "mood": journal.mood,
            "energy": journal.energy,
            "day_bucket_start": journal.day_bucket_start,
            "created_at": journal.created_at,
            "updated_at": journal.updated_at,
            "deleted_at": journal.deleted_at,
            "tags": tag_list,
            "related_todo_ids": related_todo_ids or [],
            "related_activity_ids": related_activity_ids or [],
        }

    def _get_tags_for_journal(self, session, journal_id: int) -> list[Tag]:
        """获取日记关联的标签"""
        return (
            session.query(Tag)
            .join(JournalTagRelation, col(JournalTagRelation.tag_id) == col(Tag.id))
            .filter(col(JournalTagRelation.journal_id) == journal_id)
            .filter(col(Tag.deleted_at).is_(None))
            .all()
        )

    def _get_related_todo_ids(self, session, journal_id: int) -> list[int]:
        return [
            rel.todo_id
            for rel in session.query(JournalTodoRelation)
            .filter(col(JournalTodoRelation.journal_id) == journal_id)
            .filter(col(JournalTodoRelation.deleted_at).is_(None))
            .all()
        ]

    def _get_related_activity_ids(self, session, journal_id: int) -> list[int]:
        return [
            rel.activity_id
            for rel in session.query(JournalActivityRelation)
            .filter(col(JournalActivityRelation.journal_id) == journal_id)
            .filter(col(JournalActivityRelation.deleted_at).is_(None))
            .all()
        ]

    def _replace_tags(self, session, journal_id: int, tags: list[str] | None) -> None:
        """替换日记标签关联"""
        session.query(JournalTagRelation).filter_by(journal_id=journal_id).delete(
            synchronize_session=False
        )

        if not tags:
            return

        cleaned: list[str] = []
        seen: set[str] = set()
        for tag_name in tags:
            name = (tag_name or "").strip()
            if not name or name in seen:
                continue
            seen.add(name)
            cleaned.append(name)

        for tag_name in cleaned:
            tag = session.query(Tag).filter_by(tag_name=tag_name).first()
            if not tag:
                tag = Tag(tag_name=tag_name)
                session.add(tag)
                session.flush()
            if tag.id is None:
                raise ValueError("Tag must have an id before creating relation.")
            session.add(JournalTagRelation(journal_id=journal_id, tag_id=tag.id))

    def _replace_related_todos(self, session, journal_id: int, todo_ids: list[int] | None) -> None:
        session.query(JournalTodoRelation).filter_by(journal_id=journal_id).delete(
            synchronize_session=False
        )

        if not todo_ids:
            return

        for todo_id in dict.fromkeys(todo_ids):
            session.add(JournalTodoRelation(journal_id=journal_id, todo_id=todo_id))

    def _replace_related_activities(
        self, session, journal_id: int, activity_ids: list[int] | None
    ) -> None:
        session.query(JournalActivityRelation).filter_by(journal_id=journal_id).delete(
            synchronize_session=False
        )

        if not activity_ids:
            return

        for activity_id in dict.fromkeys(activity_ids):
            session.add(JournalActivityRelation(journal_id=journal_id, activity_id=activity_id))

    def _apply_journal_updates(self, journal: Journal, payload: JournalUpdatePayload) -> None:
        if payload.content_format is not _UNSET:
            journal.content_format = payload.content_format or "markdown"

        updates = {
            "name": payload.name,
            "user_notes": payload.user_notes,
            "date": payload.date,
            "content_objective": payload.content_objective,
            "content_ai": payload.content_ai,
            "mood": payload.mood,
            "energy": payload.energy,
            "day_bucket_start": payload.day_bucket_start,
        }

        for attr, value in updates.items():
            if value is not _UNSET:
                setattr(journal, attr, value)

    # ===== CRUD 接口 =====
    def create_journal(self, payload: JournalCreatePayload) -> int | None:
        """创建日记"""
        try:
            with self.db_base.get_session() as session:
                journal_data = {
                    "name": payload.name,
                    "user_notes": payload.user_notes,
                    "date": payload.date,
                    "content_format": payload.content_format or "markdown",
                    "content_objective": payload.content_objective,
                    "content_ai": payload.content_ai,
                    "mood": payload.mood,
                    "energy": payload.energy,
                    "day_bucket_start": payload.day_bucket_start,
                }
                if payload.uid:
                    journal_data["uid"] = payload.uid
                journal = Journal(**journal_data)
                session.add(journal)
                session.flush()
                if journal.id is None:
                    raise ValueError("Journal must have an id before linking relations.")

                # 处理标签与关联
                self._replace_tags(session, journal.id, payload.tags)
                self._replace_related_todos(session, journal.id, payload.related_todo_ids)
                self._replace_related_activities(session, journal.id, payload.related_activity_ids)

                logger.info(f"创建日记成功: {journal.id} - {payload.name}")
                return journal.id
        except SQLAlchemyError as e:
            logger.error(f"创建日记失败: {e}")
            return None

    def get_journal(self, journal_id: int) -> dict[str, Any] | None:
        """获取单个日记"""
        try:
            with self.db_base.get_session() as session:
                journal = (
                    session.query(Journal)
                    .filter(col(Journal.id) == journal_id)
                    .filter(col(Journal.deleted_at).is_(None))
                    .first()
                )
                if not journal:
                    return None

                tags = self._get_tags_for_journal(session, journal.id)
                related_todo_ids = self._get_related_todo_ids(session, journal.id)
                related_activity_ids = self._get_related_activity_ids(session, journal.id)
                return self._serialize_journal(
                    journal,
                    tags,
                    related_todo_ids=related_todo_ids,
                    related_activity_ids=related_activity_ids,
                )
        except SQLAlchemyError as e:
            logger.error(f"获取日记失败: {e}")
            return None

    def list_journals(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
        start_date=None,
        end_date=None,
    ) -> list[dict[str, Any]]:
        """列出日记"""
        try:
            with self.db_base.get_session() as session:
                query = session.query(Journal).filter(col(Journal.deleted_at).is_(None))

                if start_date is not None:
                    query = query.filter(col(Journal.date) >= start_date)
                if end_date is not None:
                    query = query.filter(col(Journal.date) <= end_date)

                journals = (
                    query.order_by(col(Journal.date).desc(), col(Journal.created_at).desc())
                    .offset(offset)
                    .limit(limit)
                    .all()
                )

                results = []
                for journal in journals:
                    tags = self._get_tags_for_journal(session, journal.id)
                    related_todo_ids = self._get_related_todo_ids(session, journal.id)
                    related_activity_ids = self._get_related_activity_ids(session, journal.id)
                    results.append(
                        self._serialize_journal(
                            journal,
                            tags,
                            related_todo_ids=related_todo_ids,
                            related_activity_ids=related_activity_ids,
                        )
                    )
                return results
        except SQLAlchemyError as e:
            logger.error(f"列出日记失败: {e}")
            return []

    def count_journals(self, start_date=None, end_date=None) -> int:
        """统计日记数量"""
        try:
            with self.db_base.get_session() as session:
                query = session.query(Journal).filter(col(Journal.deleted_at).is_(None))
                if start_date is not None:
                    query = query.filter(col(Journal.date) >= start_date)
                if end_date is not None:
                    query = query.filter(col(Journal.date) <= end_date)
                return query.count()
        except SQLAlchemyError as e:
            logger.error(f"统计日记数量失败: {e}")
            return 0

    def update_journal(self, journal_id: int, payload: JournalUpdatePayload) -> bool:
        """更新日记"""
        try:
            with self.db_base.get_session() as session:
                journal = (
                    session.query(Journal)
                    .filter(col(Journal.id) == journal_id)
                    .filter(col(Journal.deleted_at).is_(None))
                    .first()
                )
                if not journal:
                    logger.warning(f"日记不存在: {journal_id}")
                    return False

                self._apply_journal_updates(journal, payload)

                if payload.tags is not _UNSET:
                    self._replace_tags(session, journal_id, payload.tags)

                if payload.related_todo_ids is not _UNSET:
                    self._replace_related_todos(session, journal_id, payload.related_todo_ids)

                if payload.related_activity_ids is not _UNSET:
                    self._replace_related_activities(
                        session, journal_id, payload.related_activity_ids
                    )

                journal.updated_at = get_utc_now()
                session.flush()
                logger.info(f"更新日记: {journal_id}")
                return True
        except SQLAlchemyError as e:
            logger.error(f"更新日记失败: {e}")
            return False

    def delete_journal(self, journal_id: int) -> bool:
        """删除日记（物理删除）"""
        try:
            with self.db_base.get_session() as session:
                journal = session.query(Journal).filter_by(id=journal_id).first()
                if not journal:
                    logger.warning(f"日记不存在: {journal_id}")
                    return False

                # 删除标签关联
                session.query(JournalTagRelation).filter_by(journal_id=journal_id).delete(
                    synchronize_session=False
                )
                session.query(JournalTodoRelation).filter_by(journal_id=journal_id).delete(
                    synchronize_session=False
                )
                session.query(JournalActivityRelation).filter_by(journal_id=journal_id).delete(
                    synchronize_session=False
                )

                session.delete(journal)
                session.flush()
                logger.info(f"删除日记: {journal_id}")
                return True
        except SQLAlchemyError as e:
            logger.error(f"删除日记失败: {e}")
            return False
