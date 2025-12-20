"""FastAPI 依赖注入模块

提供数据库会话和服务层的依赖注入工厂函数。
"""

from collections.abc import Generator

from fastapi import Depends
from sqlalchemy.orm import Session

from lifetrace.repositories.interfaces import (
    IActivityRepository,
    IChatRepository,
    IEventRepository,
    IJournalRepository,
    IOcrRepository,
    IProjectRepository,
    ITaskRepository,
    ITodoRepository,
)
from lifetrace.repositories.sql_activity_repository import SqlActivityRepository
from lifetrace.repositories.sql_chat_repository import SqlChatRepository
from lifetrace.repositories.sql_event_repository import SqlEventRepository, SqlOcrRepository
from lifetrace.repositories.sql_journal_repository import SqlJournalRepository
from lifetrace.repositories.sql_project_repository import SqlProjectRepository
from lifetrace.repositories.sql_task_repository import SqlTaskRepository
from lifetrace.repositories.sql_todo_repository import SqlTodoRepository
from lifetrace.services.activity_service import ActivityService
from lifetrace.services.chat_service import ChatService
from lifetrace.services.event_service import EventService
from lifetrace.services.journal_service import JournalService
from lifetrace.services.project_service import ProjectService
from lifetrace.services.task_service import TaskService
from lifetrace.services.todo_service import TodoService
from lifetrace.storage.database import db_base
from lifetrace.storage.database_base import DatabaseBase


def get_db_base() -> DatabaseBase:
    """获取数据库基础实例（复用 storage 模块的单例）"""
    return db_base


def get_db_session(
    db_base: DatabaseBase = Depends(get_db_base),
) -> Generator[Session]:
    """获取数据库会话 - 请求级别生命周期"""
    session = db_base.SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# ========== Todo 模块依赖注入 ==========


def get_todo_repository(
    db_base: DatabaseBase = Depends(get_db_base),
) -> ITodoRepository:
    """获取 Todo 仓库实例"""
    return SqlTodoRepository(db_base)


def get_todo_service(
    repo: ITodoRepository = Depends(get_todo_repository),
) -> TodoService:
    """获取 Todo 服务实例"""
    return TodoService(repo)


# ========== Journal 模块依赖注入 ==========


def get_journal_repository(
    db_base: DatabaseBase = Depends(get_db_base),
) -> IJournalRepository:
    """获取 Journal 仓库实例"""
    return SqlJournalRepository(db_base)


def get_journal_service(
    repo: IJournalRepository = Depends(get_journal_repository),
) -> JournalService:
    """获取 Journal 服务实例"""
    return JournalService(repo)


# ========== Event 模块依赖注入 ==========


def get_event_repository(
    db_base: DatabaseBase = Depends(get_db_base),
) -> IEventRepository:
    """获取 Event 仓库实例"""
    return SqlEventRepository(db_base)


def get_ocr_repository(
    db_base: DatabaseBase = Depends(get_db_base),
) -> IOcrRepository:
    """获取 OCR 仓库实例"""
    return SqlOcrRepository(db_base)


def get_event_service(
    event_repo: IEventRepository = Depends(get_event_repository),
    ocr_repo: IOcrRepository = Depends(get_ocr_repository),
) -> EventService:
    """获取 Event 服务实例"""
    return EventService(event_repo, ocr_repo)


# ========== Activity 模块依赖注入 ==========


def get_activity_repository(
    db_base: DatabaseBase = Depends(get_db_base),
) -> IActivityRepository:
    """获取 Activity 仓库实例"""
    return SqlActivityRepository(db_base)


def get_activity_service(
    activity_repo: IActivityRepository = Depends(get_activity_repository),
    event_repo: IEventRepository = Depends(get_event_repository),
) -> ActivityService:
    """获取 Activity 服务实例"""
    return ActivityService(activity_repo, event_repo)


# ========== Project 模块依赖注入 ==========


def get_project_repository(
    db_base: DatabaseBase = Depends(get_db_base),
) -> IProjectRepository:
    """获取 Project 仓库实例"""
    return SqlProjectRepository(db_base)


def get_task_repository(
    db_base: DatabaseBase = Depends(get_db_base),
) -> ITaskRepository:
    """获取 Task 仓库实例"""
    return SqlTaskRepository(db_base)


def get_project_service(
    project_repo: IProjectRepository = Depends(get_project_repository),
    task_repo: ITaskRepository = Depends(get_task_repository),
) -> ProjectService:
    """获取 Project 服务实例"""
    return ProjectService(project_repo, task_repo)


def get_task_service(
    task_repo: ITaskRepository = Depends(get_task_repository),
    project_repo: IProjectRepository = Depends(get_project_repository),
) -> TaskService:
    """获取 Task 服务实例"""
    return TaskService(task_repo, project_repo)


# ========== Chat 模块依赖注入 ==========


def get_chat_repository(
    db_base: DatabaseBase = Depends(get_db_base),
) -> IChatRepository:
    """获取 Chat 仓库实例"""
    return SqlChatRepository(db_base)


def get_chat_service(
    repo: IChatRepository = Depends(get_chat_repository),
) -> ChatService:
    """获取 Chat 服务实例"""
    return ChatService(repo)


# ========== 延迟加载服务 ==========


def get_vector_service():
    """获取向量服务（延迟加载）"""
    from lifetrace.core.lazy_services import get_vector_service as lazy_get

    return lazy_get()


def get_rag_service():
    """获取 RAG 服务（延迟加载）"""
    from lifetrace.core.lazy_services import get_rag_service as lazy_get

    return lazy_get()


# ========== OCR 处理器依赖注入 ==========

_ocr_processor = None


def get_ocr_processor():
    """获取 OCR 处理器（延迟加载，单例模式）"""
    global _ocr_processor
    if _ocr_processor is None:
        from lifetrace.jobs.ocr import SimpleOCRProcessor

        _ocr_processor = SimpleOCRProcessor()
    return _ocr_processor


# ========== 配置依赖注入 ==========


def get_settings():
    """获取配置对象"""
    from lifetrace.util.settings import settings

    return settings
