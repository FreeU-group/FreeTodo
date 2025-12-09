import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.ext.declarative import declarative_base


def get_local_time():
    """获取本地时间"""
    return datetime.datetime.now()


Base = declarative_base()


class Screenshot(Base):
    """截图记录模型"""

    __tablename__ = "screenshots"

    id = Column(Integer, primary_key=True)
    file_path = Column(String(500), nullable=False, unique=True)  # 文件路径
    file_hash = Column(String(64), nullable=False)  # 文件hash值
    file_size = Column(Integer, nullable=False)  # 文件大小
    file_deleted = Column(Boolean, default=False)  # 文件是否已被清理（标记后前端显示占位图）
    width = Column(Integer, nullable=False)  # 截图宽度
    height = Column(Integer, nullable=False)  # 截图高度
    screen_id = Column(Integer, nullable=False, default=0)  # 屏幕ID
    app_name = Column(String(200))  # 前台应用名称
    window_title = Column(String(500))  # 窗口标题
    event_id = Column(Integer)  # 关联事件ID
    is_processed = Column(Boolean, default=False)  # 是否在进行OCR处理
    processed_at = Column(DateTime)  # OCR处理完成时间
    created_at = Column(DateTime, default=get_local_time, nullable=False)  # 创建时间
    updated_at = Column(
        DateTime, default=get_local_time, onupdate=get_local_time, nullable=False
    )  # 更新时间
    deleted_at = Column(DateTime)  # 软删除时间戳

    def __repr__(self):
        return f"<Screenshot(id={self.id}, file={self.file_path})>"


class OCRResult(Base):
    """OCR结果模型"""

    __tablename__ = "ocr_results"

    id = Column(Integer, primary_key=True)
    screenshot_id = Column(Integer, nullable=False)  # 关联截图ID
    text_content = Column(Text)  # 提取的文本内容
    confidence = Column(Float)  # 置信度[0, 1]
    language = Column(String(10))  # 识别语言（zh, en, ja, etc.）
    processing_time = Column(Float)  # OCR处理耗时（秒）
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    updated_at = Column(DateTime, default=get_local_time, onupdate=get_local_time, nullable=False)
    deleted_at = Column(DateTime)  # 软删除时间戳

    def __repr__(self):
        return f"<OCRResult(id={self.id}, screenshot_id={self.screenshot_id})>"


class Event(Base):
    """事件模型（按前台应用连续使用区间聚合截图）"""

    __tablename__ = "events"

    id = Column(Integer, primary_key=True)
    app_name = Column(String(200))  # 前台应用名称
    window_title = Column(String(500))  # 首个或最近的窗口标题
    start_time = Column(DateTime, default=get_local_time)  # 事件开始时间
    end_time = Column(DateTime)  # 事件结束时间（应用切换时填充）
    status = Column(String(20), default="new")  # 事件状态：new, processing, done
    ai_title = Column(String(50))  # LLM生成的事件标题（≤10字）
    ai_summary = Column(Text)  # LLM生成的事件摘要（≤30字，支持markdown）
    task_id = Column(Integer)  # 关联的任务ID（可为空）
    auto_association_attempted = Column(Boolean, default=False)  # 是否已尝试过自动关联
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    updated_at = Column(DateTime, default=get_local_time, onupdate=get_local_time, nullable=False)
    deleted_at = Column(DateTime)  # 软删除时间戳

    def __repr__(self):
        return f"<Event(id={self.id}, app={self.app_name}, status={self.status})>"


class EventTaskRelation(Base):
    """事件与任务的关联关系表"""

    __tablename__ = "event_task_relations"

    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, nullable=False)  # 关联的事件ID
    project_id = Column(Integer)  # 关联的项目ID
    task_id = Column(Integer)  # 关联的任务ID
    project_confidence = Column(Float)  # 项目关联置信度
    task_confidence = Column(Float)  # 任务关联置信度
    reasoning = Column(Text)  # 关联推理过程
    association_method = Column(String(50))  # 关联方法：auto, manual等
    used_in_summary = Column(Boolean, default=False)  # 是否已用于任务摘要
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    updated_at = Column(DateTime, default=get_local_time, onupdate=get_local_time, nullable=False)
    deleted_at = Column(DateTime)  # 软删除时间戳

    def __repr__(self):
        return (
            f"<EventTaskRelation(id={self.id}, event_id={self.event_id}, task_id={self.task_id})>"
        )


class Project(Base):
    """项目管理模型"""

    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)

    # 1. 身份锚点
    name = Column(String(200), nullable=False)  # 项目名称
    definition_of_done = Column(Text, nullable=True)  # "完成"的标准
    status = Column(String(20), default="active")  # 项目状态：active, archived, completed

    # 2. 描述 / AI 与系统上下文
    description = Column(Text, nullable=True)  # 项目描述或为 Advisor 提供的总结性上下文

    # 3. 元数据（保留现有字段）
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    updated_at = Column(DateTime, default=get_local_time, onupdate=get_local_time, nullable=False)
    deleted_at = Column(DateTime)

    def __repr__(self):
        return f"<Project(id={self.id}, name={self.name})>"


class Task(Base):
    """任务管理模型"""

    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, nullable=False)  # 关联到项目ID
    name = Column(String(200), nullable=False)  # 任务名称
    description = Column(Text)  # 任务描述
    status = Column(
        String(20), default="pending", nullable=False
    )  # 任务状态：pending, in_progress, completed, cancelled
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    updated_at = Column(DateTime, default=get_local_time, onupdate=get_local_time, nullable=False)
    deleted_at = Column(DateTime)

    def __repr__(self):
        return f"<Task(id={self.id}, name={self.name}, project_id={self.project_id})>"


class TaskProgress(Base):
    """任务进展记录模型"""

    __tablename__ = "task_progress"

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, nullable=False)  # 关联的任务ID
    summary = Column(Text, nullable=False)  # 进展摘要内容
    context_count = Column(Integer, default=0)  # 基于多少个上下文生成
    generated_at = Column(DateTime, default=get_local_time, nullable=False)  # 生成时间
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    updated_at = Column(DateTime, default=get_local_time, onupdate=get_local_time, nullable=False)
    deleted_at = Column(DateTime)

    def __repr__(self):
        return f"<TaskProgress(id={self.id}, task_id={self.task_id}, generated_at={self.generated_at})>"


class Todo(Base):
    """待办事项模型"""

    __tablename__ = "todos"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)  # 待办名称
    description = Column(Text)  # 描述
    user_notes = Column(Text)  # 用户笔记
    parent_todo_id = Column(Integer)  # 父级待办ID（自关联）
    deadline = Column(DateTime)  # 截止时间
    status = Column(String(20), default="active", nullable=False)  # active/completed/canceled
    related_activities = Column(Text)  # 关联活动ID的JSON数组
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    updated_at = Column(DateTime, default=get_local_time, onupdate=get_local_time, nullable=False)
    deleted_at = Column(DateTime)

    def __repr__(self):
        return f"<Todo(id={self.id}, name={self.name}, status={self.status})>"


class Attachment(Base):
    """附件信息模型（可复用）"""

    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True)
    file_path = Column(String(500), nullable=False)  # 本地持久化路径
    file_name = Column(String(200), nullable=False)  # 文件名
    file_size = Column(Integer)  # 文件大小（字节）
    mime_type = Column(String(100))  # MIME类型
    file_hash = Column(String(64))  # 去重hash
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    updated_at = Column(DateTime, default=get_local_time, onupdate=get_local_time, nullable=False)
    deleted_at = Column(DateTime)

    def __repr__(self):
        return f"<Attachment(id={self.id}, file_name={self.file_name})>"


class TodoAttachmentRelation(Base):
    """待办与附件的多对多关联关系"""

    __tablename__ = "todo_attachment_relations"

    id = Column(Integer, primary_key=True)
    todo_id = Column(Integer, nullable=False)  # 关联的待办ID
    attachment_id = Column(Integer, nullable=False)  # 关联的附件ID
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    deleted_at = Column(DateTime)

    def __repr__(self):
        return f"<TodoAttachmentRelation(id={self.id}, todo_id={self.todo_id}, attachment_id={self.attachment_id})>"


class Tag(Base):
    """标签模型（可复用）"""

    __tablename__ = "tags"

    id = Column(Integer, primary_key=True)
    tag_name = Column(String(50), nullable=False, unique=True)  # 标签名称
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    deleted_at = Column(DateTime)

    def __repr__(self):
        return f"<Tag(id={self.id}, name={self.tag_name})>"


class TodoTagRelation(Base):
    """待办与标签的多对多关联关系"""

    __tablename__ = "todo_tag_relations"

    id = Column(Integer, primary_key=True)
    todo_id = Column(Integer, nullable=False)  # 关联的待办ID
    tag_id = Column(Integer, nullable=False)  # 关联的标签ID
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    deleted_at = Column(DateTime)

    def __repr__(self):
        return f"<TodoTagRelation(id={self.id}, todo_id={self.todo_id}, tag_id={self.tag_id})>"


class Journal(Base):
    """日记模型"""

    __tablename__ = "journals"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)  # 日记标题
    user_notes = Column(Text, nullable=False)  # 富文本内容
    date = Column(DateTime, nullable=False)  # 日记日期
    content_format = Column(String(20), default="markdown")  # 内容格式：markdown/html/json
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    updated_at = Column(DateTime, default=get_local_time, onupdate=get_local_time, nullable=False)
    deleted_at = Column(DateTime)

    def __repr__(self):
        return f"<Journal(id={self.id}, name={self.name}, date={self.date})>"


class JournalTagRelation(Base):
    """日记与标签的多对多关联关系"""

    __tablename__ = "journal_tag_relations"

    id = Column(Integer, primary_key=True)
    journal_id = Column(Integer, nullable=False)  # 关联的日记ID
    tag_id = Column(Integer, nullable=False)  # 关联的标签ID
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    deleted_at = Column(DateTime)

    def __repr__(self):
        return f"<JournalTagRelation(id={self.id}, journal_id={self.journal_id}, tag_id={self.tag_id})>"


class Chat(Base):
    """聊天会话模型"""

    __tablename__ = "chats"

    id = Column(Integer, primary_key=True)
    session_id = Column(String(100), nullable=False, unique=True)  # 会话ID
    chat_type = Column(String(50))  # 聊天类型：event, project, general等
    title = Column(String(200))  # 会话标题
    context_id = Column(Integer)  # 关联的上下文ID（可选）
    extra_data = Column(Text)  # 额外数据（JSON格式）
    last_message_at = Column(DateTime)  # 最后一条消息的时间
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    updated_at = Column(DateTime, default=get_local_time, onupdate=get_local_time, nullable=False)
    deleted_at = Column(DateTime)

    def __repr__(self):
        return f"<Chat(id={self.id}, session_id={self.session_id}, type={self.chat_type})>"


class Message(Base):
    """消息模型"""

    __tablename__ = "messages"

    id = Column(Integer, primary_key=True)
    chat_id = Column(Integer, nullable=False)  # 关联的聊天会话ID
    role = Column(String(20), nullable=False)  # 消息角色：user, assistant, system
    content = Column(Text, nullable=False)  # 消息内容
    token_count = Column(Integer)  # token数量
    model = Column(String(100))  # 使用的模型名称
    extra_data = Column(Text)  # 额外数据（JSON格式）
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    updated_at = Column(DateTime, default=get_local_time, onupdate=get_local_time, nullable=False)
    deleted_at = Column(DateTime)

    def __repr__(self):
        return f"<Message(id={self.id}, chat_id={self.chat_id}, role={self.role})>"


class TokenUsage(Base):
    """Token使用量记录模型"""

    __tablename__ = "token_usage"

    id = Column(Integer, primary_key=True)
    model = Column(String(100), nullable=False)  # 使用的模型名称
    input_tokens = Column(Integer, nullable=False)  # 输入token数量
    output_tokens = Column(Integer, nullable=False)  # 输出token数量
    total_tokens = Column(Integer, nullable=False)  # 总token数量
    endpoint = Column(String(200))  # API端点
    response_type = Column(String(50))  # 响应类型
    feature_type = Column(String(50))  # 功能类型
    user_query_preview = Column(Text)  # 用户查询预览（前200字符）
    query_length = Column(Integer)  # 查询长度
    input_cost = Column(Float)  # 输入成本（元）
    output_cost = Column(Float)  # 输出成本（元）
    total_cost = Column(Float)  # 总成本（元）
    created_at = Column(DateTime, default=get_local_time, nullable=False)
    updated_at = Column(DateTime, default=get_local_time, onupdate=get_local_time, nullable=False)
    deleted_at = Column(DateTime)  # 软删除时间戳

    def __repr__(self):
        return f"<TokenUsage(id={self.id}, model={self.model}, total_tokens={self.total_tokens}, cost={self.total_cost})>"
