"""管理员路由 — 用户管理、会员管理"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import func, select

from dependencies.auth import AdminUserDep, SessionDep
from models.membership import MembershipPlan, UserMembership
from models.user import User
from schemas.auth import MessageResponse, UserProfileResponse
from services.user_service import get_user_profile

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/users", response_model=list[UserProfileResponse])
async def api_list_users(
    admin: AdminUserDep,
    session: SessionDep,
    skip: int = 0,
    limit: int = 50,
) -> list[UserProfileResponse]:
    """列出所有用户（管理员）"""
    result = await session.execute(
        select(User)
        .where(User.is_deleted == False)  # noqa: E712
        .offset(skip)
        .limit(limit)
        .order_by(User.created_at.desc())
    )
    users = result.scalars().all()
    return [await get_user_profile(session, u) for u in users]


@router.get("/users/count")
async def api_user_count(admin: AdminUserDep, session: SessionDep) -> dict:
    """获取用户总数"""
    result = await session.execute(
        select(func.count()).select_from(User).where(User.is_deleted == False)  # noqa: E712
    )
    return {"total": result.scalar_one()}


@router.delete("/users/{user_id}", response_model=MessageResponse)
async def api_delete_user(
    user_id: str, admin: AdminUserDep, session: SessionDep
) -> MessageResponse:
    """软删除用户（管理员）"""
    from datetime import UTC, datetime  # noqa: PLC0415

    user = await session.get(User, user_id)
    if not user or user.is_deleted:
        raise HTTPException(status_code=404, detail="用户不存在")

    user.is_deleted = True
    user.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    session.add(user)
    await session.commit()
    return MessageResponse(success=True, message="用户已删除")


@router.get("/plans", response_model=list[MembershipPlan])
async def api_list_plans(admin: AdminUserDep, session: SessionDep) -> list[MembershipPlan]:
    """列出所有会员计划"""
    result = await session.execute(
        select(MembershipPlan).where(MembershipPlan.is_deleted == False)  # noqa: E712
    )
    plans = result.scalars().all()
    return list(plans)
