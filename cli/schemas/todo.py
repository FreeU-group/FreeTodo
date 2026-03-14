"""待办事项（Todo）相关的 Pydantic 模型

说明：
- 该模块面向 free-todo-frontend 的 Todo 结构（支持 deadline/priority/tags/attachments 等）
- 数据库存储使用 lifetrace.storage.models 中的 Todo/Tag/Attachment 相关表
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class TodoStatus(str, Enum):
    """Todo 状态枚举（与前端保持一致）"""

    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELED = "canceled"
    DRAFT = "draft"


class TodoPriority(str, Enum):
    """Todo 优先级（与前端保持一致）"""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"


class TodoItemType(str, Enum):
    """iCalendar 条目类型"""

    VTODO = "VTODO"
    VEVENT = "VEVENT"


class TodoAttachmentResponse(BaseModel):
    """Todo 附件响应模型"""

    id: int = Field(..., description="附件ID")
    file_name: str = Field(..., description="文件名")
    file_path: str = Field(..., description="文件路径")
    file_size: int | None = Field(None, description="文件大小（字节）")
    mime_type: str | None = Field(None, description="MIME 类型")
    source: str | None = Field(None, description="来源(user/ai)")

    model_config = ConfigDict(from_attributes=True)


class TodoCreate(BaseModel):
    """创建 Todo 请求模型"""

    uid: str | None = Field(None, max_length=64, description="iCalendar UID")
    name: str = Field(..., min_length=1, max_length=200, description="待办名称")
    summary: str | None = Field(None, description="iCalendar SUMMARY")
    description: str | None = Field(None, description="描述")
    user_notes: str | None = Field(None, description="用户笔记")
    parent_todo_id: int | None = Field(None, description="父级待办ID")
    item_type: TodoItemType | None = Field(None, description="iCalendar 条目类型")
    location: str | None = Field(None, description="iCalendar LOCATION")
    categories: str | None = Field(None, description="iCalendar CATEGORIES")
    classification: str | None = Field(None, description="iCalendar CLASS")
    deadline: datetime | None = Field(None, description="截止时间（旧字段，逐步废弃）")
    start_time: datetime | None = Field(None, description="开始时间")
    end_time: datetime | None = Field(None, description="结束时间")
    dtstart: datetime | None = Field(None, description="iCalendar DTSTART")
    dtend: datetime | None = Field(None, description="iCalendar DTEND")
    due: datetime | None = Field(None, description="iCalendar DUE")
    duration: str | None = Field(None, description="iCalendar DURATION (ISO 8601)")
    time_zone: str | None = Field(None, description="时区（IANA）")
    tzid: str | None = Field(None, description="iCalendar TZID")
    is_all_day: bool | None = Field(None, description="是否全天")
    dtstamp: datetime | None = Field(None, description="iCalendar DTSTAMP")
    created: datetime | None = Field(None, description="iCalendar CREATED")
    last_modified: datetime | None = Field(None, description="iCalendar LAST-MODIFIED")
    sequence: int | None = Field(None, description="iCalendar SEQUENCE")
    rdate: str | None = Field(None, description="iCalendar RDATE")
    exdate: str | None = Field(None, description="iCalendar EXDATE")
    recurrence_id: datetime | None = Field(None, description="iCalendar RECURRENCE-ID")
    related_to_uid: str | None = Field(None, description="iCalendar RELATED-TO UID")
    related_to_reltype: str | None = Field(None, description="iCalendar RELATED-TO RELTYPE")
    ical_status: str | None = Field(None, description="iCalendar STATUS")
    reminder_offsets: list[int] | None = Field(
        None, description="提醒偏移列表（分钟，基于 dtstart/due）"
    )
    status: TodoStatus = Field(TodoStatus.ACTIVE, description="状态")
    priority: TodoPriority = Field(TodoPriority.NONE, description="优先级")
    completed_at: datetime | None = Field(None, description="完成时间")
    percent_complete: int | None = Field(None, ge=0, le=100, description="完成百分比（0-100）")
    rrule: str | None = Field(None, description="iCalendar RRULE")
    order: int = Field(0, description="同级待办之间的展示排序")
    tags: list[str] = Field(default_factory=list, description="标签名称列表")
    related_activities: list[int] = Field(default_factory=list, description="关联活动ID列表")


class TodoUpdate(BaseModel):
    """更新 Todo 请求模型（字段均可选）"""

    name: str | None = Field(None, min_length=1, max_length=200, description="待办名称")
    summary: str | None = Field(None, description="iCalendar SUMMARY")
    description: str | None = Field(None, description="描述")
    user_notes: str | None = Field(None, description="用户笔记")
    parent_todo_id: int | None = Field(None, description="父级待办ID（显式传 null 可清空）")
    item_type: TodoItemType | None = Field(None, description="iCalendar 条目类型")
    location: str | None = Field(None, description="iCalendar LOCATION")
    categories: str | None = Field(None, description="iCalendar CATEGORIES")
    classification: str | None = Field(None, description="iCalendar CLASS")
    deadline: datetime | None = Field(None, description="截止时间（旧字段，显式传 null 可清空）")
    start_time: datetime | None = Field(None, description="开始时间（显式传 null 可清空）")
    end_time: datetime | None = Field(None, description="结束时间（显式传 null 可清空）")
    dtstart: datetime | None = Field(None, description="iCalendar DTSTART（显式传 null 可清空）")
    dtend: datetime | None = Field(None, description="iCalendar DTEND（显式传 null 可清空）")
    due: datetime | None = Field(None, description="iCalendar DUE（显式传 null 可清空）")
    duration: str | None = Field(None, description="iCalendar DURATION（显式传 null 可清空）")
    time_zone: str | None = Field(None, description="时区（显式传 null 可清空）")
    tzid: str | None = Field(None, description="iCalendar TZID（显式传 null 可清空）")
    is_all_day: bool | None = Field(None, description="是否全天（显式传 null 可清空）")
    dtstamp: datetime | None = Field(None, description="iCalendar DTSTAMP（显式传 null 可清空）")
    created: datetime | None = Field(None, description="iCalendar CREATED（显式传 null 可清空）")
    last_modified: datetime | None = Field(
        None, description="iCalendar LAST-MODIFIED（显式传 null 可清空）"
    )
    sequence: int | None = Field(None, description="iCalendar SEQUENCE（显式传 null 可清空）")
    rdate: str | None = Field(None, description="iCalendar RDATE（显式传 null 可清空）")
    exdate: str | None = Field(None, description="iCalendar EXDATE（显式传 null 可清空）")
    recurrence_id: datetime | None = Field(
        None, description="iCalendar RECURRENCE-ID（显式传 null 可清空）"
    )
    related_to_uid: str | None = Field(
        None, description="iCalendar RELATED-TO UID（显式传 null 可清空）"
    )
    related_to_reltype: str | None = Field(
        None, description="iCalendar RELATED-TO RELTYPE（显式传 null 可清空）"
    )
    ical_status: str | None = Field(None, description="iCalendar STATUS（显式传 null 可清空）")
    reminder_offsets: list[int] | None = Field(
        None, description="提醒偏移列表（分钟，显式传 null 可回退默认）"
    )
    status: TodoStatus | None = Field(None, description="状态")
    priority: TodoPriority | None = Field(None, description="优先级")
    completed_at: datetime | None = Field(None, description="完成时间（显式传 null 可清空）")
    percent_complete: int | None = Field(None, ge=0, le=100, description="完成百分比（0-100）")
    rrule: str | None = Field(None, description="iCalendar RRULE（显式传 null 可清空）")
    order: int | None = Field(None, description="同级待办之间的展示排序")
    tags: list[str] | None = Field(None, description="标签名称列表（显式传空数组将清空）")
    related_activities: list[int] | None = Field(
        None, description="关联活动ID列表（显式传空数组将清空）"
    )


class TodoResponse(BaseModel):
    """Todo 响应模型"""

    id: int = Field(..., description="待办ID")
    uid: str = Field(..., description="iCalendar UID")
    name: str = Field(..., description="待办名称")
    summary: str | None = Field(None, description="iCalendar SUMMARY")
    description: str | None = Field(None, description="描述")
    user_notes: str | None = Field(None, description="用户笔记")
    parent_todo_id: int | None = Field(None, description="父级待办ID")
    item_type: str | None = Field(None, description="iCalendar 条目类型")
    location: str | None = Field(None, description="iCalendar LOCATION")
    categories: str | None = Field(None, description="iCalendar CATEGORIES")
    classification: str | None = Field(None, description="iCalendar CLASS")
    deadline: datetime | None = Field(None, description="截止时间（旧字段）")
    start_time: datetime | None = Field(None, description="开始时间")
    end_time: datetime | None = Field(None, description="结束时间")
    dtstart: datetime | None = Field(None, description="iCalendar DTSTART")
    dtend: datetime | None = Field(None, description="iCalendar DTEND")
    due: datetime | None = Field(None, description="iCalendar DUE")
    duration: str | None = Field(None, description="iCalendar DURATION")
    time_zone: str | None = Field(None, description="时区（IANA）")
    tzid: str | None = Field(None, description="iCalendar TZID")
    is_all_day: bool = Field(False, description="是否全天")
    dtstamp: datetime | None = Field(None, description="iCalendar DTSTAMP")
    created: datetime | None = Field(None, description="iCalendar CREATED")
    last_modified: datetime | None = Field(None, description="iCalendar LAST-MODIFIED")
    sequence: int | None = Field(None, description="iCalendar SEQUENCE")
    rdate: str | None = Field(None, description="iCalendar RDATE")
    exdate: str | None = Field(None, description="iCalendar EXDATE")
    recurrence_id: datetime | None = Field(None, description="iCalendar RECURRENCE-ID")
    related_to_uid: str | None = Field(None, description="iCalendar RELATED-TO UID")
    related_to_reltype: str | None = Field(None, description="iCalendar RELATED-TO RELTYPE")
    ical_status: str | None = Field(None, description="iCalendar STATUS")
    reminder_offsets: list[int] | None = Field(
        None, description="提醒偏移列表（分钟，基于 dtstart/due）"
    )
    status: str = Field(..., description="状态")
    priority: str = Field(..., description="优先级")
    completed_at: datetime | None = Field(None, description="完成时间")
    percent_complete: int = Field(0, description="完成百分比（0-100）")
    rrule: str | None = Field(None, description="iCalendar RRULE")
    order: int = Field(0, description="同级待办之间的展示排序")
    tags: list[str] = Field(default_factory=list, description="标签名称列表")
    attachments: list[TodoAttachmentResponse] = Field(default_factory=list, description="附件列表")
    related_activities: list[int] = Field(default_factory=list, description="关联活动ID列表")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")

    model_config = ConfigDict(from_attributes=True)


class TodoListResponse(BaseModel):
    """Todo 列表响应模型"""

    total: int = Field(..., description="总数")
    todos: list[TodoResponse] = Field(..., description="待办列表")


class TodoReorderItem(BaseModel):
    """单个待办排序项"""

    id: int = Field(..., description="待办ID")
    order: int = Field(..., description="新的排序值")
    parent_todo_id: int | None = Field(None, description="父级待办ID（可选，用于设置父子关系）")


class TodoReorderRequest(BaseModel):
    """批量重排序请求模型"""

    items: list[TodoReorderItem] = Field(..., description="待排序的待办列表")
