"""FastAPI 依赖注入模块

提供数据库会话和服务层的依赖注入工厂函数。
"""

from collections.abc import Generator

from fastapi import Depends
from sqlalchemy.orm import Session

from lifetrace.repositories.interfaces import ITodoRepository
from lifetrace.repositories.sql_todo_repository import SqlTodoRepository
from lifetrace.services.todo_service import TodoService
from lifetrace.storage.database_base import DatabaseBase

# 数据库基础实例（轻量，保持单例）
_db_base: DatabaseBase | None = None


def get_db_base() -> DatabaseBase:
    """获取数据库基础实例（单例）"""
    global _db_base
    if _db_base is None:
        _db_base = DatabaseBase()
    return _db_base


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
