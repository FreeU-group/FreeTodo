"""上下文管理相关的 Pydantic 模型"""

from datetime import datetime

from pydantic import BaseModel, Field


class ContextResponse(BaseModel):
    """上下文响应模型"""

    id: int = Field(..., description="上下文ID")
    app_name: str | None = Field(None, description="应用名称")
    window_title: str | None = Field(None, description="窗口标题")
    start_time: datetime | None = Field(None, description="开始时间")
    end_time: datetime | None = Field(None, description="结束时间")
    ai_title: str | None = Field(None, description="AI生成的标题")
    ai_summary: str | None = Field(None, description="AI生成的摘要")
    task_id: int | None = Field(None, description="关联的任务ID")
    created_at: datetime | None = Field(None, description="创建时间")

    class Config:
        from_attributes = True


class ContextListResponse(BaseModel):
    """上下文列表响应模型"""

    total: int = Field(..., description="总数")
    contexts: list[ContextResponse] = Field(..., description="上下文列表")


class ContextUpdateRequest(BaseModel):
    """上下文更新请求模型"""

    task_id: int | None = Field(None, description="关联的任务ID（null表示解除关联）")
