"""日记相关的 Pydantic 模型"""

from datetime import datetime

from pydantic import BaseModel, Field


class JournalTag(BaseModel):
    """日记关联的标签"""

    id: int = Field(..., description="标签ID")
    tag_name: str = Field(..., description="标签名称")


class JournalCreate(BaseModel):
    """创建日记请求模型"""

    name: str = Field(..., min_length=1, max_length=200, description="日记标题")
    user_notes: str = Field(..., description="日记内容（富文本）")
    date: datetime = Field(..., description="日记日期")
    content_format: str = Field(
        "markdown", max_length=20, description="内容格式：markdown/html/json"
    )
    tag_ids: list[int] = Field(default_factory=list, description="关联的标签ID列表")


class JournalUpdate(BaseModel):
    """更新日记请求模型"""

    name: str | None = Field(None, min_length=1, max_length=200, description="日记标题")
    user_notes: str | None = Field(None, description="日记内容（富文本）")
    date: datetime | None = Field(None, description="日记日期")
    content_format: str | None = Field(
        None, max_length=20, description="内容格式：markdown/html/json"
    )
    tag_ids: list[int] | None = Field(None, description="关联的标签ID列表（覆盖替换）")


class JournalResponse(BaseModel):
    """日记响应模型"""

    id: int = Field(..., description="日记ID")
    name: str = Field(..., description="日记标题")
    user_notes: str = Field(..., description="日记内容（富文本）")
    date: datetime = Field(..., description="日记日期")
    content_format: str = Field(..., description="内容格式")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    deleted_at: datetime | None = Field(None, description="删除时间")
    tags: list[JournalTag] = Field(default_factory=list, description="关联标签列表")

    class Config:
        from_attributes = True


class JournalListResponse(BaseModel):
    """日记列表响应模型"""

    total: int = Field(..., description="总数")
    journals: list[JournalResponse] = Field(..., description="日记列表")
