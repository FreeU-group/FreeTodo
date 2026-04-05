"""云端通知模型 — 持久化通知存储与推送跟踪"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import ClassVar
from uuid import uuid4

from sqlmodel import Column, Field, SQLModel, Text


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class CloudNotification(SQLModel, table=True):
    """云端持久化通知"""

    __tablename__: ClassVar[str] = "cloud_notifications"

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    user_id: str = Field(index=True, max_length=100)
    title: str = Field(max_length=200)
    content: str = Field(sa_column=Column(Text))
    notification_type: str | None = Field(default=None, max_length=30)
    related_todo_uid: str | None = Field(default=None, max_length=64)
    is_read: bool = Field(default=False)
    is_pushed: bool = Field(default=False)
    push_channels: str | None = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=_utc_now)
    read_at: datetime | None = None
