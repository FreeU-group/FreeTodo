"""任务管理相关的 Pydantic 模型"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    """任务状态枚举"""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class TaskCreate(BaseModel):
    """创建任务请求模型"""

    name: str = Field(..., min_length=1, max_length=200, description="任务名称")
    description: str | None = Field(None, description="任务描述")
    status: TaskStatus = Field(TaskStatus.PENDING, description="任务状态")


class TaskUpdate(BaseModel):
    """更新任务请求模型"""

    name: str | None = Field(None, min_length=1, max_length=200, description="任务名称")
    description: str | None = Field(None, description="任务描述")
    status: TaskStatus | None = Field(None, description="任务状态")


class TaskResponse(BaseModel):
    """任务响应模型"""

    id: int = Field(..., description="任务ID")
    project_id: int = Field(..., description="项目ID")
    name: str = Field(..., description="任务名称")
    description: str | None = Field(None, description="任务描述")
    status: str = Field(..., description="任务状态")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    """任务列表响应模型"""

    total: int = Field(..., description="总数")
    tasks: list[TaskResponse] = Field(..., description="任务列表")


class TaskProgressCreate(BaseModel):
    """创建任务进展请求模型"""

    summary: str = Field(..., min_length=1, description="进展摘要内容")
    context_count: int = Field(0, ge=0, description="基于多少个上下文生成")


class TaskProgressResponse(BaseModel):
    """任务进展响应模型"""

    id: int = Field(..., description="进展记录ID")
    task_id: int = Field(..., description="任务ID")
    summary: str = Field(..., description="进展摘要内容")
    context_count: int = Field(..., description="基于多少个上下文生成")
    generated_at: datetime = Field(..., description="生成时间")
    created_at: datetime = Field(..., description="创建时间")

    class Config:
        from_attributes = True


class TaskProgressListResponse(BaseModel):
    """任务进展列表响应模型"""

    total: int = Field(..., description="总数")
    progress_list: list[TaskProgressResponse] = Field(..., description="进展记录列表")


class TaskBatchDeleteRequest(BaseModel):
    """批量删除任务请求模型"""

    task_ids: list[int] = Field(..., min_length=1, description="要删除的任务ID列表")


class TaskBatchDeleteResponse(BaseModel):
    """批量删除任务响应模型"""

    deleted_count: int = Field(..., description="成功删除的任务数量")
    failed_ids: list[int] = Field(default_factory=list, description="删除失败的任务ID")
    not_found_ids: list[int] = Field(default_factory=list, description="未找到的任务ID")
    wrong_project_ids: list[int] = Field(default_factory=list, description="不属于该项目的任务ID")
