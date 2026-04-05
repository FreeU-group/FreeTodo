"""SQLModel 数据模型定义

使用 SQLModel 重写所有数据模型，保持与现有数据库表结构兼容。
"""

# pyright: reportIncompatibleVariableOverride=false

from datetime import datetime
from enum import StrEnum
from typing import ClassVar
from uuid import uuid4

from sqlmodel import Column, Field, SQLModel, Text

from util.time_utils import get_utc_now


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

    __tablename__: ClassVar[str] = "screenshots"

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

    __tablename__: ClassVar[str] = "ocr_results"

    id: int | None = Field(default=None, primary_key=True)
    screenshot_id: int  # 关联截图ID
    text_content: str | None = Field(default=None, sa_column=Column(Text))  # 提取的文本内容
    confidence: float | None = None  # 置信度[0, 1]
    language: str | None = Field(default=None, max_length=10)  # 识别语言
    processing_time: float | None = None  # OCR处理耗时（秒）
    text_hash: str | None = Field(
        default=None,
        max_length=64,
        index=True,
    )  # 文本内容的哈希值，用于去重和缓存

    def __repr__(self):
        return f"<OCRResult(id={self.id}, screenshot_id={self.screenshot_id})>"


class Event(TimestampMixin, table=True):
    """事件模型（按前台应用连续使用区间聚合截图）"""

    __tablename__: ClassVar[str] = "events"

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

    __tablename__: ClassVar[str] = "todos"

    id: int | None = Field(default=None, primary_key=True)
    uid: str = Field(
        default_factory=lambda: str(uuid4()), max_length=64, index=True
    )  # iCalendar UID
    name: str = Field(max_length=200)  # 待办名称
    summary: str | None = Field(default=None, max_length=200)  # iCalendar SUMMARY
    description: str | None = Field(default=None, sa_column=Column(Text))  # 描述
    user_notes: str | None = Field(default=None, sa_column=Column(Text))  # 用户笔记
    who_founder: str | None = Field(default=None, max_length=100)  # 谁发起（意图识别）
    who_executor: str | None = Field(default=None, max_length=100)  # 谁去做（意图识别）
    parent_todo_id: int | None = None  # 父级待办ID（自关联）
    item_type: str = Field(default="VTODO", max_length=10)  # iCalendar VTODO/VEVENT
    location: str | None = Field(default=None, max_length=200)  # iCalendar LOCATION
    categories: str | None = Field(default=None, sa_column=Column(Text))  # iCalendar CATEGORIES
    classification: str | None = Field(default=None, max_length=20)  # iCalendar CLASS
    deadline: datetime | None = None  # 截止时间（旧字段，逐步废弃）
    start_time: datetime | None = None  # 开始时间
    end_time: datetime | None = None  # 结束时间
    dtstart: datetime | None = None  # iCalendar DTSTART
    dtend: datetime | None = None  # iCalendar DTEND
    due: datetime | None = None  # iCalendar DUE
    duration: str | None = Field(default=None, max_length=64)  # iCalendar DURATION (ISO 8601)
    time_zone: str | None = Field(default=None, max_length=64)  # 时区（IANA）
    tzid: str | None = Field(default=None, max_length=64)  # iCalendar TZID
    is_all_day: bool = Field(default=False)  # 是否全天
    dtstamp: datetime | None = None  # iCalendar DTSTAMP
    created: datetime | None = None  # iCalendar CREATED
    last_modified: datetime | None = None  # iCalendar LAST-MODIFIED
    sequence: int = Field(default=0)  # iCalendar SEQUENCE
    rdate: str | None = Field(default=None, sa_column=Column(Text))  # iCalendar RDATE
    exdate: str | None = Field(default=None, sa_column=Column(Text))  # iCalendar EXDATE
    recurrence_id: datetime | None = None  # iCalendar RECURRENCE-ID
    related_to_uid: str | None = Field(default=None, max_length=64)  # iCalendar RELATED-TO UID
    related_to_reltype: str | None = Field(
        default=None, max_length=20
    )  # iCalendar RELATED-TO RELTYPE
    ical_status: str | None = Field(default=None, max_length=20)  # iCalendar STATUS
    reminder_offsets: str | None = Field(
        default=None, sa_column=Column(Text)
    )  # 提醒偏移列表（分钟）
    status: str = Field(default="active", max_length=20)  # active/completed/canceled
    priority: str = Field(default="none", max_length=20)  # high/medium/low/none
    completed_at: datetime | None = None  # 完成时间（iCalendar COMPLETED）
    percent_complete: int = Field(default=0, ge=0, le=100)  # 完成百分比（PERCENT-COMPLETE）
    rrule: str | None = Field(default=None, max_length=500)  # iCalendar RRULE
    order: int = 0  # 同级待办之间的展示排序
    related_activities: str | None = Field(
        default=None, sa_column=Column(Text)
    )  # 关联活动ID的JSON数组
    sync_status: str = Field(default="pending", max_length=20)  # pending/synced/conflict
    cloud_version: int = Field(default=0)

    def __repr__(self):
        return f"<Todo(id={self.id}, name={self.name}, status={self.status})>"


class AutomationTask(TimestampMixin, table=True):
    """用户自定义自动化任务"""

    __tablename__: ClassVar[str] = "automation_tasks"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=200)
    description: str | None = Field(default=None, sa_column=Column(Text))
    enabled: bool = Field(default=True)
    schedule_type: str = Field(max_length=20)
    schedule_config: str | None = Field(default=None, sa_column=Column(Text))
    action_type: str = Field(max_length=50)
    action_payload: str | None = Field(default=None, sa_column=Column(Text))
    last_run_at: datetime | None = None
    last_status: str | None = Field(default=None, max_length=20)
    last_error: str | None = Field(default=None, sa_column=Column(Text))
    last_output: str | None = Field(default=None, sa_column=Column(Text))

    def __repr__(self):
        return f"<AutomationTask(id={self.id}, name={self.name}, enabled={self.enabled})>"


class Attachment(TimestampMixin, table=True):
    """附件信息模型"""

    __tablename__: ClassVar[str] = "attachments"

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

    __tablename__: ClassVar[str] = "todo_attachment_relations"

    id: int | None = Field(default=None, primary_key=True)
    todo_id: int  # 关联的待办ID
    attachment_id: int  # 关联的附件ID
    source: str = Field(default="user", max_length=20)  # user/ai
    created_at: datetime = Field(default_factory=get_utc_time)
    deleted_at: datetime | None = None

    def __repr__(self):
        return f"<TodoAttachmentRelation(id={self.id}, todo_id={self.todo_id})>"


class Tag(SQLModel, table=True):
    """标签模型"""

    __tablename__: ClassVar[str] = "tags"

    id: int | None = Field(default=None, primary_key=True)
    tag_name: str = Field(max_length=50, unique=True)  # 标签名称
    created_at: datetime = Field(default_factory=get_utc_time)
    deleted_at: datetime | None = None

    def __repr__(self):
        return f"<Tag(id={self.id}, name={self.tag_name})>"


class TodoTagRelation(SQLModel, table=True):
    """待办与标签的多对多关联关系"""

    __tablename__: ClassVar[str] = "todo_tag_relations"

    id: int | None = Field(default=None, primary_key=True)
    todo_id: int  # 关联的待办ID
    tag_id: int  # 关联的标签ID
    created_at: datetime = Field(default_factory=get_utc_time)
    deleted_at: datetime | None = None

    def __repr__(self):
        return f"<TodoTagRelation(id={self.id}, todo_id={self.todo_id}, tag_id={self.tag_id})>"


class Journal(TimestampMixin, table=True):
    """日记模型"""

    __tablename__: ClassVar[str] = "journals"

    id: int | None = Field(default=None, primary_key=True)
    uid: str = Field(
        default_factory=lambda: str(uuid4()), max_length=64, index=True
    )  # iCalendar UID
    name: str = Field(max_length=200)  # 日记标题
    user_notes: str = Field(sa_column=Column(Text))  # 富文本内容
    date: datetime  # 日记日期
    content_format: str = Field(default="markdown", max_length=20)  # 内容格式
    content_objective: str | None = Field(default=None, sa_column=Column(Text))  # 客观记录
    content_ai: str | None = Field(default=None, sa_column=Column(Text))  # AI 视角
    mood: str | None = Field(default=None, max_length=50)  # 情绪
    energy: int | None = None  # 精力
    day_bucket_start: datetime | None = None  # 日记归属的刷新点时间

    def __repr__(self):
        return f"<Journal(id={self.id}, name={self.name}, date={self.date})>"


class JournalTagRelation(SQLModel, table=True):
    """日记与标签的多对多关联关系"""

    __tablename__: ClassVar[str] = "journal_tag_relations"

    id: int | None = Field(default=None, primary_key=True)
    journal_id: int  # 关联的日记ID
    tag_id: int  # 关联的标签ID
    created_at: datetime = Field(default_factory=get_utc_time)
    deleted_at: datetime | None = None

    def __repr__(self):
        return f"<JournalTagRelation(id={self.id}, journal_id={self.journal_id}, tag_id={self.tag_id})>"


class JournalTodoRelation(SQLModel, table=True):
    """日记与待办的关联关系"""

    __tablename__: ClassVar[str] = "journal_todo_relations"

    id: int | None = Field(default=None, primary_key=True)
    journal_id: int  # 关联的日记ID
    todo_id: int  # 关联的待办ID
    created_at: datetime = Field(default_factory=get_utc_time)
    deleted_at: datetime | None = None

    def __repr__(self):
        return f"<JournalTodoRelation(id={self.id}, journal_id={self.journal_id}, todo_id={self.todo_id})>"


class JournalActivityRelation(SQLModel, table=True):
    """日记与活动的关联关系"""

    __tablename__: ClassVar[str] = "journal_activity_relations"

    id: int | None = Field(default=None, primary_key=True)
    journal_id: int  # 关联的日记ID
    activity_id: int  # 关联的活动ID
    created_at: datetime = Field(default_factory=get_utc_time)
    deleted_at: datetime | None = None

    def __repr__(self):
        return (
            f"<JournalActivityRelation(id={self.id}, journal_id={self.journal_id}, "
            f"activity_id={self.activity_id})>"
        )


class Chat(TimestampMixin, table=True):
    """聊天会话模型"""

    __tablename__: ClassVar[str] = "chats"

    id: int | None = Field(default=None, primary_key=True)
    session_id: str = Field(max_length=100, unique=True)  # 会话ID
    chat_type: str | None = Field(default=None, max_length=50)  # 聊天类型
    title: str | None = Field(default=None, max_length=200)  # 会话标题
    context_id: int | None = None  # 关联的上下文ID
    extra_data: str | None = Field(default=None, sa_column=Column(Text))  # 额外数据（JSON格式）
    context: str | None = Field(default=None, sa_column=Column(Text))  # 会话上下文（JSON格式）
    last_message_at: datetime | None = None  # 最后一条消息的时间
    sync_status: str = Field(default="pending", max_length=20)  # pending/synced/conflict
    cloud_version: int = Field(default=0)

    def __repr__(self):
        return f"<Chat(id={self.id}, session_id={self.session_id}, type={self.chat_type})>"


class Message(TimestampMixin, table=True):
    """消息模型"""

    __tablename__: ClassVar[str] = "messages"

    id: int | None = Field(default=None, primary_key=True)
    uid: str = Field(
        default_factory=lambda: str(uuid4()), max_length=64, index=True
    )  # 跨设备唯一标识
    chat_id: int  # 关联的聊天会话ID
    role: str = Field(max_length=20)  # 消息角色：user, assistant, system
    content: str = Field(sa_column=Column(Text))  # 消息内容
    token_count: int | None = None  # token数量
    model: str | None = Field(default=None, max_length=100)  # 使用的模型名称
    extra_data: str | None = Field(default=None, sa_column=Column(Text))  # 额外数据
    sync_status: str = Field(default="pending", max_length=20)  # pending/synced/conflict
    cloud_version: int = Field(default=0)

    def __repr__(self):
        return f"<Message(id={self.id}, chat_id={self.chat_id}, role={self.role})>"


class TokenUsage(TimestampMixin, table=True):
    """Token使用量记录模型"""

    __tablename__: ClassVar[str] = "token_usage"

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

    __tablename__: ClassVar[str] = "activities"

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

    __tablename__: ClassVar[str] = "activity_event_relations"

    id: int | None = Field(default=None, primary_key=True)
    activity_id: int  # 关联的活动ID
    event_id: int  # 关联的事件ID
    created_at: datetime = Field(default_factory=get_utc_time)
    deleted_at: datetime | None = None  # 软删除时间戳

    def __repr__(self):
        return f"<ActivityEventRelation(id={self.id}, activity_id={self.activity_id})>"


class AudioRecording(TimestampMixin, table=True):
    """音频录制记录模型"""

    __tablename__: ClassVar[str] = "audio_recordings"

    id: int | None = Field(default=None, primary_key=True)
    file_path: str = Field(max_length=500)  # 音频文件路径
    file_size: int  # 文件大小（字节）
    duration: float  # 录音时长（秒）
    start_time: datetime = Field(default_factory=get_utc_time)  # 开始时间
    end_time: datetime | None = None  # 结束时间
    status: str = Field(default="recording", max_length=20)  # 状态：recording, completed, failed
    is_24x7: bool = False  # 是否为7x24小时录制
    is_transcribed: bool = False  # 是否已完成转录
    is_extracted: bool = False  # 是否已完成待办/日程提取
    is_summarized: bool = False  # 是否已完成摘要
    is_full_audio: bool = False  # 是否为完整音频
    is_segment_audio: bool = False  # 是否为分段音频（用于句子级回放/定位）
    transcription_status: str = Field(
        default="pending", max_length=20
    )  # 转录状态：pending, processing, completed, failed

    def __repr__(self):
        return f"<AudioRecording(id={self.id}, duration={self.duration}s)>"


class Transcription(TimestampMixin, table=True):
    """转录文本模型"""

    __tablename__: ClassVar[str] = "transcriptions"

    id: int | None = Field(default=None, primary_key=True)
    audio_recording_id: int  # 关联音频录制ID
    original_text: str | None = Field(default=None, sa_column=Column(Text))  # 原始转录文本
    optimized_text: str | None = Field(default=None, sa_column=Column(Text))  # 优化后的文本
    extraction_status: str = Field(
        default="pending", max_length=20
    )  # 提取状态：pending, processing, completed, failed
    extracted_todos: str | None = Field(
        default=None, sa_column=Column(Text)
    )  # 从原文提取的待办事项（JSON格式）
    extracted_schedules: str | None = Field(
        default=None, sa_column=Column(Text)
    )  # 从原文提取的日程安排（JSON格式）
    extracted_todos_optimized: str | None = Field(
        default=None, sa_column=Column(Text)
    )  # 从优化文本提取的待办事项（JSON格式）
    extracted_schedules_optimized: str | None = Field(
        default=None, sa_column=Column(Text)
    )  # 从优化文本提取的日程安排（JSON格式）
    segment_timestamps: str | None = Field(
        default=None, sa_column=Column(Text)
    )  # 每段文本的精确时间戳（JSON格式，单位：秒，相对于录音开始时间）
    speaker_segments: str | None = Field(
        default=None, sa_column=Column(Text)
    )  # 每句话的说话人标注（JSON格式）: [{"speaker_id":1,"speaker_name":"...","text":"..."}]

    def __repr__(self):
        return f"<Transcription(id={self.id}, audio_recording_id={self.audio_recording_id})>"


class SpeakerProfile(TimestampMixin, table=True):
    """说话人档案模型"""

    __tablename__: ClassVar[str] = "speaker_profiles"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    description: str | None = Field(default=None, max_length=500)
    sample_count: int = Field(default=0)
    is_active: bool = Field(default=True)
    is_me: bool = Field(default=False)

    def __repr__(self):
        return f"<SpeakerProfile(id={self.id}, name={self.name}, is_me={self.is_me})>"


class SpeakerVoiceprint(TimestampMixin, table=True):
    """声纹特征向量模型"""

    __tablename__: ClassVar[str] = "speaker_voiceprints"

    id: int | None = Field(default=None, primary_key=True)
    speaker_profile_id: int = Field(index=True)
    embedding: str = Field(sa_column=Column(Text))
    embedding_dim: int = Field(default=192)
    audio_duration: float = Field(default=0.0)
    quality_score: float = Field(default=0.0)

    def __repr__(self):
        return f"<SpeakerVoiceprint(id={self.id}, speaker_profile_id={self.speaker_profile_id})>"


# ========== Agent 执行计划模型 ==========


class AgentPlan(TimestampMixin, table=True):
    """Agent 执行计划模型"""

    __tablename__: ClassVar[str] = "agent_plans"

    plan_id: str = Field(primary_key=True, max_length=64)
    title: str = Field(max_length=200)
    spec_json: str = Field(sa_column=Column(Text))
    todo_id: int | None = None
    session_id: str | None = Field(default=None, max_length=100)

    def __repr__(self):
        return f"<AgentPlan(plan_id={self.plan_id}, title={self.title})>"


class AgentPlanRun(TimestampMixin, table=True):
    """Agent 执行计划运行记录"""

    __tablename__: ClassVar[str] = "agent_plan_runs"

    run_id: str = Field(primary_key=True, max_length=64)
    plan_id: str = Field(max_length=64, index=True)
    status: str = Field(default="pending", max_length=20)
    session_id: str | None = Field(default=None, max_length=100)
    error: str | None = Field(default=None, sa_column=Column(Text))
    rollback_status: str | None = Field(default=None, max_length=20)
    rollback_error: str | None = Field(default=None, sa_column=Column(Text))
    started_at: datetime | None = None
    ended_at: datetime | None = None
    cancel_requested: bool = Field(default=False)

    def __repr__(self):
        return f"<AgentPlanRun(run_id={self.run_id}, plan_id={self.plan_id}, status={self.status})>"


class AgentPlanStep(TimestampMixin, table=True):
    """Agent 执行计划步骤记录"""

    __tablename__: ClassVar[str] = "agent_plan_steps"

    id: int | None = Field(default=None, primary_key=True)
    run_id: str = Field(max_length=64, index=True)
    step_id: str = Field(max_length=64)
    step_name: str = Field(max_length=200)
    status: str = Field(default="pending", max_length=20)
    retry_count: int = Field(default=0)
    input_json: str | None = Field(default=None, sa_column=Column(Text))
    output_json: str | None = Field(default=None, sa_column=Column(Text))
    error: str | None = Field(default=None, sa_column=Column(Text))
    started_at: datetime | None = None
    ended_at: datetime | None = None
    is_side_effect: bool = Field(default=False)
    rollback_required: bool = Field(default=False)

    def __repr__(self):
        return (
            f"<AgentPlanStep(run_id={self.run_id}, step_id={self.step_id}, status={self.status})>"
        )


class AgentPlanJournal(TimestampMixin, table=True):
    """Agent 执行计划回滚日志"""

    __tablename__: ClassVar[str] = "agent_plan_journals"

    journal_id: str = Field(primary_key=True, max_length=64)
    run_id: str = Field(max_length=64, index=True)
    step_id: str = Field(max_length=64)
    op_type: str = Field(max_length=20)
    target_path: str | None = Field(default=None, max_length=500)
    backup_path: str | None = Field(default=None, max_length=500)
    trash_path: str | None = Field(default=None, max_length=500)
    from_path: str | None = Field(default=None, max_length=500)
    to_path: str | None = Field(default=None, max_length=500)
    created_paths_json: str | None = Field(default=None, sa_column=Column(Text))
    status: str = Field(default="applied", max_length=20)
    error: str | None = Field(default=None, sa_column=Column(Text))

    def __repr__(self):
        return f"<AgentPlanJournal(journal_id={self.journal_id}, op_type={self.op_type})>"


class LocationRecord(TimestampMixin, table=True):
    """GPS 位置记录模型"""

    __tablename__: ClassVar[str] = "location_records"

    id: int | None = Field(default=None, primary_key=True)
    timestamp: datetime = Field(index=True)
    latitude: float
    longitude: float
    altitude: float | None = None
    accuracy: float | None = None
    speed: float | None = None
    heading: float | None = None
    source: str = Field(default="mobile_gps", max_length=32)

    def __repr__(self):
        return f"<LocationRecord(id={self.id}, lat={self.latitude}, lon={self.longitude})>"


# ========== 用户系统模型 ==========


class UserType(StrEnum):
    USER = "user"
    ADMIN = "admin"


class AuthMode(StrEnum):
    LOCAL = "local"
    CLOUD = "cloud"


class MembershipType(StrEnum):
    FREE = "free"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class User(TimestampMixin, table=True):
    """用户模型 — 支持本地模式和云端模式"""

    __tablename__: ClassVar[str] = "users"

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    username: str = Field(index=True, max_length=100)
    phone: str | None = Field(default=None, index=True, max_length=20)
    password_hash: str | None = Field(default=None, max_length=256)
    user_type: str = Field(default=UserType.USER, max_length=20)
    auth_mode: str = Field(default=AuthMode.LOCAL, max_length=20)
    cloud_user_id: str | None = Field(default=None, max_length=100)
    avatar_key: str | None = Field(default=None, max_length=500)
    is_dev: bool = Field(default=False)
    last_login_at: datetime | None = Field(default=None)
    is_deleted: bool = Field(default=False)


class MembershipPlan(TimestampMixin, table=True):
    """会员计划模型"""

    __tablename__: ClassVar[str] = "membership_plans"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=50)
    type: str = Field(max_length=20, index=True)
    project_limit: int = Field(default=10)
    note_limit: int = Field(default=50)
    initial_credits: int = Field(default=0)
    daily_refresh_credits: int = Field(default=0)
    price: float = Field(default=0.0)
    currency: str = Field(default="CNY", max_length=10)
    duration_days: int = Field(default=365)
    is_active: bool = Field(default=True)
    description: str | None = Field(default=None, sa_column=Column(Text))
    is_deleted: bool = Field(default=False)


class UserMembership(TimestampMixin, table=True):
    """用户会员关系模型"""

    __tablename__: ClassVar[str] = "user_memberships"

    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(index=True, max_length=100)
    membership_plan_id: int = Field(index=True)
    start_date: datetime = Field(default_factory=get_utc_time)
    end_date: datetime = Field(default_factory=get_utc_time)
    is_active: bool = Field(default=True, index=True)
    total_chat_count: int = Field(default=0)
    daily_credits: int = Field(default=0)
    permanent_credits: int = Field(default=0)
    daily_credits_consumed: int = Field(default=0)
    total_credits_consumed: int = Field(default=0)
    total_credits_purchased: int = Field(default=0)
    last_reset_date: datetime = Field(default_factory=get_utc_time)
    last_credit_refresh_date: datetime = Field(default_factory=get_utc_time)
    is_deleted: bool = Field(default=False)


# 为兼容旧代码，保留 Base 引用（指向 SQLModel.metadata）
# 这样现有的 Base.metadata.create_all() 调用仍然有效
Base = SQLModel
