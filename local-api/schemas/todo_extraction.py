"""待办提取相关的 Pydantic 模型"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class TodoTimeInfo(BaseModel):
    """待办时间信息结构"""

    time_type: Literal["relative", "absolute"] = Field(
        ..., description="时间类型：relative（相对时间）或 absolute（绝对时间）"
    )
    # 相对时间字段
    relative_days: int | None = Field(
        None, description="相对天数（0=今天，1=明天，2=后天，-1=昨天）"
    )
    relative_time: str | None = Field(
        None, description="相对时间点，24小时制格式（如：'13:00', '15:30'）"
    )
    # 绝对时间字段
    absolute_time: datetime | None = Field(
        None, description="绝对时间（ISO 8601格式），仅在time_type为absolute时使用"
    )
    # 原始文本
    raw_text: str = Field(..., description="原始时间文本，用于验证和调试")


class ExtractedTodo(BaseModel):
    """提取的待办项结构"""

    title: str = Field(..., description="待办标题", min_length=1, max_length=100)
    description: str | None = Field(None, description="待办描述（可选）", max_length=500)
    time_info: TodoTimeInfo = Field(..., description="时间信息")
    scheduled_time: datetime | None = Field(None, description="解析后的绝对时间（程序计算得出）")
    source_text: str = Field(..., description="来源文本片段，用于验证")
    confidence: float | None = Field(None, description="置信度（0.0-1.0），可选", ge=0.0, le=1.0)
    screenshot_ids: list[int] = Field(default_factory=list, description="相关的截图ID列表")


class TodoExtractionRequest(BaseModel):
    """待办提取请求模型"""

    event_id: int = Field(..., description="事件ID", gt=0)
    screenshot_sample_ratio: int | None = Field(
        None, description="截图采样比例（每N张选1张），默认3", ge=1, le=10
    )


class TodoExtractionResponse(BaseModel):
    """待办提取响应模型"""

    event_id: int = Field(..., description="事件ID")
    app_name: str | None = Field(None, description="应用名称")
    window_title: str | None = Field(None, description="窗口标题")
    event_start_time: datetime | None = Field(None, description="事件开始时间")
    event_end_time: datetime | None = Field(None, description="事件结束时间")
    todos: list[ExtractedTodo] = Field(default_factory=list, description="提取的待办列表")
    extraction_timestamp: datetime = Field(default_factory=datetime.now, description="提取时间戳")
    screenshot_count: int = Field(0, description="实际分析的截图数量")
    error_message: str | None = Field(None, description="错误信息（如果有）")
