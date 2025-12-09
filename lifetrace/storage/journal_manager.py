"""日记管理器 - 负责日记及标签关联的数据库操作"""

from collections.abc import Iterable
from datetime import datetime
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.models import Journal, JournalTagRelation, Tag
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class JournalManager:
    """日记管理类"""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    # ===== 工具方法 =====
    def _serialize_journal(
        self,
        journal: Journal,
        tags: Iterable[Tag] | None = None,
    ) -> dict[str, Any]:
        tag_list = [{"id": t.id, "tag_name": t.tag_name} for t in tags] if tags is not None else []
        return {
            "id": journal.id,
            "name": journal.name,
            "user_notes": journal.user_notes,
            "date": journal.date,
            "content_format": journal.content_format or "markdown",
            "created_at": journal.created_at,
            "updated_at": journal.updated_at,
            "deleted_at": journal.deleted_at,
            "tags": tag_list,
        }

    def _get_tags_for_journal(self, session, journal_id: int) -> list[Tag]:
        """获取日记关联的标签"""
        return (
            session.query(Tag)
            .join(JournalTagRelation, JournalTagRelation.tag_id == Tag.id)
            .filter(JournalTagRelation.journal_id == journal_id)
            .filter(Tag.deleted_at.is_(None))
            .all()
        )

    def _replace_tags(self, session, journal_id: int, tag_ids: list[int] | None):
        """替换日记标签关联"""
        session.query(JournalTagRelation).filter_by(journal_id=journal_id).delete(
            synchronize_session=False
        )

        if not tag_ids:
            return

        tags = session.query(Tag).filter(Tag.id.in_(tag_ids)).filter(Tag.deleted_at.is_(None)).all()
        for tag in tags:
            session.add(JournalTagRelation(journal_id=journal_id, tag_id=tag.id))

    # ===== CRUD 接口 =====
    def create_journal(
        self,
        *,
        name: str,
        user_notes: str,
        date,
        content_format: str = "markdown",
        tag_ids: list[int] | None = None,
    ) -> int | None:
        """创建日记"""
        try:
            with self.db_base.get_session() as session:
                journal = Journal(
                    name=name,
                    user_notes=user_notes,
                    date=date,
                    content_format=content_format or "markdown",
                )
                session.add(journal)
                session.flush()

                # 处理标签关联
                self._replace_tags(session, journal.id, tag_ids)

                session.commit()
                logger.info(f"创建日记成功: {journal.id} - {name}")
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
                    .filter(Journal.id == journal_id)
                    .filter(Journal.deleted_at.is_(None))
                    .first()
                )
                if not journal:
                    return None

                tags = self._get_tags_for_journal(session, journal.id)
                return self._serialize_journal(journal, tags)
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
                query = session.query(Journal).filter(Journal.deleted_at.is_(None))

                if start_date is not None:
                    query = query.filter(Journal.date >= start_date)
                if end_date is not None:
                    query = query.filter(Journal.date <= end_date)

                journals = (
                    query.order_by(Journal.date.desc(), Journal.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                    .all()
                )

                results = []
                for journal in journals:
                    tags = self._get_tags_for_journal(session, journal.id)
                    results.append(self._serialize_journal(journal, tags))
                return results
        except SQLAlchemyError as e:
            logger.error(f"列出日记失败: {e}")
            return []

    def count_journals(self, start_date=None, end_date=None) -> int:
        """统计日记数量"""
        try:
            with self.db_base.get_session() as session:
                query = session.query(Journal).filter(Journal.deleted_at.is_(None))
                if start_date is not None:
                    query = query.filter(Journal.date >= start_date)
                if end_date is not None:
                    query = query.filter(Journal.date <= end_date)
                return query.count()
        except SQLAlchemyError as e:
            logger.error(f"统计日记数量失败: {e}")
            return 0

    def update_journal(
        self,
        journal_id: int,
        *,
        name: str | None = None,
        user_notes: str | None = None,
        date=None,
        content_format: str | None = None,
        tag_ids: list[int] | None = None,
    ) -> bool:
        """更新日记"""
        try:
            with self.db_base.get_session() as session:
                journal = (
                    session.query(Journal)
                    .filter(Journal.id == journal_id)
                    .filter(Journal.deleted_at.is_(None))
                    .first()
                )
                if not journal:
                    logger.warning(f"日记不存在: {journal_id}")
                    return False

                if name is not None:
                    journal.name = name
                if user_notes is not None:
                    journal.user_notes = user_notes
                if date is not None:
                    journal.date = date
                if content_format is not None:
                    journal.content_format = content_format

                # 替换标签
                if tag_ids is not None:
                    self._replace_tags(session, journal_id, tag_ids)

                journal.updated_at = datetime.now()
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

                session.delete(journal)
                session.flush()
                logger.info(f"删除日记: {journal_id}")
                return True
        except SQLAlchemyError as e:
            logger.error(f"删除日记失败: {e}")
            return False
