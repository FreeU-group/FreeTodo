"""悬浮窗截图提取待办相关的 Pydantic 模型"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class FloatingCaptureRequest(BaseModel):
    """悬浮窗截图请求模型"""

    image_base64: str = Field(
        ..., description="Base64 编码的截图数据（不含 data:image/png;base64, 前缀）"
    )
    create_todos: bool = Field(False, description="是否自动创建待办（draft 状态）")


class ExtractedTodo(BaseModel):
    """提取的待办项"""

    title: str = Field(..., description="待办标题")
    description: str | None = Field(None, description="待办描述")
    time_info: dict[str, Any] | None = Field(None, description="时间信息")
    source_text: str | None = Field(None, description="来源文本")
    confidence: float = Field(0.5, description="置信度", ge=0.0, le=1.0)


class CreatedTodo(BaseModel):
    """创建的待办项"""

    id: int = Field(..., description="待办 ID")
    name: str = Field(..., description="待办名称")
    scheduled_time: str | None = Field(None, description="计划时间")


class FloatingCaptureResponse(BaseModel):
    """悬浮窗截图响应模型"""

    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理消息")
    extracted_todos: list[ExtractedTodo] = Field(default_factory=list, description="提取的待办列表")
    created_todos: list[CreatedTodo] = Field(default_factory=list, description="创建的待办列表")
    created_count: int = Field(0, description="创建的待办数量")
    timestamp: datetime = Field(default_factory=datetime.now, description="响应时间戳")
