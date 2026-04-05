"""会员服务 — 会员计划初始化、免费会员创建、升级"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)

from fastapi import HTTPException
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.membership import MembershipPlan, UserMembership
from models.user import MembershipType

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


async def init_default_plans(session: AsyncSession) -> None:
    for plan_data in DEFAULT_PLANS:
        result = await session.execute(
            select(MembershipPlan).where(MembershipPlan.type == plan_data["type"])
        )
        if result.scalars().first():
            continue
        plan = MembershipPlan(**plan_data)
        session.add(plan)
    await session.commit()
    logger.info("会员计划初始化完成")


async def create_free_membership(
    session: AsyncSession, user_id: str
) -> UserMembership | None:
    result = await session.execute(
        select(UserMembership).where(
            UserMembership.user_id == user_id,
            UserMembership.is_active == True,  # noqa: E712
        )
    )
    existing = result.scalars().first()
    if existing:
        return existing

    result = await session.execute(
        select(MembershipPlan).where(MembershipPlan.type == MembershipType.FREE)
    )
    free_plan = result.scalars().first()
    if not free_plan:
        logger.warning("免费会员计划不存在，跳过创建会员记录")
        return None

    now = _utc_now()
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
    await session.commit()
    await session.refresh(membership)
    logger.info("已为用户 %s 创建免费会员记录", user_id)
    return membership


async def upgrade_membership(
    session: AsyncSession, user_id: str, plan_id: int
) -> UserMembership:
    """升级会员 — 停用旧记录并创建新记录（保留积分余额和统计）"""
    new_plan = await session.get(MembershipPlan, plan_id)
    if not new_plan or not new_plan.is_active or new_plan.is_deleted:
        raise HTTPException(status_code=404, detail="会员计划不存在或已下架")

    result = await session.execute(
        select(UserMembership).where(
            UserMembership.user_id == user_id,
            UserMembership.is_active == True,  # noqa: E712
        )
    )
    current = result.scalars().first()

    carried_permanent = 0
    carried_stats: dict = {}
    if current:
        carried_permanent = current.permanent_credits
        carried_stats = {
            "total_chat_count": current.total_chat_count,
            "total_credits_consumed": current.total_credits_consumed,
            "total_credits_purchased": current.total_credits_purchased,
        }
        current.is_active = False
        current.updated_at = _utc_now()
        session.add(current)

    now = _utc_now()
    membership = UserMembership(
        user_id=user_id,
        membership_plan_id=new_plan.id,
        start_date=now,
        end_date=now + timedelta(days=new_plan.duration_days),
        is_active=True,
        daily_credits=new_plan.daily_refresh_credits,
        permanent_credits=carried_permanent + new_plan.initial_credits,
        **carried_stats,
    )
    session.add(membership)
    await session.commit()
    await session.refresh(membership)
    logger.info("用户 %s 已升级至会员计划 %s", user_id, new_plan.name)
    return membership
