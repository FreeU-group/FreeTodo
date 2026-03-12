"""FastAPI 依赖注入模块

提供数据库会话和服务层的依赖注入工厂函数。
"""

from collections.abc import Generator
from functools import lru_cache

from fastapi import Depends
from sqlalchemy.orm import Session

from core.lazy_services import (
    get_rag_service as lazy_get_rag_service,
)
from core.lazy_services import (
    get_vector_service as lazy_get_vector_service,
)
from repositories.interfaces import (
    IActivityRepository,
    IChatRepository,
    IEventRepository,
    IJournalRepository,
    IOcrRepository,
    ITodoRepository,
)
from repositories.sql_activity_repository import SqlActivityRepository
from repositories.sql_chat_repository import SqlChatRepository
from repositories.sql_event_repository import SqlEventRepository, SqlOcrRepository
from repositories.sql_journal_repository import SqlJournalRepository
from repositories.sql_todo_repository import SqlTodoRepository
from services.activity_service import ActivityService
from services.chat_service import ChatService
from services.event_service import EventService
from services.journal_service import JournalService
from services.todo_service import TodoService
from storage.database_base import DatabaseBase
from util.settings import settings


def get_db_base() -> DatabaseBase:
    """获取数据库基础实例（复用 storage 模块的单例）"""
    from storage.database import db_base  # noqa: PLC0415

    return db_base


def get_db_session(
    db_base: DatabaseBase = Depends(get_db_base),
) -> Generator[Session]:
    """获取数据库会话 - 请求级别生命周期"""
    if db_base.SessionLocal is None:
        raise RuntimeError("Database session factory is not initialized.")
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
    db_base: DatabaseBase = Depends(get_db_base),
) -> JournalService:
    """获取 Journal 服务实例"""
    return JournalService(repo, db_base)


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
    return lazy_get_vector_service()


def get_rag_service():
    """获取 RAG 服务（延迟加载）"""
    return lazy_get_rag_service()


# ========== OCR 处理器依赖注入 ==========


@lru_cache(maxsize=1)
def get_ocr_processor():
    """获取 OCR 处理器（延迟加载，单例模式）"""
    from jobs.ocr_processor import SimpleOCRProcessor  # noqa: PLC0415

    return SimpleOCRProcessor()


# ========== 配置依赖注入 ==========


def get_settings():
    """获取配置对象"""
    return settings
