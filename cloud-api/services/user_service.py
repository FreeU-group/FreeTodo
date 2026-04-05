"""用户账户服务 — 资料查询、修改、头像管理"""

from __future__ import annotations

from datetime import UTC, datetime


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.membership import MembershipPlan, UserMembership
from models.user import MembershipType, User
from schemas.auth import (
    AuthModeResponse,
    UpdateUsernameRequest,
    UsageStatsResponse,
    UserProfileResponse,
)


async def get_user_profile(session: AsyncSession, user: User) -> UserProfileResponse:
    membership_type = MembershipType.FREE
    result = await session.execute(
        select(UserMembership).where(
            UserMembership.user_id == user.id,
            UserMembership.is_active == True,  # noqa: E712
        )
    )
    active_membership = result.scalars().first()

    if active_membership:
        plan = await session.get(MembershipPlan, active_membership.membership_plan_id)
        if plan:
            membership_type = plan.type

    avatar_url = f"/api/v1/user/avatar?user_id={user.id}" if user.avatar_key else None

    return UserProfileResponse(
        id=user.id,
        username=user.username,
        phone=user.phone,
        user_type=user.user_type,
        auth_mode=user.auth_mode,
        membership_type=membership_type,
        is_dev=user.is_dev,
        avatar_url=avatar_url,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
    )


async def update_username(
    session: AsyncSession, user_id: str, req: UpdateUsernameRequest
) -> UserProfileResponse:
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    result = await session.execute(
        select(User).where(
            User.username == req.username,
            User.id != user_id,
            User.is_deleted == False,  # noqa: E712
        )
    )
    name_taken = result.scalars().first()
    if name_taken:
        raise HTTPException(status_code=409, detail="该用户名已被占用")

    user.username = req.username
    user.updated_at = _utc_now()
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return await get_user_profile(session, user)


async def get_usage_stats(session: AsyncSession, user_id: str) -> UsageStatsResponse:
    result = await session.execute(
        select(UserMembership).where(
            UserMembership.user_id == user_id,
            UserMembership.is_active == True,  # noqa: E712
        )
    )
    active_membership = result.scalars().first()

    if not active_membership:
        return UsageStatsResponse()

    plan = await session.get(MembershipPlan, active_membership.membership_plan_id)
    membership_type = plan.type if plan else MembershipType.FREE

    return UsageStatsResponse(
        total_chat_count=active_membership.total_chat_count,
        daily_credits=active_membership.daily_credits,
        permanent_credits=active_membership.permanent_credits,
        daily_credits_consumed=active_membership.daily_credits_consumed,
        total_credits_consumed=active_membership.total_credits_consumed,
        total_credits_purchased=active_membership.total_credits_purchased,
        membership_type=membership_type,
        membership_active=active_membership.is_active,
    )


def get_auth_mode(user: User) -> AuthModeResponse:
    return AuthModeResponse(auth_mode=user.auth_mode, user_id=user.id)
