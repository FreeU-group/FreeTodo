"""Attachment helpers for TodoManager."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy.exc import SQLAlchemyError

from storage.models import Attachment, Todo, TodoAttachmentRelation
from storage.sql_utils import col
from util.logging_config import get_logger

logger = get_logger()

if TYPE_CHECKING:
    from storage.database_base import DatabaseBase


class TodoAttachmentMixin:
    """Attachment-related helpers for TodoManager."""

    db_base: DatabaseBase

    def _get_todo_attachments(self, session, todo_id: int) -> list[dict[str, Any]]:
        rows = (
            session.query(Attachment, TodoAttachmentRelation)
            .join(
                TodoAttachmentRelation,
                col(TodoAttachmentRelation.attachment_id) == col(Attachment.id),
            )
            .filter(
                col(TodoAttachmentRelation.todo_id) == todo_id,
                col(TodoAttachmentRelation.deleted_at).is_(None),
            )
            .all()
        )
        return [
            {
                "id": attachment.id,
                "file_name": attachment.file_name,
                "file_path": attachment.file_path,
                "file_size": attachment.file_size,
                "mime_type": attachment.mime_type,
                "source": relation.source,
            }
            for attachment, relation in rows
        ]

    def add_todo_attachment(
        self,
        *,
        todo_id: int,
        file_name: str,
        file_path: str,
        file_size: int | None,
        mime_type: str | None,
        file_hash: str | None,
        source: str = "user",
    ) -> dict[str, Any] | None:
        try:
            with self.db_base.get_session() as session:
                todo = session.query(Todo).filter_by(id=todo_id).first()
                if not todo:
                    return None

                attachment = Attachment(
                    file_name=file_name,
                    file_path=file_path,
                    file_size=file_size,
                    mime_type=mime_type,
                    file_hash=file_hash,
                )
                session.add(attachment)
                session.flush()
                if attachment.id is None:
                    raise ValueError("Attachment must have an id before linking.")

                relation = TodoAttachmentRelation(
                    todo_id=todo_id,
                    attachment_id=attachment.id,
                    source=source or "user",
                )
                session.add(relation)
                session.flush()

                return {
                    "id": attachment.id,
                    "file_name": attachment.file_name,
                    "file_path": attachment.file_path,
                    "file_size": attachment.file_size,
                    "mime_type": attachment.mime_type,
                    "source": relation.source,
                }
        except SQLAlchemyError as exc:
            logger.error(f"Failed to create attachment: {exc}")
            return None

    def remove_todo_attachment(self, *, todo_id: int, attachment_id: int) -> bool:
        try:
            with self.db_base.get_session() as session:
                rows = (
                    session.query(TodoAttachmentRelation)
                    .filter(
                        col(TodoAttachmentRelation.todo_id) == todo_id,
                        col(TodoAttachmentRelation.attachment_id) == attachment_id,
                    )
                    .delete()
                )
                return rows > 0
        except SQLAlchemyError as exc:
            logger.error(f"Failed to unlink attachment: {exc}")
            return False

    def get_attachment(self, attachment_id: int) -> dict[str, Any] | None:
        try:
            with self.db_base.get_session() as session:
                attachment = session.query(Attachment).filter_by(id=attachment_id).first()
                if not attachment:
                    return None
                return {
                    "id": attachment.id,
                    "file_name": attachment.file_name,
                    "file_path": attachment.file_path,
                    "file_size": attachment.file_size,
                    "mime_type": attachment.mime_type,
                }
        except SQLAlchemyError as exc:
            logger.error(f"Failed to fetch attachment: {exc}")
            return None
