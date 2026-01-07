"""
数据库管理器主入口 - 直接暴露各个功能管理器
"""

from lifetrace.storage.activity_manager import ActivityManager
from lifetrace.storage.chat_manager import ChatManager
from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.event_manager import EventManager
from lifetrace.storage.journal_manager import JournalManager
from lifetrace.storage.ocr_manager import OCRManager
from lifetrace.storage.screenshot_manager import ScreenshotManager
from lifetrace.storage.stats_manager import StatsManager
from lifetrace.storage.todo_manager import TodoManager
from lifetrace.util.logging_config import get_logger

logger = get_logger()

# ===== 初始化数据库基础 =====
db_base = DatabaseBase()

# ===== 初始化各个功能管理器 =====
screenshot_mgr = ScreenshotManager(db_base)
event_mgr = EventManager(db_base)
ocr_mgr = OCRManager(db_base)
todo_mgr = TodoManager(db_base)
chat_mgr = ChatManager(db_base)
stats_mgr = StatsManager(db_base)
journal_mgr = JournalManager(db_base)
activity_mgr = ActivityManager(db_base)

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
