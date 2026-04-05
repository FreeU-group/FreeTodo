"""
数据库管理器主入口 - 直接暴露各个功能管理器
"""

from storage.activity_manager import ActivityManager
from storage.agent_plan_manager import AgentPlanManager
from storage.automation_task_manager import AutomationTaskManager
from storage.chat_manager import ChatManager
from storage.database_base import DatabaseBase
from storage.event_manager import EventManager
from storage.journal_manager import JournalManager
from storage.location_manager import LocationManager
from storage.ocr_manager import OCRManager
from storage.screenshot_manager import ScreenshotManager
from storage.stats_manager import StatsManager
from storage.todo_manager import TodoManager
from util.logging_config import get_logger

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
automation_task_mgr = AutomationTaskManager(db_base)
agent_plan_mgr = AgentPlanManager(db_base)
location_mgr = LocationManager(db_base)

# ===== 向后兼容：保留原有的接口 =====
engine = db_base.engine
SessionLocal = db_base.SessionLocal


def get_session():
    """获取数据库会话上下文管理器"""
    return db_base.get_session()


# 数据库会话生成器（用于依赖注入）
def get_db():
    """获取数据库会话的生成器函数"""
    if SessionLocal is None:
        raise RuntimeError("Database session factory is not initialized.")
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def reinitialize_db() -> None:
    """Profile 切换后重新初始化数据库连接和管理器。"""
    global engine, SessionLocal  # noqa: PLW0603

    db_base.reinitialize()
    engine = db_base.engine
    SessionLocal = db_base.SessionLocal

    screenshot_mgr.db_base = db_base
    event_mgr.db_base = db_base
    ocr_mgr.db_base = db_base
    todo_mgr.db_base = db_base
    chat_mgr.db_base = db_base
    stats_mgr.db_base = db_base
    journal_mgr.db_base = db_base
    activity_mgr.db_base = db_base
    automation_task_mgr.db_base = db_base
    agent_plan_mgr.db_base = db_base
    location_mgr.db_base = db_base

    logger.info("数据库已重新初始化（Profile 切换）")
