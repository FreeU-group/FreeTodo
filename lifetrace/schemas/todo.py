"""待办事项（Todo）相关的 Pydantic 模型

说明：
- 该模块面向 free-todo-frontend 的 Todo 结构（支持 deadline/priority/tags/attachments 等）
- 数据库存储使用 lifetrace.storage.models 中的 Todo/Tag/Attachment 相关表
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


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


class TodoAttachmentResponse(BaseModel):
    """Todo 附件响应模型"""

    id: int = Field(..., description="附件ID")
    file_name: str = Field(..., description="文件名")
    file_path: str = Field(..., description="文件路径")
    file_size: int | None = Field(None, description="文件大小（字节）")
    mime_type: str | None = Field(None, description="MIME 类型")

    class Config:
        from_attributes = True


class TodoCreate(BaseModel):
    """创建 Todo 请求模型"""

    name: str = Field(..., min_length=1, max_length=200, description="待办名称")
    description: str | None = Field(None, description="描述")
    user_notes: str | None = Field(None, description="用户笔记")
    parent_todo_id: int | None = Field(None, description="父级待办ID")
    deadline: datetime | None = Field(None, description="截止时间")
    status: TodoStatus = Field(TodoStatus.ACTIVE, description="状态")
    priority: TodoPriority = Field(TodoPriority.NONE, description="优先级")
    tags: list[str] = Field(default_factory=list, description="标签名称列表")
    related_activities: list[int] = Field(default_factory=list, description="关联活动ID列表")


class TodoUpdate(BaseModel):
    """更新 Todo 请求模型（字段均可选）"""

    name: str | None = Field(None, min_length=1, max_length=200, description="待办名称")
    description: str | None = Field(None, description="描述")
    user_notes: str | None = Field(None, description="用户笔记")
    parent_todo_id: int | None = Field(None, description="父级待办ID（显式传 null 可清空）")
    deadline: datetime | None = Field(None, description="截止时间（显式传 null 可清空）")
    status: TodoStatus | None = Field(None, description="状态")
    priority: TodoPriority | None = Field(None, description="优先级")
    tags: list[str] | None = Field(None, description="标签名称列表（显式传空数组将清空）")
    related_activities: list[int] | None = Field(
        None, description="关联活动ID列表（显式传空数组将清空）"
    )


class TodoResponse(BaseModel):
    """Todo 响应模型"""

    id: int = Field(..., description="待办ID")
    name: str = Field(..., description="待办名称")
    description: str | None = Field(None, description="描述")
    user_notes: str | None = Field(None, description="用户笔记")
    parent_todo_id: int | None = Field(None, description="父级待办ID")
    deadline: datetime | None = Field(None, description="截止时间")
    status: str = Field(..., description="状态")
    priority: str = Field(..., description="优先级")
    tags: list[str] = Field(default_factory=list, description="标签名称列表")
    attachments: list[TodoAttachmentResponse] = Field(default_factory=list, description="附件列表")
    related_activities: list[int] = Field(default_factory=list, description="关联活动ID列表")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")

    class Config:
        from_attributes = True


class TodoListResponse(BaseModel):
    """Todo 列表响应模型"""

    total: int = Field(..., description="总数")
    todos: list[TodoResponse] = Field(..., description="待办列表")
