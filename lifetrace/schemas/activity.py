from datetime import datetime

from pydantic import BaseModel


class ActivityResponse(BaseModel):
    id: int
    start_time: datetime
    end_time: datetime
    ai_title: str | None = None
    ai_summary: str | None = None
    event_count: int
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ActivityListResponse(BaseModel):
    activities: list[ActivityResponse]
    total_count: int


class ActivityEventsResponse(BaseModel):
    event_ids: list[int]
