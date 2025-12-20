"""项目管理器 - 负责项目相关的数据库操作"""

from datetime import datetime
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.models import Project
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class ProjectManager:
    """项目管理类"""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    def create_project(
        self,
        *,
        name: str,
        definition_of_done: str | None = None,
        status: str = "active",
        description: str | None = None,
    ) -> int | None:
        """创建新项目"""
        try:
            with self.db_base.get_session() as session:
                project = Project(
                    name=name,
                    definition_of_done=definition_of_done,
                    status=status,
                    description=description,
                )
                session.add(project)
                session.flush()
                logger.info(f"创建项目: {project.id} - {name}")
                return project.id
        except SQLAlchemyError as e:
            logger.error(f"创建项目失败: {e}")
            return None

    def _project_to_dict(self, project: Project) -> dict[str, Any]:
        """将 Project ORM 对象转换为字典，解析 JSON 字段"""
        return {
            "id": project.id,
            "name": project.name,
            "definition_of_done": project.definition_of_done,
            "status": project.status or "active",
            "description": project.description,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
        }

    def get_project(self, project_id: int) -> dict[str, Any] | None:
        """获取单个项目"""
        try:
            with self.db_base.get_session() as session:
                project = session.query(Project).filter_by(id=project_id).first()
                if project:
                    return self._project_to_dict(project)
                return None
        except SQLAlchemyError as e:
            logger.error(f"获取项目失败: {e}")
            return None

    def list_projects(
        self, limit: int = 100, offset: int = 0, status: str | None = None
    ) -> list[dict[str, Any]]:
        """列出项目

        Args:
            limit: 返回数量限制
            offset: 偏移量
            status: 项目状态筛选（active/archived/completed），为None时返回所有项目
        """
        try:
            with self.db_base.get_session() as session:
                query = session.query(Project)

                # 如果指定了状态，则按状态筛选
                if status is not None:
                    query = query.filter(Project.status == status)

                projects = (
                    query.order_by(Project.created_at.desc()).offset(offset).limit(limit).all()
                )
                return [self._project_to_dict(p) for p in projects]
        except SQLAlchemyError as e:
            logger.error(f"列出项目失败: {e}")
            return []

    def update_project(
        self,
        project_id: int,
        *,
        name: str | None = None,
        definition_of_done: str | None = None,
        status: str | None = None,
        description: str | None = None,
    ) -> bool:
        """更新项目"""
        try:
            with self.db_base.get_session() as session:
                project = session.query(Project).filter_by(id=project_id).first()
                if not project:
                    logger.warning(f"项目不存在: {project_id}")
                    return False

                if name is not None:
                    project.name = name
                if definition_of_done is not None:
                    project.definition_of_done = definition_of_done
                if status is not None:
                    project.status = status
                if description is not None:
                    project.description = description

                project.updated_at = datetime.now()
                session.flush()
                logger.info(f"更新项目: {project_id}")
                return True
        except SQLAlchemyError as e:
            logger.error(f"更新项目失败: {e}")
            return False

    def delete_project(self, project_id: int) -> bool:
        """删除项目"""
        try:
            with self.db_base.get_session() as session:
                project = session.query(Project).filter_by(id=project_id).first()
                if not project:
                    logger.warning(f"项目不存在: {project_id}")
                    return False

                session.delete(project)
                session.flush()
                logger.info(f"删除项目: {project_id}")
                return True
        except SQLAlchemyError as e:
            logger.error(f"删除项目失败: {e}")
            return False
