"""认证服务 — 注册、登录、密码重置、Token 刷新"""

from __future__ import annotations

from datetime import UTC, datetime


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)

from fastapi import HTTPException
from loguru import logger
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from models.user import AuthMode, User, UserType
from schemas.auth import (
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    VerifyCodeRequest,
)
from services.membership_service import create_free_membership
from services.sms_service import verify_code


def _issue_tokens(user: User) -> TokenResponse:
    access = create_access_token({"sub": user.id})
    refresh = create_refresh_token({"sub": user.id})
    return TokenResponse(access_token=access, refresh_token=refresh, auth_mode="cloud")


async def register(
    session: AsyncSession, redis: Redis, data: RegisterRequest
) -> TokenResponse:
    """手机号注册 — 验证码 + 创建用户 + 签发 Token"""
    await verify_code(redis, data.phone, data.code)

    result = await session.execute(
        select(User).where(User.phone == data.phone, User.is_deleted == False)  # noqa: E712
    )
    if result.scalars().first():
        raise HTTPException(status_code=409, detail="该手机号已注册，请直接登录")

    result = await session.execute(
        select(User).where(User.username == data.username, User.is_deleted == False)  # noqa: E712
    )
    if result.scalars().first():
        raise HTTPException(status_code=409, detail="该用户名已被占用")
    user = User(
        username=data.username,
        phone=data.phone,
        password_hash=hash_password(data.password),
        user_type=UserType.USER,
        auth_mode=AuthMode.CLOUD,
        last_login_at=_utc_now(),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    await create_free_membership(session, user.id)

    logger.info("注册成功: phone=%s, username=%s, id=%s", data.phone, data.username, user.id)
    return _issue_tokens(user)


async def login_by_password(
    session: AsyncSession, data: LoginRequest
) -> TokenResponse:
    """手机号+密码登录"""
    result = await session.execute(
        select(User).where(User.phone == data.phone, User.is_deleted == False)  # noqa: E712
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=401, detail="手机号或密码错误")
    if not user.password_hash:
        raise HTTPException(status_code=401, detail="该账户未设置密码，请使用验证码登录")
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="手机号或密码错误")

    user.last_login_at = _utc_now()
    session.add(user)
    await session.commit()

    return _issue_tokens(user)


async def login_by_code(
    session: AsyncSession, redis: Redis, data: VerifyCodeRequest
) -> TokenResponse:
    """手机号+验证码登录"""
    await verify_code(redis, data.phone, data.code)

    result = await session.execute(
        select(User).where(User.phone == data.phone, User.is_deleted == False)  # noqa: E712
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="该手机号尚未注册，请先注册")

    user.last_login_at = _utc_now()
    session.add(user)
    await session.commit()

    return _issue_tokens(user)


async def reset_password(
    session: AsyncSession, redis: Redis, data: ResetPasswordRequest
) -> None:
    """重置密码"""
    await verify_code(redis, data.phone, data.code)

    result = await session.execute(
        select(User).where(User.phone == data.phone, User.is_deleted == False)  # noqa: E712
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    user.password_hash = hash_password(data.new_password)
    user.updated_at = _utc_now()
    session.add(user)
    await session.commit()
    logger.info("密码重置成功: phone=%s", data.phone)


async def refresh_token(session: AsyncSession, refresh_token_str: str) -> TokenResponse:
    """刷新 Token"""
    payload = decode_token(refresh_token_str)
    if payload is None:
        raise HTTPException(status_code=401, detail="无效的刷新令牌")

    if payload.get("token_type") != "refresh":
        raise HTTPException(status_code=401, detail="请使用 refresh_token 进行刷新")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="令牌中缺少用户信息")

    user = await session.get(User, user_id)
    if user is None or user.is_deleted:
        raise HTTPException(status_code=401, detail="用户不存在")

    return _issue_tokens(user)
