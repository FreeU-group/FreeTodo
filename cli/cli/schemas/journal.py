"""日记相关的 Pydantic 模型"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class JournalTag(BaseModel):
    """日记关联的标签"""

    id: int = Field(..., description="标签ID")
    tag_name: str = Field(..., description="标签名称")


class JournalCreate(BaseModel):
    """创建日记请求模型"""

    uid: str | None = Field(None, max_length=64, description="iCalendar UID")
    name: str | None = Field(None, max_length=200, description="日记标题")
    user_notes: str = Field(..., description="日记内容（富文本）")
    date: datetime = Field(..., description="日记日期")
    content_format: str = Field(
        "markdown", max_length=20, description="内容格式：markdown/html/json"
    )
    content_objective: str | None = Field(None, description="客观记录")
    content_ai: str | None = Field(None, description="AI 视角")
    mood: str | None = Field(None, max_length=50, description="情绪")
    energy: int | None = Field(None, ge=0, le=10, description="精力")
    day_bucket_start: datetime | None = Field(None, description="日记归属刷新点")
    tags: list[str] = Field(default_factory=list, description="关联的标签列表")
    related_todo_ids: list[int] = Field(default_factory=list, description="关联待办ID列表")
    related_activity_ids: list[int] = Field(default_factory=list, description="关联活动ID列表")


class JournalUpdate(BaseModel):
    """更新日记请求模型"""

    name: str | None = Field(None, max_length=200, description="日记标题")
    user_notes: str | None = Field(None, description="日记内容（富文本）")
    date: datetime | None = Field(None, description="日记日期")
    content_format: str | None = Field(
        None, max_length=20, description="内容格式：markdown/html/json"
    )
    content_objective: str | None = Field(None, description="客观记录")
    content_ai: str | None = Field(None, description="AI 视角")
    mood: str | None = Field(None, max_length=50, description="情绪")
    energy: int | None = Field(None, ge=0, le=10, description="精力")
    day_bucket_start: datetime | None = Field(None, description="日记归属刷新点")
    tags: list[str] | None = Field(None, description="关联的标签列表（覆盖替换）")
    related_todo_ids: list[int] | None = Field(None, description="关联待办ID列表")
    related_activity_ids: list[int] | None = Field(None, description="关联活动ID列表")


class JournalResponse(BaseModel):
    """日记响应模型"""

    id: int = Field(..., description="日记ID")
    uid: str = Field(..., description="iCalendar UID")
    name: str = Field(..., description="日记标题")
    user_notes: str = Field(..., description="日记内容（富文本）")
    date: datetime = Field(..., description="日记日期")
    content_format: str = Field(..., description="内容格式")
    content_objective: str | None = Field(None, description="客观记录")
    content_ai: str | None = Field(None, description="AI 视角")
    mood: str | None = Field(None, description="情绪")
    energy: int | None = Field(None, description="精力")
    day_bucket_start: datetime | None = Field(None, description="日记归属刷新点")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    deleted_at: datetime | None = Field(None, description="删除时间")
    tags: list[JournalTag] = Field(default_factory=list, description="关联标签列表")
    related_todo_ids: list[int] = Field(default_factory=list, description="关联待办ID列表")
    related_activity_ids: list[int] = Field(default_factory=list, description="关联活动ID列表")

    model_config = ConfigDict(from_attributes=True)


class JournalListResponse(BaseModel):
    """日记列表响应模型"""

    total: int = Field(..., description="总数")
    journals: list[JournalResponse] = Field(..., description="日记列表")


class JournalAutoLinkRequest(BaseModel):
    """自动关联请求"""

    journal_id: int | None = Field(None, description="日记ID")
    title: str | None = Field(None, description="日记标题")
    content_original: str | None = Field(None, description="日记原文")
    date: datetime = Field(..., description="日记日期")
    day_bucket_start: datetime | None = Field(None, description="日记归属刷新点")
    max_items: int = Field(3, ge=1, le=10, description="默认关联数量")


class JournalAutoLinkCandidate(BaseModel):
    """自动关联候选"""

    id: int = Field(..., description="候选ID")
    name: str = Field(..., description="候选标题")
    score: float = Field(..., description="匹配分")


class JournalAutoLinkResponse(BaseModel):
    """自动关联响应"""

    related_todo_ids: list[int] = Field(default_factory=list, description="关联待办ID列表")
    related_activity_ids: list[int] = Field(default_factory=list, description="关联活动ID列表")
    todo_candidates: list[JournalAutoLinkCandidate] = Field(
        default_factory=list, description="待办候选"
    )
    activity_candidates: list[JournalAutoLinkCandidate] = Field(
        default_factory=list, description="活动候选"
    )


class JournalGenerateRequest(BaseModel):
    """生成客观记录/AI 视角请求"""

    journal_id: int | None = Field(None, description="日记ID")
    title: str | None = Field(None, description="日记标题")
    content_original: str | None = Field(None, description="日记原文")
    date: datetime | None = Field(None, description="日记日期")
    day_bucket_start: datetime | None = Field(None, description="日记归属刷新点")
    language: str = Field("en", max_length=10, description="语言")


class JournalGenerateResponse(BaseModel):
    """生成结果响应"""

    content: str = Field(..., description="生成内容")
