"""同步基础模型 — 设备注册、变更日志与游标"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import ClassVar

from sqlmodel import Column, Field, SQLModel, Text


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class SyncDevice(SQLModel, table=True):
    """已注册的同步设备"""

    __tablename__: ClassVar[str] = "sync_devices"

    id: str = Field(primary_key=True)
    user_id: str = Field(index=True, max_length=100)
    device_name: str | None = Field(default=None, max_length=200)
    device_type: str = Field(default="desktop", max_length=20)
    push_token: str | None = Field(default=None, max_length=500)
    push_enabled: bool = Field(default=True)
    last_seen_at: datetime | None = None
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)


class SyncChangelog(SQLModel, table=True):
    """变更日志 — id 自增即为 cursor"""

    __tablename__: ClassVar[str] = "sync_changelog"

    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(index=True, max_length=100)
    entity_type: str = Field(max_length=20)
    entity_id: str = Field(max_length=100, index=True)
    operation: str = Field(max_length=10)
    source_device_id: str | None = Field(default=None, max_length=100)
    snapshot: str | None = Field(default=None, sa_column=Column(Text))
    changed_at: datetime = Field(default_factory=_utc_now)


class SyncCursor(SQLModel, table=True):
    """每个设备对每种实体类型的消费位置"""

    __tablename__: ClassVar[str] = "sync_cursors"

    device_id: str = Field(primary_key=True, max_length=100)
    entity_type: str = Field(primary_key=True, max_length=20)
    last_cursor: int = Field(default=0)
    updated_at: datetime = Field(default_factory=_utc_now)
