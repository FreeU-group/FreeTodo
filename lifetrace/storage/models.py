import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.ext.declarative import declarative_base


def get_local_time():
    """获取本地时间"""
    return datetime.datetime.now()


Base = declarative_base()


class Event(Base):
    """事件模型（按前台应用连续使用区间聚合截图）"""

    __tablename__ = "events"

    id = Column(Integer, primary_key=True)
    app_name = Column(String(200))
    window_title = Column(String(500))  # 首个或最近的窗口标题
    start_time = Column(DateTime, default=get_local_time)
    end_time = Column(DateTime)  # 事件结束时间（应用切换时填充）
    created_at = Column(DateTime, default=get_local_time)
    ai_title = Column(String(50))  # LLM生成的事件标题（≤10字）
    ai_summary = Column(Text)  # LLM生成的事件摘要（≤30字，支持markdown）

    def __repr__(self):
        return f"<Event(id={self.id}, app={self.app_name})>"


class Screenshot(Base):
    """截图记录模型"""

    __tablename__ = "screenshots"

    id = Column(Integer, primary_key=True)
    file_path = Column(String(500), nullable=False, unique=True)
    file_hash = Column(String(64), nullable=False)  # imagehash值
    file_size = Column(Integer, nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    screen_id = Column(Integer, nullable=False, default=0)
    app_name = Column(String(200))  # 前台应用名称
    window_title = Column(String(500))  # 窗口标题
    # 事件ID（可为空，老数据迁移后逐步填充）
    event_id = Column(Integer)
    created_at = Column(DateTime, default=get_local_time)
    processed_at = Column(DateTime)  # OCR处理时间
    is_processed = Column(Boolean, default=False)

    def __repr__(self):
        return f"<Screenshot(id={self.id}, file={self.file_path})>"


class OCRResult(Base):
    """OCR结果模型"""

    __tablename__ = "ocr_results"

    id = Column(Integer, primary_key=True)
    screenshot_id = Column(Integer, nullable=False)
    text_content = Column(Text)  # 提取的文本内容
    confidence = Column(Float)  # 置信度
    language = Column(String(10))  # 识别语言
    processing_time = Column(Float)  # 处理耗时（秒）
    created_at = Column(DateTime, default=get_local_time)

    def __repr__(self):
        return f"<OCRResult(id={self.id}, screenshot_id={self.screenshot_id})>"


class SearchIndex(Base):
    """搜索索引模型"""

    __tablename__ = "search_index"

    id = Column(Integer, primary_key=True)
    screenshot_id = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)  # 用于搜索的内容
    keywords = Column(Text)  # 关键词（JSON格式）
    created_at = Column(DateTime, default=get_local_time)

    def __repr__(self):
        return f"<SearchIndex(id={self.id}, screenshot_id={self.screenshot_id})>"


class ProcessingQueue(Base):
    """处理队列模型"""

    __tablename__ = "processing_queue"

    id = Column(Integer, primary_key=True)
    screenshot_id = Column(Integer, nullable=False)
    task_type = Column(String(50), nullable=False)  # 任务类型：ocr
    status = Column(
        String(20), default="pending"
    )  # pending, processing, completed, failed
    retry_count = Column(Integer, default=0)
    error_message = Column(Text)
    created_at = Column(DateTime, default=get_local_time)
    updated_at = Column(DateTime, default=get_local_time, onupdate=get_local_time)

    def __repr__(self):
        return f"<ProcessingQueue(id={self.id}, task={self.task_type}, status={self.status})>"


class UserBehaviorStats(Base):
    """用户行为统计模型"""

    __tablename__ = "user_behavior_stats"

    id = Column(Integer, primary_key=True)
    action_type = Column(
        String(50), nullable=False
    )  # search, chat, view_screenshot, etc.
    action_details = Column(Text)  # JSON格式的详细信息
    session_id = Column(String(100))  # 会话ID
    user_agent = Column(String(500))  # 用户代理
    ip_address = Column(String(50))  # IP地址
    response_time = Column(Float)  # 响应时间（毫秒）
    success = Column(Boolean, default=True)  # 操作是否成功
    created_at = Column(DateTime, default=get_local_time)

    def __repr__(self):
        return f"<UserBehaviorStats(id={self.id}, action={self.action_type})>"


class AppUsageLog(Base):
    """应用使用记录模型 - 用于精确的app使用统计"""

    __tablename__ = "app_usage_logs"

    id = Column(Integer, primary_key=True)
    app_name = Column(String(200), nullable=False)  # 应用名称
    window_title = Column(String(500))  # 窗口标题
    timestamp = Column(DateTime, default=get_local_time, nullable=False)  # 记录时间戳
    duration_seconds = Column(
        Integer, default=0
    )  # 持续时间（秒），用于记录从上次记录到现在的时长
    is_active = Column(Boolean, default=True)  # 是否为活跃状态
    screen_id = Column(Integer, default=0)  # 屏幕ID
    created_at = Column(DateTime, default=get_local_time)

    def __repr__(self):
        return f"<AppUsageLog(id={self.id}, app={self.app_name}, timestamp={self.timestamp})>"


class DailyStats(Base):
    """每日统计模型"""

    __tablename__ = "daily_stats"

    id = Column(Integer, primary_key=True)
    date = Column(String(10), nullable=False, unique=True)  # YYYY-MM-DD格式
    total_searches = Column(Integer, default=0)
    total_chats = Column(Integer, default=0)
    total_screenshots_viewed = Column(Integer, default=0)
    total_actions = Column(Integer, default=0)  # 添加缺失的字段
    total_sessions = Column(Integer, default=0)
    avg_response_time = Column(Float, default=0.0)
    most_active_hour = Column(Integer)  # 最活跃的小时
    top_search_keywords = Column(Text)  # JSON格式的热门搜索关键词
    created_at = Column(DateTime, default=get_local_time)
    updated_at = Column(DateTime, default=get_local_time, onupdate=get_local_time)

    def __repr__(self):
        return f"<DailyStats(date={self.date}, searches={self.total_searches})>"


class Project(Base):
    """项目管理模型"""

    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)  # 项目名称
    goal = Column(Text)  # 项目目标
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    updated_at = Column(DateTime, default=get_local_time, onupdate=get_local_time, nullable=False)

    def __repr__(self):
        return f"<Project(id={self.id}, name={self.name})>"


class Task(Base):
    """任务管理模型"""

    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True)  # task_id
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)  # 外键关联到项目
    name = Column(String(200), nullable=False)  # 任务名称
    description = Column(Text)  # 任务描述
    status = Column(
        String(20), default="pending", nullable=False
    )  # 任务状态：pending, in_progress, completed, cancelled
    parent_task_id = Column(Integer, ForeignKey("tasks.id"))  # 父任务ID（自关联，用于子任务）
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    updated_at = Column(
        DateTime, default=get_local_time, onupdate=get_local_time, nullable=False
    )

    def __repr__(self):
        return f"<Task(id={self.id}, name={self.name}, project_id={self.project_id})>"
