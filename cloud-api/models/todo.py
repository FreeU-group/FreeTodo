"""云端待办模型 — 映射 local-api Todo 全部业务字段"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import ClassVar

from sqlmodel import Column, Field, SQLModel, Text


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class CloudTodo(SQLModel, table=True):
    """云端待办（主键为 uid，与本地 Todo.uid 一一对应）"""

    __tablename__: ClassVar[str] = "cloud_todos"

    uid: str = Field(primary_key=True, max_length=64)
    user_id: str = Field(index=True, max_length=100)
    version: int = Field(default=1)

    name: str = Field(max_length=200)
    summary: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, sa_column=Column(Text))
    user_notes: str | None = Field(default=None, sa_column=Column(Text))
    who_founder: str | None = Field(default=None, max_length=100)
    who_executor: str | None = Field(default=None, max_length=100)
    parent_todo_uid: str | None = Field(default=None, max_length=64)
    item_type: str = Field(default="VTODO", max_length=10)
    location: str | None = Field(default=None, max_length=200)
    categories: str | None = Field(default=None, sa_column=Column(Text))
    classification: str | None = Field(default=None, max_length=20)
    deadline: datetime | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    dtstart: datetime | None = None
    dtend: datetime | None = None
    due: datetime | None = None
    duration: str | None = Field(default=None, max_length=64)
    time_zone: str | None = Field(default=None, max_length=64)
    tzid: str | None = Field(default=None, max_length=64)
    is_all_day: bool = Field(default=False)
    dtstamp: datetime | None = None
    ical_created: datetime | None = None
    last_modified: datetime | None = None
    sequence: int = Field(default=0)
    rdate: str | None = Field(default=None, sa_column=Column(Text))
    exdate: str | None = Field(default=None, sa_column=Column(Text))
    recurrence_id: datetime | None = None
    related_to_uid: str | None = Field(default=None, max_length=64)
    related_to_reltype: str | None = Field(default=None, max_length=20)
    ical_status: str | None = Field(default=None, max_length=20)
    reminder_offsets: str | None = Field(default=None, sa_column=Column(Text))
    status: str = Field(default="active", max_length=20)
    priority: str = Field(default="none", max_length=20)
    completed_at: datetime | None = None
    percent_complete: int = Field(default=0)
    rrule: str | None = Field(default=None, max_length=500)
    order: int = Field(default=0)
    tags: str | None = Field(default=None, sa_column=Column(Text))
    related_activities: str | None = Field(default=None, sa_column=Column(Text))

    is_deleted: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)
