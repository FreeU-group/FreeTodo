"""事件相关的 Pydantic 模型"""

from datetime import datetime

from pydantic import BaseModel

from lifetrace.schemas.screenshot import ScreenshotResponse


class EventResponse(BaseModel):
    id: int
    app_name: str | None
    window_title: str | None
    start_time: datetime
    end_time: datetime | None
    screenshot_count: int
    first_screenshot_id: int | None
    ai_title: str | None = None
    ai_summary: str | None = None


class EventDetailResponse(BaseModel):
    id: int
    app_name: str | None
    window_title: str | None
    start_time: datetime
    end_time: datetime | None
    screenshots: list[ScreenshotResponse]
    ai_title: str | None = None
    ai_summary: str | None = None


class EventListResponse(BaseModel):
    """事件列表响应，包含事件列表和总数"""

    events: list[EventResponse]
    total_count: int

    class Config:
        from_attributes = True
