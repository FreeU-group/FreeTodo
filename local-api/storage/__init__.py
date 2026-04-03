"""
Storage 模块

提供数据库管理和模型定义。

注意：
- 该包在导入时**不应**执行数据库初始化/迁移等副作用操作。
- 需要访问 `db_base` / `*_mgr` 等对象时，采用懒加载，避免在 Alembic 迁移环境中
  （`lifetrace/migrations/env.py`）导入模型时触发递归迁移。
"""

from __future__ import annotations

import importlib
from typing import TYPE_CHECKING

__all__ = [
    "activity_mgr",
    "automation_task_mgr",
    "chat_mgr",
    "db_base",
    "event_mgr",
    "get_db",
    "get_session",
    "journal_mgr",
    "ocr_mgr",
    "screenshot_mgr",
    "stats_mgr",
    "todo_mgr",
]

_LAZY_EXPORTS: set[str] = set(__all__)

if TYPE_CHECKING:
    from storage.database import (
        activity_mgr,
        automation_task_mgr,
        chat_mgr,
        db_base,
        event_mgr,
        get_db,
        get_session,
        journal_mgr,
        ocr_mgr,
        screenshot_mgr,
        stats_mgr,
        todo_mgr,
    )


def __getattr__(name: str):
    if name in _LAZY_EXPORTS:
        # 仅在真正需要时才触发数据库初始化
        _database = importlib.import_module("storage.database")
        return getattr(_database, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__() -> list[str]:
    return sorted(set(globals().keys()) | _LAZY_EXPORTS)
