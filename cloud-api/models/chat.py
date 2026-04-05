"""云端聊天模型 — 映射 local-api Chat + Message"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import ClassVar

from sqlmodel import Column, Field, SQLModel, Text


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class CloudChat(SQLModel, table=True):
    """云端聊天会话"""

    __tablename__: ClassVar[str] = "cloud_chats"

    session_id: str = Field(primary_key=True, max_length=100)
    user_id: str = Field(index=True, max_length=100)
    version: int = Field(default=1)
    chat_type: str | None = Field(default=None, max_length=50)
    title: str | None = Field(default=None, max_length=200)
    context: str | None = Field(default=None, sa_column=Column(Text))
    extra_data: str | None = Field(default=None, sa_column=Column(Text))
    last_message_at: datetime | None = None
    is_deleted: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)


class CloudMessage(SQLModel, table=True):
    """云端聊天消息"""

    __tablename__: ClassVar[str] = "cloud_messages"

    uid: str = Field(primary_key=True, max_length=64)
    chat_session_id: str = Field(index=True, max_length=100)
    user_id: str = Field(index=True, max_length=100)
    version: int = Field(default=1)
    role: str = Field(max_length=20)
    content: str = Field(sa_column=Column(Text))
    token_count: int | None = None
    model: str | None = Field(default=None, max_length=100)
    extra_data: str | None = Field(default=None, sa_column=Column(Text))
    is_deleted: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)
