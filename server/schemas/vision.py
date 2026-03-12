"""视觉多模态相关的 Pydantic 模型"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class VisionChatRequest(BaseModel):
    """视觉多模态聊天请求模型"""

    screenshot_ids: list[int] = Field(..., description="截图ID列表，至少包含一个截图ID")
    prompt: str = Field(..., description="文本提示词", min_length=1)
    model: str | None = Field(None, description="视觉模型名称，如果不提供则使用配置中的默认模型")
    temperature: float | None = Field(
        None, description="温度参数，控制输出的随机性", ge=0.0, le=2.0
    )
    max_tokens: int | None = Field(None, description="最大生成token数")


class VisionChatResponse(BaseModel):
    """视觉多模态聊天响应模型"""

    response: str = Field(..., description="模型生成的响应文本")
    timestamp: datetime = Field(default_factory=datetime.now, description="响应时间戳")
    usage_info: dict[str, Any] | None = Field(None, description="Token使用信息")
    model: str | None = Field(None, description="实际使用的模型名称")
    screenshot_count: int = Field(..., description="实际处理的截图数量")
