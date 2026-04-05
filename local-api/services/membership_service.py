"""会员服务 — 会员计划初始化与用户会员管理"""

from __future__ import annotations

from datetime import timedelta

from sqlmodel import Session, select

from storage.models import (
    MembershipPlan,
    MembershipType,
    UserMembership,
)
from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()

DEFAULT_PLANS = [
    {
        "name": "免费版",
        "type": MembershipType.FREE,
        "project_limit": 5,
        "note_limit": 20,
        "initial_credits": 100,
        "daily_refresh_credits": 5,
        "price": 0.0,
        "duration_days": 365,
        "description": "基础免费功能",
    },
    {
        "name": "月度会员",
        "type": MembershipType.MONTHLY,
        "project_limit": 50,
        "note_limit": 200,
        "initial_credits": 500,
        "daily_refresh_credits": 50,
        "price": 19.9,
        "duration_days": 30,
        "description": "月度会员，更多配额与积分",
    },
    {
        "name": "年度会员",
        "type": MembershipType.YEARLY,
        "project_limit": 200,
        "note_limit": 1000,
        "initial_credits": 2000,
        "daily_refresh_credits": 100,
        "price": 168.0,
        "duration_days": 365,
        "description": "年度会员，最大配额与积分",
    },
]


def init_default_plans(session: Session) -> None:
    """初始化默认会员计划（幂等操作）"""
    for plan_data in DEFAULT_PLANS:
        existing = session.exec(
            select(MembershipPlan).where(MembershipPlan.type == plan_data["type"])
        ).first()
        if existing:
            continue
        plan = MembershipPlan(**plan_data)
        session.add(plan)
    session.commit()
    logger.info("会员计划初始化完成")


def create_free_membership(session: Session, user_id: str) -> UserMembership | None:
    """为用户创建免费会员记录"""
    existing = session.exec(
        select(UserMembership).where(
            UserMembership.user_id == user_id,
            UserMembership.is_active == True,  # noqa: E712
        )
    ).first()
    if existing:
        return existing

    free_plan = session.exec(
        select(MembershipPlan).where(MembershipPlan.type == MembershipType.FREE)
    ).first()
    if not free_plan:
        logger.warning("免费会员计划不存在，跳过创建会员记录")
        return None

    now = get_utc_now()
    membership = UserMembership(
        user_id=user_id,
        membership_plan_id=free_plan.id,
        start_date=now,
        end_date=now + timedelta(days=free_plan.duration_days),
        is_active=True,
        daily_credits=free_plan.daily_refresh_credits,
        permanent_credits=free_plan.initial_credits,
    )
    session.add(membership)
    session.commit()
    session.refresh(membership)
    logger.info("已为用户 %s 创建免费会员记录", user_id)
    return membership
