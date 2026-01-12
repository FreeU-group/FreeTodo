"""Todo工具共享模块 - 公共函数和常量"""

from lifetrace.repositories.interfaces import ITodoRepository
from lifetrace.repositories.sql_todo_repository import SqlTodoRepository
from lifetrace.services.todo_service import TodoService
from lifetrace.storage.database import db_base

# 常量定义
MAX_TITLE_LENGTH = 20


def get_todo_service() -> TodoService:
    """获取TodoService实例（工具内部使用）"""
    todo_repo: ITodoRepository = SqlTodoRepository(db_base)
    return TodoService(todo_repo)
