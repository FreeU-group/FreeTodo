"""Todo 管理器 - 负责 Todo/Tag/Attachment 相关数据库操作"""

from __future__ import annotations

import contextlib
from typing import TYPE_CHECKING, Any, cast

from sqlalchemy import func, or_
from sqlalchemy.exc import SQLAlchemyError

from lifetrace.storage.models import Tag, Todo, TodoAttachmentRelation, TodoTagRelation
from lifetrace.storage.sql_utils import col
from lifetrace.storage.todo_manager_attachments import TodoAttachmentMixin
from lifetrace.storage.todo_manager_ical import TodoIcalMixin
from lifetrace.storage.todo_manager_ical_update import TodoIcalUpdateMixin
from lifetrace.util.logging_config import get_logger
from lifetrace.util.time_utils import get_utc_now

logger = get_logger()

if TYPE_CHECKING:
    from lifetrace.storage.database_base import DatabaseBase


_MISSING_PARENT = object()


class TodoManager(TodoAttachmentMixin, TodoIcalMixin, TodoIcalUpdateMixin):
    """Todo 管理类"""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    def _get_parent_id(
        self,
        session,
        todo_id: int,
        proposed_parent_map: dict[int, int | None] | None = None,
    ) -> int | None | object:
        if proposed_parent_map and todo_id in proposed_parent_map:
            return proposed_parent_map[todo_id]
        row = session.query(col(Todo.parent_todo_id)).filter(col(Todo.id) == todo_id).first()
        if not row:
            return _MISSING_PARENT
        return row[0]

    def _validate_parent_link(
        self,
        session,
        *,
        todo_id: int,
        parent_todo_id: int | None,
        proposed_parent_map: dict[int, int | None] | None = None,
    ) -> bool:
        if parent_todo_id is None:
            return True
        if parent_todo_id == todo_id:
            return False

        parent_exists = session.query(col(Todo.id)).filter(col(Todo.id) == parent_todo_id).first()
        if not parent_exists:
            return False

        visited: set[int] = set()
        current_id: int | None = parent_todo_id
        while current_id is not None:
            if current_id == todo_id:
                return False
            if current_id in visited:
                return False
            visited.add(current_id)
            next_parent = self._get_parent_id(
                session,
                current_id,
                proposed_parent_map=proposed_parent_map,
            )
            if next_parent is _MISSING_PARENT:
                break
            current_id = cast("int | None", next_parent)
        return True

    # ========== 查询辅助 ==========
    def _get_todo_tags(self, session, todo_id: int) -> list[str]:
        rows = (
            session.query(col(Tag.tag_name))
            .join(TodoTagRelation, col(TodoTagRelation.tag_id) == col(Tag.id))
            .filter(col(TodoTagRelation.todo_id) == todo_id)
            .all()
        )
        return [r[0] for r in rows if r and r[0]]

    def get_todo_context(self, todo_id: int) -> dict[str, Any] | None:
        """获取任务的所有相关上下文（父任务链、同级任务、子任务）"""
        try:
            with self.db_base.get_session() as session:
                # 获取当前任务
                current_todo = session.query(Todo).filter_by(id=todo_id).first()
                if not current_todo:
                    return None

                current_dict = self._todo_to_dict(session, current_todo)

                # 递归向上查找所有父任务
                parents: list[dict[str, Any]] = []
                parent_id = current_todo.parent_todo_id
                visited_parents = set()  # 防止循环引用

                while parent_id is not None and parent_id not in visited_parents:
                    visited_parents.add(parent_id)
                    parent_todo = session.query(Todo).filter_by(id=parent_id).first()
                    if not parent_todo:
                        break
                    parents.append(self._todo_to_dict(session, parent_todo))
                    parent_id = parent_todo.parent_todo_id

                # 查找所有同级任务（相同 parent_todo_id，排除当前任务）
                siblings: list[dict[str, Any]] = []
                if current_todo.parent_todo_id is not None:
                    sibling_todos = (
                        session.query(Todo)
                        .filter(
                            col(Todo.parent_todo_id) == current_todo.parent_todo_id,
                            col(Todo.id) != todo_id,
                        )
                        .all()
                    )
                    siblings = [self._todo_to_dict(session, t) for t in sibling_todos]

                # 递归向下查找所有子任务
                def _get_children_recursive(parent_todo_id: int) -> list[dict[str, Any]]:
                    children: list[dict[str, Any]] = []
                    child_todos = (
                        session.query(Todo).filter(col(Todo.parent_todo_id) == parent_todo_id).all()
                    )
                    for child in child_todos:
                        child_dict = self._todo_to_dict(session, child)
                        # 递归获取子任务的子任务
                        child_dict["children"] = _get_children_recursive(child.id)
                        children.append(child_dict)
                    return children

                children = _get_children_recursive(todo_id)

                return {
                    "current": current_dict,
                    "parents": parents,
                    "siblings": siblings,
                    "children": children,
                }
        except SQLAlchemyError as e:
            logger.error(f"获取 todo 上下文失败: {e}")
            return None

    # ========== CRUD ==========
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

    def get_todo_by_uid(self, uid: str) -> dict[str, Any] | None:
        if not uid:
            return None
        try:
            with self.db_base.get_session() as session:
                todo = session.query(Todo).filter_by(uid=uid).first()
                if not todo:
                    return None
                return self._todo_to_dict(session, todo)
        except SQLAlchemyError as e:
            logger.error(f"根据 uid 获取 todo 失败: {e}")
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
                with contextlib.suppress(Exception):
                    q = q.filter(col(Todo.deleted_at).is_(None))

                if status:
                    q = q.filter(col(Todo.status) == status)

                todos = q.order_by(col(Todo.created_at).desc()).offset(offset).limit(limit).all()
                return [self._todo_to_dict(session, t) for t in todos]
        except SQLAlchemyError as e:
            logger.error(f"列出 todo 失败: {e}")
            return []

    def search_todos(
        self,
        *,
        keyword: str,
        limit: int = 200,
        offset: int = 0,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        keyword = (keyword or "").strip()
        if not keyword:
            return []
        keyword_lower = keyword.lower()
        pattern = f"%{keyword_lower}%"
        try:
            with self.db_base.get_session() as session:
                q = session.query(Todo)
                with contextlib.suppress(Exception):
                    q = q.filter(col(Todo.deleted_at).is_(None))
                if status:
                    q = q.filter(col(Todo.status) == status)
                q = q.filter(
                    or_(
                        func.lower(col(Todo.name)).like(pattern),
                        func.lower(col(Todo.description)).like(pattern),
                    )
                )
                todos = q.order_by(col(Todo.created_at).desc()).offset(offset).limit(limit).all()
                return [self._todo_to_dict(session, t) for t in todos]
        except SQLAlchemyError as e:
            logger.error(f"搜索 todo 失败: {e}")
            return []

    def count_todos(self, *, status: str | None = None) -> int:
        try:
            with self.db_base.get_session() as session:
                q = session.query(Todo)
                with contextlib.suppress(Exception):
                    q = q.filter(col(Todo.deleted_at).is_(None))
                if status:
                    q = q.filter(col(Todo.status) == status)
                return q.count()
        except SQLAlchemyError as e:
            logger.error(f"统计 todo 数量失败: {e}")
            return 0

    def get_active_todos_for_prompt(self, limit: int = 100) -> list[dict[str, Any]]:
        """获取用于提示词的活跃/草稿 todo 列表（精简字段）。

        返回 active 和 draft 状态的待办，适合直接序列化为 JSON 传给 LLM，
        让模型了解当前已有的待办（包括自动提取但尚未确认的 draft 待办）。
        """
        try:
            with self.db_base.get_session() as session:
                q = session.query(Todo)
                with contextlib.suppress(Exception):
                    q = q.filter(col(Todo.deleted_at).is_(None))

                q = (
                    q.filter(col(Todo.status).in_(["active", "draft"]))
                    .order_by(col(Todo.created_at).desc())
                    .limit(limit)
                )
                todos = q.all()

                result: list[dict[str, Any]] = []
                for t in todos:
                    schedule = t.dtstart or t.start_time or t.due or t.deadline
                    result.append(
                        {
                            "id": t.id,
                            "name": t.name,
                            "status": t.status,
                            "description": t.description,
                            "start_time": schedule.isoformat() if schedule else None,
                        }
                    )
                return result
        except SQLAlchemyError as e:
            logger.error(f"获取用于提示词的活跃 todo 列表失败: {e}")
            return []

    def _delete_todo_recursive(self, session, todo_id: int) -> None:
        """递归删除 todo 及其所有子任务"""
        # 查找所有子任务
        child_todos = session.query(Todo).filter(col(Todo.parent_todo_id) == todo_id).all()

        # 递归删除所有子任务
        for child in child_todos:
            self._delete_todo_recursive(session, child.id)

        # 清理关联关系（不删除 Tag/Attachment 实体）
        session.query(TodoTagRelation).filter(col(TodoTagRelation.todo_id) == todo_id).delete()
        session.query(TodoAttachmentRelation).filter(
            col(TodoAttachmentRelation.todo_id) == todo_id
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
    def reorder_todos(self, items: list[dict[str, Any]]) -> bool:
        """批量更新待办的排序和父子关系

        Args:
            items: 待办列表，每个元素包含 id, order, 可选 parent_todo_id

        Returns:
            是否全部更新成功
        """
        try:
            with self.db_base.get_session() as session:
                proposed_parent_map = {
                    int(item["id"]): item.get("parent_todo_id")
                    for item in items
                    if item.get("id") and "parent_todo_id" in item
                }
                for todo_id, parent_id in proposed_parent_map.items():
                    todo_exists = (
                        session.query(col(Todo.id)).filter(col(Todo.id) == todo_id).first()
                    )
                    if not todo_exists:
                        logger.warning(f"reorder_todos: todo 不存在: {todo_id}")
                        continue
                    if not self._validate_parent_link(
                        session,
                        todo_id=todo_id,
                        parent_todo_id=parent_id,
                        proposed_parent_map=proposed_parent_map,
                    ):
                        logger.warning(
                            "reorder_todos: parent_todo_id 无效: todo_id=%s parent_id=%s",
                            todo_id,
                            parent_id,
                        )
                        return False

                for item in items:
                    todo_id = item.get("id")
                    if not todo_id:
                        continue

                    todo = session.query(Todo).filter_by(id=todo_id).first()
                    if not todo:
                        logger.warning(f"reorder_todos: todo 不存在: {todo_id}")
                        continue

                    # 更新 order
                    if "order" in item:
                        todo.order = item["order"]

                    # 更新 parent_todo_id（如果提供了该字段）
                    if "parent_todo_id" in item:
                        todo.parent_todo_id = item["parent_todo_id"]

                    todo.updated_at = get_utc_now()

                session.flush()
                logger.info(f"批量重排序 {len(items)} 个待办")
                return True
        except SQLAlchemyError as e:
            logger.error(f"批量重排序待办失败: {e}")
            return False

    def _set_todo_tags(self, session, todo_id: int, tags: list[str]) -> None:
        # 清空旧关系
        session.query(TodoTagRelation).filter(col(TodoTagRelation.todo_id) == todo_id).delete()

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

            if tag.id is None:
                raise ValueError("Tag must have an id before creating relation.")
            rel = TodoTagRelation(todo_id=todo_id, tag_id=tag.id)
            session.add(rel)
