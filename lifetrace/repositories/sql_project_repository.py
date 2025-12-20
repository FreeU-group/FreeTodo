"""基于 SQLAlchemy 的 Project 仓库实现

复用现有的 ProjectManager 逻辑，提供符合仓库接口的数据访问层。
"""

from typing import Any

from lifetrace.repositories.interfaces import IProjectRepository
from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.project_manager import ProjectManager


class SqlProjectRepository(IProjectRepository):
    """基于 SQLAlchemy 的 Project 仓库实现"""

    def __init__(self, db_base: DatabaseBase):
        self._manager = ProjectManager(db_base)

    def get_by_id(self, project_id: int) -> dict[str, Any] | None:
        return self._manager.get_project(project_id)

    def list_projects(self, limit: int, offset: int, status: str | None) -> list[dict[str, Any]]:
        return self._manager.list_projects(limit=limit, offset=offset, status=status)

    def create(self, **kwargs) -> int | None:
        return self._manager.create_project(**kwargs)

    def update(self, project_id: int, **kwargs) -> bool:
        return self._manager.update_project(project_id, **kwargs)

    def delete(self, project_id: int) -> bool:
        return self._manager.delete_project(project_id)
