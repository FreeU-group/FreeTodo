"""会员计划与用户会员关系模型"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import ClassVar

from sqlmodel import Column, Field, SQLModel, Text


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class MembershipPlan(SQLModel, table=True):
    __tablename__: ClassVar[str] = "membership_plans"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=50)
    type: str = Field(max_length=20, index=True)
    project_limit: int = Field(default=10)
    note_limit: int = Field(default=50)
    initial_credits: int = Field(default=0)
    daily_refresh_credits: int = Field(default=0)
    price: float = Field(default=0.0)
    currency: str = Field(default="CNY", max_length=10)
    duration_days: int = Field(default=365)
    is_active: bool = Field(default=True)
    description: str | None = Field(default=None, sa_column=Column(Text))
    is_deleted: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)
    deleted_at: datetime | None = None


class UserMembership(SQLModel, table=True):
    __tablename__: ClassVar[str] = "user_memberships"

    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(index=True, max_length=100)
    membership_plan_id: int = Field(index=True)
    start_date: datetime = Field(default_factory=_utc_now)
    end_date: datetime = Field(default_factory=_utc_now)
    is_active: bool = Field(default=True, index=True)
    total_chat_count: int = Field(default=0)
    daily_credits: int = Field(default=0)
    permanent_credits: int = Field(default=0)
    daily_credits_consumed: int = Field(default=0)
    total_credits_consumed: int = Field(default=0)
    total_credits_purchased: int = Field(default=0)
    last_reset_date: datetime = Field(default_factory=_utc_now)
    last_credit_refresh_date: datetime = Field(default_factory=_utc_now)
    is_deleted: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)
    deleted_at: datetime | None = None
