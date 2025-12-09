"""
数据库管理器主入口 - 直接暴露各个功能管理器
"""

from lifetrace.storage.chat_manager import ChatManager
from lifetrace.storage.context_manager import ContextManager
from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.event_manager import EventManager
from lifetrace.storage.journal_manager import JournalManager
from lifetrace.storage.ocr_manager import OCRManager
from lifetrace.storage.project_manager import ProjectManager
from lifetrace.storage.screenshot_manager import ScreenshotManager
from lifetrace.storage.stats_manager import StatsManager
from lifetrace.storage.task_manager import TaskManager
from lifetrace.util.logging_config import get_logger

logger = get_logger()

# ===== 初始化数据库基础 =====
db_base = DatabaseBase()

# ===== 初始化各个功能管理器 =====
screenshot_mgr = ScreenshotManager(db_base)
event_mgr = EventManager(db_base)
ocr_mgr = OCRManager(db_base)
project_mgr = ProjectManager(db_base)
task_mgr = TaskManager(db_base)
context_mgr = ContextManager(db_base)
chat_mgr = ChatManager(db_base)
stats_mgr = StatsManager(db_base)
journal_mgr = JournalManager(db_base)

# ===== 向后兼容：保留原有的接口 =====
engine = db_base.engine
SessionLocal = db_base.SessionLocal


def get_session():
    """获取数据库会话上下文管理器"""
    return db_base.get_session()


# 数据库会话生成器（用于依赖注入）
def get_db():
    """获取数据库会话的生成器函数"""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
