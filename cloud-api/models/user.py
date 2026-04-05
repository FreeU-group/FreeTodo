"""用户数据模型 — 与 local-api 表结构保持一致，适配 PostgreSQL"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import ClassVar
from uuid import uuid4

from sqlmodel import Field, SQLModel


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class UserType(StrEnum):
    USER = "user"
    ADMIN = "admin"


class AuthMode(StrEnum):
    LOCAL = "local"
    CLOUD = "cloud"


class MembershipType(StrEnum):
    FREE = "free"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class User(SQLModel, table=True):
    __tablename__: ClassVar[str] = "users"

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    username: str = Field(index=True, max_length=100)
    phone: str | None = Field(default=None, index=True, max_length=20)
    password_hash: str | None = Field(default=None, max_length=256)
    user_type: str = Field(default=UserType.USER, max_length=20)
    auth_mode: str = Field(default=AuthMode.CLOUD, max_length=20)
    cloud_user_id: str | None = Field(default=None, max_length=100)
    avatar_key: str | None = Field(default=None, max_length=500)
    is_dev: bool = Field(default=False)
    last_login_at: datetime | None = Field(default=None)
    is_deleted: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)
    deleted_at: datetime | None = None
