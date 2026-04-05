"""用户账户服务 — 用户资料查询与修改"""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, select

from schemas.auth import (
    AuthModeResponse,
    UpdateUsernameRequest,
    UsageStatsResponse,
    UserProfileResponse,
)
from storage.models import MembershipPlan, MembershipType, User, UserMembership
from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()


def _get_profile_info() -> tuple[str | None, str | None, bool]:
    """获取当前 Profile 信息，返回 (id, name, is_bound)"""
    try:
        from services.profile_service import get_active_profile  # noqa: PLC0415

        profile = get_active_profile()
        if profile:
            return profile.id, profile.name, profile.cloud_user_id is not None
    except Exception:
        pass
    return None, None, False


def get_user_profile(session: Session, user: User) -> UserProfileResponse:
    """获取用户资料（含会员类型和 Profile 信息）"""
    membership_type = MembershipType.FREE
    active_membership = session.exec(
        select(UserMembership).where(
            UserMembership.user_id == user.id,
            UserMembership.is_active == True,  # noqa: E712
        )
    ).first()

    if active_membership:
        plan = session.get(MembershipPlan, active_membership.membership_plan_id)
        if plan:
            membership_type = plan.type

    avatar_url = f"/api/v1/user/avatar?user_id={user.id}" if user.avatar_key else None
    profile_id, profile_name, is_bound = _get_profile_info()

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
        profile_id=profile_id,
        profile_name=profile_name,
        is_bound=is_bound,
    )


def update_username(
    session: Session, user_id: str, req: UpdateUsernameRequest
) -> UserProfileResponse:
    """修改用户名"""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    user.username = req.username
    user.updated_at = get_utc_now()
    session.add(user)
    session.commit()
    session.refresh(user)
    return get_user_profile(session, user)


def get_usage_stats(session: Session, user_id: str) -> UsageStatsResponse:
    """获取用户使用统计"""
    active_membership = session.exec(
        select(UserMembership).where(
            UserMembership.user_id == user_id,
            UserMembership.is_active == True,  # noqa: E712
        )
    ).first()

    if not active_membership:
        return UsageStatsResponse()

    plan = session.get(MembershipPlan, active_membership.membership_plan_id)
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
    """获取当前用户认证模式"""
    return AuthModeResponse(auth_mode=user.auth_mode, user_id=user.id)
