"""自动化任务管理器 - 负责用户自定义任务的数据库操作"""

from __future__ import annotations

from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from storage.models import AutomationTask
from storage.sql_utils import col
from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()

_UNSET = object()


class AutomationTaskManager:
    """自动化任务管理类"""

    def __init__(self, db_base):
        self.db_base = db_base

    def list_tasks(self, *, enabled: bool | None = None) -> list[dict[str, Any]]:
        try:
            with self.db_base.get_session() as session:
                q = session.query(AutomationTask).filter(col(AutomationTask.deleted_at).is_(None))
                if enabled is not None:
                    q = q.filter(col(AutomationTask.enabled) == enabled)
                q = q.order_by(col(AutomationTask.created_at).desc())
                tasks = q.all()
                return [self._to_dict(task) for task in tasks]
        except SQLAlchemyError as exc:
            logger.error(f"查询自动化任务失败: {exc}")
            return []

    def get_task(self, task_id: int) -> dict[str, Any] | None:
        try:
            with self.db_base.get_session() as session:
                task = (
                    session.query(AutomationTask)
                    .filter(
                        col(AutomationTask.id) == task_id,
                        col(AutomationTask.deleted_at).is_(None),
                    )
                    .first()
                )
                if not task:
                    return None
                return self._to_dict(task)
        except SQLAlchemyError as exc:
            logger.error(f"获取自动化任务失败: {exc}")
            return None

    def create_task(
        self,
        *,
        name: str,
        description: str | None,
        enabled: bool,
        schedule_type: str,
        schedule_config: str | None,
        action_type: str,
        action_payload: str | None,
    ) -> int | None:
        try:
            with self.db_base.get_session() as session:
                task = AutomationTask(
                    name=name,
                    description=description,
                    enabled=enabled,
                    schedule_type=schedule_type,
                    schedule_config=schedule_config,
                    action_type=action_type,
                    action_payload=action_payload,
                )
                session.add(task)
                session.flush()
                if task.id is None:
                    raise ValueError("AutomationTask must have an id after creation.")
                logger.info(f"创建自动化任务: {task.id} - {task.name}")
                return task.id
        except SQLAlchemyError as exc:
            logger.error(f"创建自动化任务失败: {exc}")
            return None

    def update_task(  # noqa: PLR0913
        self,
        task_id: int,
        *,
        name: str | Any = _UNSET,
        description: str | None | Any = _UNSET,
        enabled: bool | Any = _UNSET,
        schedule_type: str | Any = _UNSET,
        schedule_config: str | None | Any = _UNSET,
        action_type: str | Any = _UNSET,
        action_payload: str | None | Any = _UNSET,
        last_run_at: Any = _UNSET,
        last_status: str | None | Any = _UNSET,
        last_error: str | None | Any = _UNSET,
        last_output: str | None | Any = _UNSET,
    ) -> bool:
        try:
            with self.db_base.get_session() as session:
                task = (
                    session.query(AutomationTask)
                    .filter(
                        col(AutomationTask.id) == task_id,
                        col(AutomationTask.deleted_at).is_(None),
                    )
                    .first()
                )
                if not task:
                    return False

                updates = {
                    "name": name,
                    "description": description,
                    "enabled": enabled,
                    "schedule_type": schedule_type,
                    "schedule_config": schedule_config,
                    "action_type": action_type,
                    "action_payload": action_payload,
                    "last_run_at": last_run_at,
                    "last_status": last_status,
                    "last_error": last_error,
                    "last_output": last_output,
                }

                for attr, value in updates.items():
                    if value is not _UNSET:
                        setattr(task, attr, value)

                task.updated_at = get_utc_now()
                session.flush()
                logger.info(f"更新自动化任务: {task_id}")
                return True
        except SQLAlchemyError as exc:
            logger.error(f"更新自动化任务失败: {exc}")
            return False

    def delete_task(self, task_id: int) -> bool:
        try:
            with self.db_base.get_session() as session:
                task = (
                    session.query(AutomationTask)
                    .filter(
                        col(AutomationTask.id) == task_id,
                        col(AutomationTask.deleted_at).is_(None),
                    )
                    .first()
                )
                if not task:
                    return False
                task.deleted_at = get_utc_now()
                task.updated_at = get_utc_now()
                session.flush()
                logger.info(f"删除自动化任务: {task_id}")
                return True
        except SQLAlchemyError as exc:
            logger.error(f"删除自动化任务失败: {exc}")
            return False

    @staticmethod
    def _to_dict(task: AutomationTask) -> dict[str, Any]:
        return {
            "id": task.id,
            "name": task.name,
            "description": task.description,
            "enabled": task.enabled,
            "schedule_type": task.schedule_type,
            "schedule_config": task.schedule_config,
            "action_type": task.action_type,
            "action_payload": task.action_payload,
            "last_run_at": task.last_run_at,
            "last_status": task.last_status,
            "last_error": task.last_error,
            "last_output": task.last_output,
            "created_at": task.created_at,
            "updated_at": task.updated_at,
        }
