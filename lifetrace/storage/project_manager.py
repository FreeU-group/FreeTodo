"""项目管理器 - 负责项目相关的数据库操作"""

from datetime import datetime
import json
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.models import Project
from lifetrace.util.logging_config import get_logger

logger = get_logger()


def _dump_json(value: Any) -> str | None:
    """将 Python 对象序列化为 JSON 字符串（用于写入数据库）"""
    if value is None:
        return None
    try:
        return json.dumps(value, ensure_ascii=False)
    except TypeError as e:
        logger.warning(f"序列化项目 JSON 字段失败: {e}, value={value}")
        return None


def _load_json(value: str | None) -> Any:
    """将数据库中的 JSON 字符串反序列化为 Python 对象"""
    if not value:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError as e:
        logger.warning(f"反序列化项目 JSON 字段失败: {e}, value={value}")
        return None


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
        keywords: list[str] | None = None,
        whitelist_apps: list[str] | None = None,
        milestones: list[dict[str, Any]] | None = None,
        system_context_prompt: str | None = None,
    ) -> int | None:
        """创建新项目"""
        try:
            with self.db_base.get_session() as session:
                project = Project(
                    name=name,
                    definition_of_done=definition_of_done,
                    status=status,
                    keywords_json=_dump_json(keywords),
                    whitelist_apps_json=_dump_json(whitelist_apps),
                    milestones_json=_dump_json(milestones),
                    system_context_prompt=system_context_prompt,
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
            "keywords": _load_json(project.keywords_json),
            "whitelist_apps": _load_json(project.whitelist_apps_json),
            "milestones": _load_json(project.milestones_json),
            "system_context_prompt": project.system_context_prompt,
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

    def list_projects(self, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
        """列出所有项目"""
        try:
            with self.db_base.get_session() as session:
                projects = (
                    session.query(Project)
                    .order_by(Project.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                    .all()
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
        keywords: list[str] | None = None,
        whitelist_apps: list[str] | None = None,
        milestones: list[dict[str, Any]] | None = None,
        system_context_prompt: str | None = None,
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
                if keywords is not None:
                    project.keywords_json = _dump_json(keywords)
                if whitelist_apps is not None:
                    project.whitelist_apps_json = _dump_json(whitelist_apps)
                if milestones is not None:
                    project.milestones_json = _dump_json(milestones)
                if system_context_prompt is not None:
                    project.system_context_prompt = system_context_prompt

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
