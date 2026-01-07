"""SQLModel 数据模型定义

使用 SQLModel 重写所有数据模型，保持与现有数据库表结构兼容。
"""

from datetime import datetime

from sqlmodel import Column, Field, SQLModel, Text

from lifetrace.util.time_utils import get_utc_now


def get_utc_time():
    """获取 UTC 时间（timezone-aware）"""
    return get_utc_now()


# ========== 混入类 ==========


class TimestampMixin(SQLModel):
    """时间戳混入类"""

    created_at: datetime = Field(default_factory=get_utc_time)
    updated_at: datetime = Field(default_factory=get_utc_time)
    deleted_at: datetime | None = None


# ========== 核心业务模型 ==========


class Screenshot(TimestampMixin, table=True):
    """截图记录模型"""

    __tablename__ = "screenshots"

    id: int | None = Field(default=None, primary_key=True)
    file_path: str = Field(max_length=500, unique=True)  # 文件路径
    file_hash: str = Field(max_length=64)  # 文件hash值
    file_size: int  # 文件大小
    file_deleted: bool = False  # 文件是否已被清理
    width: int  # 截图宽度
    height: int  # 截图高度
    screen_id: int = 0  # 屏幕ID
    app_name: str | None = Field(default=None, max_length=200)  # 前台应用名称
    window_title: str | None = Field(default=None, max_length=500)  # 窗口标题
    event_id: int | None = None  # 关联事件ID
    is_processed: bool = False  # 是否在进行OCR处理
    processed_at: datetime | None = None  # OCR处理完成时间

    def __repr__(self):
        return f"<Screenshot(id={self.id}, file={self.file_path})>"


class OCRResult(TimestampMixin, table=True):
    """OCR结果模型"""

    __tablename__ = "ocr_results"

    id: int | None = Field(default=None, primary_key=True)
    screenshot_id: int  # 关联截图ID
    text_content: str | None = Field(default=None, sa_column=Column(Text))  # 提取的文本内容
    confidence: float | None = None  # 置信度[0, 1]
    language: str | None = Field(default=None, max_length=10)  # 识别语言
    processing_time: float | None = None  # OCR处理耗时（秒）

    def __repr__(self):
        return f"<OCRResult(id={self.id}, screenshot_id={self.screenshot_id})>"


class Event(TimestampMixin, table=True):
    """事件模型（按前台应用连续使用区间聚合截图）"""

    __tablename__ = "events"

    id: int | None = Field(default=None, primary_key=True)
    app_name: str | None = Field(default=None, max_length=200)  # 前台应用名称
    window_title: str | None = Field(default=None, max_length=500)  # 首个或最近的窗口标题
    start_time: datetime = Field(default_factory=get_utc_time)  # 事件开始时间
    end_time: datetime | None = None  # 事件结束时间
    status: str = Field(default="new", max_length=20)  # 事件状态：new, processing, done
    ai_title: str | None = Field(default=None, max_length=50)  # LLM生成的事件标题
    ai_summary: str | None = Field(default=None, sa_column=Column(Text))  # LLM生成的事件摘要

    def __repr__(self):
        return f"<Event(id={self.id}, app={self.app_name}, status={self.status})>"


class Todo(TimestampMixin, table=True):
    """待办事项模型"""

    __tablename__ = "todos"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=200)  # 待办名称
    description: str | None = Field(default=None, sa_column=Column(Text))  # 描述
    user_notes: str | None = Field(default=None, sa_column=Column(Text))  # 用户笔记
    parent_todo_id: int | None = None  # 父级待办ID（自关联）
    deadline: datetime | None = None  # 截止时间
    start_time: datetime | None = None  # 开始时间
    status: str = Field(default="active", max_length=20)  # active/completed/canceled
    priority: str = Field(default="none", max_length=20)  # high/medium/low/none
    order: int = 0  # 同级待办之间的展示排序
    related_activities: str | None = Field(
        default=None, sa_column=Column(Text)
    )  # 关联活动ID的JSON数组

    def __repr__(self):
        return f"<Todo(id={self.id}, name={self.name}, status={self.status})>"


class Attachment(TimestampMixin, table=True):
    """附件信息模型"""

    __tablename__ = "attachments"

    id: int | None = Field(default=None, primary_key=True)
    file_path: str = Field(max_length=500)  # 本地持久化路径
    file_name: str = Field(max_length=200)  # 文件名
    file_size: int | None = None  # 文件大小（字节）
    mime_type: str | None = Field(default=None, max_length=100)  # MIME类型
    file_hash: str | None = Field(default=None, max_length=64)  # 去重hash

    def __repr__(self):
        return f"<Attachment(id={self.id}, file_name={self.file_name})>"


class TodoAttachmentRelation(SQLModel, table=True):
    """待办与附件的多对多关联关系"""

    __tablename__ = "todo_attachment_relations"

    id: int | None = Field(default=None, primary_key=True)
    todo_id: int  # 关联的待办ID
    attachment_id: int  # 关联的附件ID
    created_at: datetime = Field(default_factory=get_utc_time)
    deleted_at: datetime | None = None

    def __repr__(self):
        return f"<TodoAttachmentRelation(id={self.id}, todo_id={self.todo_id})>"


class Tag(SQLModel, table=True):
    """标签模型"""

    __tablename__ = "tags"

    id: int | None = Field(default=None, primary_key=True)
    tag_name: str = Field(max_length=50, unique=True)  # 标签名称
    created_at: datetime = Field(default_factory=get_utc_time)
    deleted_at: datetime | None = None

    def __repr__(self):
        return f"<Tag(id={self.id}, name={self.tag_name})>"


class TodoTagRelation(SQLModel, table=True):
    """待办与标签的多对多关联关系"""

    __tablename__ = "todo_tag_relations"

    id: int | None = Field(default=None, primary_key=True)
    todo_id: int  # 关联的待办ID
    tag_id: int  # 关联的标签ID
    created_at: datetime = Field(default_factory=get_utc_time)
    deleted_at: datetime | None = None

    def __repr__(self):
        return f"<TodoTagRelation(id={self.id}, todo_id={self.todo_id}, tag_id={self.tag_id})>"


class Journal(TimestampMixin, table=True):
    """日记模型"""

    __tablename__ = "journals"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=200)  # 日记标题
    user_notes: str = Field(sa_column=Column(Text))  # 富文本内容
    date: datetime  # 日记日期
    content_format: str = Field(default="markdown", max_length=20)  # 内容格式

    def __repr__(self):
        return f"<Journal(id={self.id}, name={self.name}, date={self.date})>"


class JournalTagRelation(SQLModel, table=True):
    """日记与标签的多对多关联关系"""

    __tablename__ = "journal_tag_relations"

    id: int | None = Field(default=None, primary_key=True)
    journal_id: int  # 关联的日记ID
    tag_id: int  # 关联的标签ID
    created_at: datetime = Field(default_factory=get_utc_time)
    deleted_at: datetime | None = None

    def __repr__(self):
        return f"<JournalTagRelation(id={self.id}, journal_id={self.journal_id}, tag_id={self.tag_id})>"


class Chat(TimestampMixin, table=True):
    """聊天会话模型"""

    __tablename__ = "chats"

    id: int | None = Field(default=None, primary_key=True)
    session_id: str = Field(max_length=100, unique=True)  # 会话ID
    chat_type: str | None = Field(default=None, max_length=50)  # 聊天类型
    title: str | None = Field(default=None, max_length=200)  # 会话标题
    context_id: int | None = None  # 关联的上下文ID
    extra_data: str | None = Field(default=None, sa_column=Column(Text))  # 额外数据（JSON格式）
    context: str | None = Field(default=None, sa_column=Column(Text))  # 会话上下文（JSON格式）
    last_message_at: datetime | None = None  # 最后一条消息的时间

    def __repr__(self):
        return f"<Chat(id={self.id}, session_id={self.session_id}, type={self.chat_type})>"


class Message(TimestampMixin, table=True):
    """消息模型"""

    __tablename__ = "messages"

    id: int | None = Field(default=None, primary_key=True)
    chat_id: int  # 关联的聊天会话ID
    role: str = Field(max_length=20)  # 消息角色：user, assistant, system
    content: str = Field(sa_column=Column(Text))  # 消息内容
    token_count: int | None = None  # token数量
    model: str | None = Field(default=None, max_length=100)  # 使用的模型名称
    extra_data: str | None = Field(default=None, sa_column=Column(Text))  # 额外数据

    def __repr__(self):
        return f"<Message(id={self.id}, chat_id={self.chat_id}, role={self.role})>"


class TokenUsage(TimestampMixin, table=True):
    """Token使用量记录模型"""

    __tablename__ = "token_usage"

    id: int | None = Field(default=None, primary_key=True)
    model: str = Field(max_length=100)  # 使用的模型名称
    input_tokens: int  # 输入token数量
    output_tokens: int  # 输出token数量
    total_tokens: int  # 总token数量
    endpoint: str | None = Field(default=None, max_length=200)  # API端点
    response_type: str | None = Field(default=None, max_length=50)  # 响应类型
    feature_type: str | None = Field(default=None, max_length=50)  # 功能类型
    user_query_preview: str | None = Field(default=None, sa_column=Column(Text))  # 用户查询预览
    query_length: int | None = None  # 查询长度
    input_cost: float | None = None  # 输入成本（元）
    output_cost: float | None = None  # 输出成本（元）
    total_cost: float | None = None  # 总成本（元）

    def __repr__(self):
        return f"<TokenUsage(id={self.id}, model={self.model}, total_tokens={self.total_tokens})>"


class Activity(TimestampMixin, table=True):
    """活动模型（聚合15分钟内的事件）"""

    __tablename__ = "activities"

    id: int | None = Field(default=None, primary_key=True)
    start_time: datetime  # 活动开始时间
    end_time: datetime  # 活动结束时间
    ai_title: str | None = Field(default=None, max_length=100)  # LLM生成的活动标题
    ai_summary: str | None = Field(default=None, sa_column=Column(Text))  # LLM生成的活动摘要
    event_count: int = 0  # 包含的事件数量

    def __repr__(self):
        return f"<Activity(id={self.id}, start_time={self.start_time}, event_count={self.event_count})>"


class ActivityEventRelation(SQLModel, table=True):
    """活动与事件的关联关系表"""

    __tablename__ = "activity_event_relations"

    id: int | None = Field(default=None, primary_key=True)
    activity_id: int  # 关联的活动ID
    event_id: int  # 关联的事件ID
    created_at: datetime = Field(default_factory=get_utc_time)
    deleted_at: datetime | None = None  # 软删除时间戳

    def __repr__(self):
        return f"<ActivityEventRelation(id={self.id}, activity_id={self.activity_id})>"


# 为兼容旧代码，保留 Base 引用（指向 SQLModel.metadata）
# 这样现有的 Base.metadata.create_all() 调用仍然有效
Base = SQLModel
