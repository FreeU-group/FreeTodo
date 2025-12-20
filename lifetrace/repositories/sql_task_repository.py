"""基于 SQLAlchemy 的 Task 仓库实现

复用现有的 TaskManager 逻辑，提供符合仓库接口的数据访问层。
"""

from typing import Any

from lifetrace.repositories.interfaces import ITaskRepository
from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.task_manager import TaskManager


class SqlTaskRepository(ITaskRepository):
    """基于 SQLAlchemy 的 Task 仓库实现"""

    def __init__(self, db_base: DatabaseBase):
        self._manager = TaskManager(db_base)

    def get_by_id(self, task_id: int) -> dict[str, Any] | None:
        return self._manager.get_task(task_id)

    def list_tasks(self, project_id: int, limit: int, offset: int) -> list[dict[str, Any]]:
        return self._manager.list_tasks(project_id=project_id, limit=limit, offset=offset)

    def count_tasks(self, project_id: int) -> int:
        return self._manager.count_tasks(project_id=project_id)

    def create(self, **kwargs) -> int | None:
        return self._manager.create_task(**kwargs)

    def update(self, task_id: int, **kwargs) -> bool:
        return self._manager.update_task(task_id, **kwargs)

    def delete(self, task_id: int) -> bool:
        return self._manager.delete_task(task_id)

    def delete_batch(self, task_ids: list[int], project_id: int) -> dict[str, Any]:
        return self._manager.delete_tasks_batch(task_ids, project_id)

    def get_progress_list(self, task_id: int, limit: int, offset: int) -> list[dict[str, Any]]:
        return self._manager.get_task_progress_list(task_id=task_id, limit=limit, offset=offset)

    def get_progress_latest(self, task_id: int) -> dict[str, Any] | None:
        return self._manager.get_task_progress_latest(task_id=task_id)

    def count_progress(self, task_id: int) -> int:
        return self._manager.count_task_progress(task_id=task_id)

    def create_progress(self, task_id: int, summary: str, context_count: int) -> int | None:
        return self._manager.create_task_progress(
            task_id=task_id, summary=summary, context_count=context_count
        )
