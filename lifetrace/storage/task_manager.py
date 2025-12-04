"""任务管理器 - 负责任务相关的数据库操作"""

from datetime import datetime
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.models import Project, Task, TaskProgress
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class TaskManager:
    """任务管理类"""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    def create_task(
        self,
        project_id: int,
        name: str,
        description: str = None,
        status: str = "pending",
    ) -> int | None:
        """创建新任务"""
        try:
            with self.db_base.get_session() as session:
                # 验证项目是否存在
                project = session.query(Project).filter_by(id=project_id).first()
                if not project:
                    logger.warning(f"项目不存在: {project_id}")
                    return None

                task = Task(
                    project_id=project_id,
                    name=name,
                    description=description,
                    status=status,
                )
                session.add(task)
                session.flush()
                logger.info(f"创建任务: {task.id} - {name}")
                return task.id
        except SQLAlchemyError as e:
            logger.error(f"创建任务失败: {e}")
            return None

    def get_task(self, task_id: int) -> dict[str, Any] | None:
        """获取单个任务"""
        try:
            with self.db_base.get_session() as session:
                task = session.query(Task).filter_by(id=task_id).first()
                if task:
                    return {
                        "id": task.id,
                        "project_id": task.project_id,
                        "name": task.name,
                        "description": task.description,
                        "status": task.status,
                        "created_at": task.created_at,
                        "updated_at": task.updated_at,
                    }
                return None
        except SQLAlchemyError as e:
            logger.error(f"获取任务失败: {e}")
            return None

    def list_tasks(
        self,
        project_id: int,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """列出项目的所有任务

        Args:
            project_id: 项目ID
            limit: 返回数量限制
            offset: 偏移量
        """
        try:
            with self.db_base.get_session() as session:
                q = session.query(Task).filter(Task.project_id == project_id)
                tasks = q.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()

                return [
                    {
                        "id": t.id,
                        "project_id": t.project_id,
                        "name": t.name,
                        "description": t.description,
                        "status": t.status,
                        "created_at": t.created_at,
                        "updated_at": t.updated_at,
                    }
                    for t in tasks
                ]
        except SQLAlchemyError as e:
            logger.error(f"列出任务失败: {e}")
            return []

    def count_tasks(self, project_id: int) -> int:
        """统计项目的任务数量"""
        try:
            with self.db_base.get_session() as session:
                q = session.query(Task).filter(Task.project_id == project_id)
                return q.count()
        except SQLAlchemyError as e:
            logger.error(f"统计任务数量失败: {e}")
            return 0

    def update_task(
        self,
        task_id: int,
        name: str = None,
        description: str = None,
        status: str = None,
    ) -> bool:
        """更新任务"""
        try:
            with self.db_base.get_session() as session:
                task = session.query(Task).filter_by(id=task_id).first()
                if not task:
                    logger.warning(f"任务不存在: {task_id}")
                    return False

                if name is not None:
                    task.name = name
                if description is not None:
                    task.description = description
                if status is not None:
                    task.status = status

                task.updated_at = datetime.now()
                session.flush()
                logger.info(f"更新任务: {task_id}")
                return True
        except SQLAlchemyError as e:
            logger.error(f"更新任务失败: {e}")
            return False

    def delete_task(self, task_id: int) -> bool:
        """删除任务"""
        try:
            with self.db_base.get_session() as session:
                task = session.query(Task).filter_by(id=task_id).first()
                if not task:
                    logger.warning(f"任务不存在: {task_id}")
                    return False

                session.delete(task)
                session.flush()
                logger.info(f"删除任务: {task_id}")
                return True
        except SQLAlchemyError as e:
            logger.error(f"删除任务失败: {e}")
            return False

    def delete_tasks_batch(self, task_ids: list[int], project_id: int) -> dict[str, Any]:
        """批量删除任务

        Args:
            task_ids: 要删除的任务ID列表
            project_id: 项目ID（用于验证任务归属）

        Returns:
            包含成功和失败信息的字典
        """
        result = {
            "deleted_count": 0,
            "failed_ids": [],
            "not_found_ids": [],
            "wrong_project_ids": [],
        }

        try:
            with self.db_base.get_session() as session:
                for task_id in task_ids:
                    task = session.query(Task).filter_by(id=task_id).first()
                    if not task:
                        result["not_found_ids"].append(task_id)
                        continue

                    if task.project_id != project_id:
                        result["wrong_project_ids"].append(task_id)
                        continue

                    try:
                        session.delete(task)
                        result["deleted_count"] += 1
                    except SQLAlchemyError as e:
                        logger.error(f"删除任务 {task_id} 失败: {e}")
                        result["failed_ids"].append(task_id)

                session.flush()
                logger.info(f"批量删除任务完成: 成功 {result['deleted_count']} 个")
                return result
        except SQLAlchemyError as e:
            logger.error(f"批量删除任务失败: {e}")
            return result

    # 任务进展管理
    def create_task_progress(
        self,
        task_id: int,
        summary: str,
        context_count: int = 0,
        generated_at: datetime | None = None,
    ) -> int | None:
        """创建任务进展记录

        Args:
            task_id: 任务ID
            summary: 进展摘要内容
            context_count: 基于多少个上下文生成
            generated_at: 生成时间（可选，默认为当前时间）

        Returns:
            进展记录ID，失败返回None
        """
        try:
            with self.db_base.get_session() as session:
                progress = TaskProgress(
                    task_id=task_id,
                    summary=summary,
                    context_count=context_count,
                    generated_at=generated_at or datetime.now(),
                )
                session.add(progress)
                session.commit()
                logger.info(f"创建任务进展记录成功: task_id={task_id}, progress_id={progress.id}")
                return progress.id
        except SQLAlchemyError as e:
            logger.error(f"创建任务进展记录失败: {e}")
            return None

    def get_task_progress_list(
        self,
        task_id: int,
        limit: int = 10,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """获取任务的进展记录列表

        Args:
            task_id: 任务ID
            limit: 返回数量限制
            offset: 偏移量

        Returns:
            进展记录列表
        """
        try:
            with self.db_base.get_session() as session:
                progress_list = (
                    session.query(TaskProgress)
                    .filter_by(task_id=task_id)
                    .order_by(TaskProgress.generated_at.desc())
                    .limit(limit)
                    .offset(offset)
                    .all()
                )
                return [
                    {
                        "id": p.id,
                        "task_id": p.task_id,
                        "summary": p.summary,
                        "context_count": p.context_count,
                        "generated_at": p.generated_at,
                        "created_at": p.created_at,
                    }
                    for p in progress_list
                ]
        except SQLAlchemyError as e:
            logger.error(f"获取任务进展记录列表失败: {e}")
            return []

    def get_task_progress_latest(self, task_id: int) -> dict[str, Any] | None:
        """获取任务最新的进展记录

        Args:
            task_id: 任务ID

        Returns:
            最新的进展记录，无记录返回None
        """
        try:
            with self.db_base.get_session() as session:
                progress = (
                    session.query(TaskProgress)
                    .filter_by(task_id=task_id)
                    .order_by(TaskProgress.generated_at.desc())
                    .first()
                )
                if progress:
                    return {
                        "id": progress.id,
                        "task_id": progress.task_id,
                        "summary": progress.summary,
                        "context_count": progress.context_count,
                        "generated_at": progress.generated_at,
                        "created_at": progress.created_at,
                    }
                return None
        except SQLAlchemyError as e:
            logger.error(f"获取任务最新进展记录失败: {e}")
            return None

    def count_task_progress(self, task_id: int) -> int:
        """统计任务的进展记录数量

        Args:
            task_id: 任务ID

        Returns:
            进展记录数量
        """
        try:
            with self.db_base.get_session() as session:
                count = session.query(TaskProgress).filter_by(task_id=task_id).count()
                return count
        except SQLAlchemyError as e:
            logger.error(f"统计任务进展记录数量失败: {e}")
            return 0
