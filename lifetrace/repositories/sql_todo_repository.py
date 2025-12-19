"""基于 SQLAlchemy 的 Todo 仓库实现

复用现有的 TodoManager 逻辑，提供符合仓库接口的数据访问层。
"""

from typing import Any

from lifetrace.repositories.interfaces import ITodoRepository
from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.todo_manager import TodoManager


class SqlTodoRepository(ITodoRepository):
    """基于 SQLAlchemy 的 Todo 仓库实现"""

    def __init__(self, db_base: DatabaseBase):
        # 复用现有的 TodoManager 逻辑
        self._manager = TodoManager(db_base)

    def get_by_id(self, todo_id: int) -> dict[str, Any] | None:
        return self._manager.get_todo(todo_id)

    def list_todos(self, limit: int, offset: int, status: str | None) -> list[dict[str, Any]]:
        return self._manager.list_todos(limit=limit, offset=offset, status=status)

    def count(self, status: str | None) -> int:
        return self._manager.count_todos(status=status)

    def create(self, **kwargs) -> int | None:
        return self._manager.create_todo(**kwargs)

    def update(self, todo_id: int, **kwargs) -> bool:
        return self._manager.update_todo(todo_id, **kwargs)

    def delete(self, todo_id: int) -> bool:
        return self._manager.delete_todo(todo_id)

    def reorder(self, items: list[dict[str, Any]]) -> bool:
        return self._manager.reorder_todos(items)
