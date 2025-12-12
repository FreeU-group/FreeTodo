"""Todo 管理器 - 负责 Todo/Tag/Attachment 相关数据库操作"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.models import (
    Attachment,
    Tag,
    Todo,
    TodoAttachmentRelation,
    TodoTagRelation,
)
from lifetrace.util.logging_config import get_logger

logger = get_logger()

_UNSET = object()


def _safe_int_list(value: Any) -> list[int]:
    if value is None:
        return []
    if isinstance(value, list):
        out: list[int] = []
        for item in value:
            try:
                out.append(int(item))
            except Exception:
                continue
        return out
    # 兼容数据库中存的 JSON 字符串
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return _safe_int_list(parsed)
        except Exception:
            return []
    return []


class TodoManager:
    """Todo 管理类"""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    # ========== 查询辅助 ==========
    def _get_todo_tags(self, session, todo_id: int) -> list[str]:
        rows = (
            session.query(Tag.tag_name)
            .join(TodoTagRelation, TodoTagRelation.tag_id == Tag.id)
            .filter(TodoTagRelation.todo_id == todo_id)
            .all()
        )
        return [r[0] for r in rows if r and r[0]]

    def _get_todo_attachments(self, session, todo_id: int) -> list[dict[str, Any]]:
        rows = (
            session.query(Attachment)
            .join(
                TodoAttachmentRelation,
                TodoAttachmentRelation.attachment_id == Attachment.id,
            )
            .filter(TodoAttachmentRelation.todo_id == todo_id)
            .all()
        )
        return [
            {
                "id": a.id,
                "file_name": a.file_name,
                "file_path": a.file_path,
                "file_size": a.file_size,
                "mime_type": a.mime_type,
            }
            for a in rows
        ]

    def _todo_to_dict(self, session, todo: Todo) -> dict[str, Any]:
        return {
            "id": todo.id,
            "name": todo.name,
            "description": todo.description,
            "user_notes": todo.user_notes,
            "parent_todo_id": todo.parent_todo_id,
            "deadline": todo.deadline,
            "status": todo.status,
            "priority": todo.priority,
            "tags": self._get_todo_tags(session, todo.id),
            "attachments": self._get_todo_attachments(session, todo.id),
            "related_activities": _safe_int_list(todo.related_activities),
            "created_at": todo.created_at,
            "updated_at": todo.updated_at,
        }

    # ========== CRUD ==========
    def create_todo(  # noqa: PLR0913
        self,
        *,
        name: str,
        description: str | None = None,
        user_notes: str | None = None,
        parent_todo_id: int | None = None,
        deadline: datetime | None = None,
        status: str = "active",
        priority: str = "none",
        tags: list[str] | None = None,
        related_activities: list[int] | None = None,
    ) -> int | None:
        try:
            with self.db_base.get_session() as session:
                todo = Todo(
                    name=name,
                    description=description,
                    user_notes=user_notes,
                    parent_todo_id=parent_todo_id,
                    deadline=deadline,
                    status=status,
                    priority=priority,
                    related_activities=json.dumps(_safe_int_list(related_activities)),
                )
                session.add(todo)
                session.flush()

                if tags is not None:
                    self._set_todo_tags(session, todo.id, tags)

                logger.info(f"创建 todo: {todo.id} - {name}")
                return todo.id
        except SQLAlchemyError as e:
            logger.error(f"创建 todo 失败: {e}")
            return None

    def get_todo(self, todo_id: int) -> dict[str, Any] | None:
        try:
            with self.db_base.get_session() as session:
                todo = session.query(Todo).filter_by(id=todo_id).first()
                if not todo:
                    return None
                return self._todo_to_dict(session, todo)
        except SQLAlchemyError as e:
            logger.error(f"获取 todo 失败: {e}")
            return None

    def list_todos(
        self,
        *,
        limit: int = 200,
        offset: int = 0,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        try:
            with self.db_base.get_session() as session:
                q = session.query(Todo)
                # 默认不返回软删除数据（如果未来使用 deleted_at）
                try:
                    q = q.filter(Todo.deleted_at.is_(None))
                except Exception:
                    pass

                if status:
                    q = q.filter(Todo.status == status)

                todos = q.order_by(Todo.created_at.desc()).offset(offset).limit(limit).all()
                return [self._todo_to_dict(session, t) for t in todos]
        except SQLAlchemyError as e:
            logger.error(f"列出 todo 失败: {e}")
            return []

    def count_todos(self, *, status: str | None = None) -> int:
        try:
            with self.db_base.get_session() as session:
                q = session.query(Todo)
                try:
                    q = q.filter(Todo.deleted_at.is_(None))
                except Exception:
                    pass
                if status:
                    q = q.filter(Todo.status == status)
                return q.count()
        except SQLAlchemyError as e:
            logger.error(f"统计 todo 数量失败: {e}")
            return 0

    def _apply_todo_updates(  # noqa: PLR0913
        self,
        todo: Todo,
        *,
        name: str | Any = _UNSET,
        description: str | Any = _UNSET,
        user_notes: str | Any = _UNSET,
        parent_todo_id: int | None | Any = _UNSET,
        deadline: datetime | None | Any = _UNSET,
        status: str | Any = _UNSET,
        priority: str | Any = _UNSET,
        related_activities: list[int] | Any = _UNSET,
    ) -> None:
        """应用待办字段更新"""
        if name is not _UNSET:
            todo.name = name
        if description is not _UNSET:
            todo.description = description
        if user_notes is not _UNSET:
            todo.user_notes = user_notes
        if parent_todo_id is not _UNSET:
            todo.parent_todo_id = parent_todo_id
        if deadline is not _UNSET:
            todo.deadline = deadline
        if status is not _UNSET:
            todo.status = status
        if priority is not _UNSET:
            todo.priority = priority
        if related_activities is not _UNSET:
            todo.related_activities = json.dumps(_safe_int_list(related_activities))

    def update_todo(  # noqa: PLR0913, C901
        self,
        todo_id: int,
        *,
        name: str | Any = _UNSET,
        description: str | Any = _UNSET,
        user_notes: str | Any = _UNSET,
        parent_todo_id: int | None | Any = _UNSET,
        deadline: datetime | None | Any = _UNSET,
        status: str | Any = _UNSET,
        priority: str | Any = _UNSET,
        tags: list[str] | Any = _UNSET,
        related_activities: list[int] | Any = _UNSET,
    ) -> bool:
        try:
            with self.db_base.get_session() as session:
                todo = session.query(Todo).filter_by(id=todo_id).first()
                if not todo:
                    logger.warning(f"todo 不存在: {todo_id}")
                    return False

                self._apply_todo_updates(
                    todo,
                    name=name,
                    description=description,
                    user_notes=user_notes,
                    parent_todo_id=parent_todo_id,
                    deadline=deadline,
                    status=status,
                    priority=priority,
                    related_activities=related_activities,
                )

                todo.updated_at = datetime.now()
                session.flush()

                if tags is not _UNSET:
                    self._set_todo_tags(session, todo_id, tags or [])

                logger.info(f"更新 todo: {todo_id}")
                return True
        except SQLAlchemyError as e:
            logger.error(f"更新 todo 失败: {e}")
            return False

    def _delete_todo_recursive(self, session, todo_id: int) -> None:
        """递归删除 todo 及其所有子任务"""
        # 查找所有子任务
        child_todos = session.query(Todo).filter(Todo.parent_todo_id == todo_id).all()

        # 递归删除所有子任务
        for child in child_todos:
            self._delete_todo_recursive(session, child.id)

        # 清理关联关系（不删除 Tag/Attachment 实体）
        session.query(TodoTagRelation).filter(TodoTagRelation.todo_id == todo_id).delete()
        session.query(TodoAttachmentRelation).filter(
            TodoAttachmentRelation.todo_id == todo_id
        ).delete()

        # 删除 todo 本身
        todo = session.query(Todo).filter_by(id=todo_id).first()
        if todo:
            session.delete(todo)
            logger.info(f"删除 todo: {todo_id}")

    def delete_todo(self, todo_id: int) -> bool:
        try:
            with self.db_base.get_session() as session:
                todo = session.query(Todo).filter_by(id=todo_id).first()
                if not todo:
                    logger.warning(f"todo 不存在: {todo_id}")
                    return False

                # 递归删除 todo 及其所有子任务
                self._delete_todo_recursive(session, todo_id)
                session.flush()
                logger.info(f"删除 todo 及其子任务: {todo_id}")
                return True
        except SQLAlchemyError as e:
            logger.error(f"删除 todo 失败: {e}")
            return False

    # ========== 关系写入 ==========
    def _set_todo_tags(self, session, todo_id: int, tags: list[str]) -> None:
        # 清空旧关系
        session.query(TodoTagRelation).filter(TodoTagRelation.todo_id == todo_id).delete()

        # 去重/清洗
        cleaned = []
        seen = set()
        for t in tags:
            name = (t or "").strip()
            if not name:
                continue
            if name in seen:
                continue
            seen.add(name)
            cleaned.append(name)

        for tag_name in cleaned:
            tag = session.query(Tag).filter_by(tag_name=tag_name).first()
            if not tag:
                tag = Tag(tag_name=tag_name)
                session.add(tag)
                session.flush()

            rel = TodoTagRelation(todo_id=todo_id, tag_id=tag.id)
            session.add(rel)
