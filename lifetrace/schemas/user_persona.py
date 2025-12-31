"""用户画像相关的 Pydantic 模型"""

from datetime import datetime

from pydantic import BaseModel, Field


class UserPersonaUpdate(BaseModel):
    """更新用户画像请求模型"""

    nickname: str | None = Field(None, min_length=1, max_length=50, description="用户昵称")
    description: str | None = Field(None, description="用户描述/简介")


class UserPersonaResponse(BaseModel):
    """用户画像响应模型"""

    id: int = Field(..., description="用户画像ID")
    nickname: str = Field(..., description="用户昵称")
    description: str | None = Field(None, description="用户描述/简介")
    last_updated: datetime = Field(..., description="最后更新时间")

    class Config:
        from_attributes = True
