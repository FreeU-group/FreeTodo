"""基于 SQLAlchemy 的 Todo 仓库实现

复用现有的 TodoManager 逻辑，提供符合仓库接口的数据访问层。
"""

from typing import Any

from repositories.interfaces import ITodoRepository
from storage.database_base import DatabaseBase
from storage.todo_manager import TodoManager


class SqlTodoRepository(ITodoRepository):
    """基于 SQLAlchemy 的 Todo 仓库实现"""

    def __init__(self, db_base: DatabaseBase):
        # 复用现有的 TodoManager 逻辑
        self._manager = TodoManager(db_base)

    def get_by_id(self, todo_id: int) -> dict[str, Any] | None:
        return self._manager.get_todo(todo_id)

    def get_by_uid(self, uid: str) -> dict[str, Any] | None:
        return self._manager.get_todo_by_uid(uid)

    def list_todos(self, limit: int, offset: int, status: str | None) -> list[dict[str, Any]]:
        return self._manager.list_todos(limit=limit, offset=offset, status=status)

    def search(
        self,
        keyword: str,
        limit: int,
        offset: int,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        return self._manager.search_todos(
            keyword=keyword,
            limit=limit,
            offset=offset,
            status=status,
        )

    def count(self, status: str | None) -> int:
        return self._manager.count_todos(status=status)

    def create(self, **kwargs) -> int | None:
        return self._manager.create_todo(**kwargs)

    def update(self, todo_id: int, **kwargs) -> bool:
        return self._manager.update_todo(todo_id, **kwargs)

    def delete(self, todo_id: int) -> list[int] | None:
        return self._manager.delete_todo(todo_id)

    def reorder(self, items: list[dict[str, Any]]) -> bool:
        return self._manager.reorder_todos(items)

    def add_attachment(
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
        return self._manager.add_todo_attachment(
            todo_id=todo_id,
            file_name=file_name,
            file_path=file_path,
            file_size=file_size,
            mime_type=mime_type,
            file_hash=file_hash,
            source=source,
        )

    def remove_attachment(self, *, todo_id: int, attachment_id: int) -> bool:
        return self._manager.remove_todo_attachment(
            todo_id=todo_id,
            attachment_id=attachment_id,
        )

    def get_attachment(self, attachment_id: int) -> dict[str, Any] | None:
        return self._manager.get_attachment(attachment_id)
