"""认证路由 — 本地登录、手机号验证码登录、Token 刷新、用户资料获取"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends
from pydantic import BaseModel as _BaseModel
from sqlmodel import Session

from core.dependencies import get_db_base
from dependencies.auth import UserDep
from schemas.auth import (
    LocalLoginResponse,
    RefreshTokenRequest,
    RegisterRequest,
    SmsCodeRequest,
    SmsCodeResponse,
    TokenResponse,
    UserProfileResponse,
    VerifyCodeRequest,
)
from services.local_auth_service import local_login, refresh_token
from services.phone_auth_service import register_user, send_code, verify_and_login
from services.user_account_service import get_user_profile

if TYPE_CHECKING:
    from storage.database_base import DatabaseBase

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class _LocalLoginRequest(_BaseModel):
    profile_id: str | None = None


@router.post("/local_login", response_model=LocalLoginResponse)
async def api_local_login(
    req: _LocalLoginRequest | None = None,
    db_base: DatabaseBase = Depends(get_db_base),
) -> LocalLoginResponse:
    """本地安全模式登录 — 无需凭据，一键进入"""
    profile_id = req.profile_id if req else None
    with Session(db_base.engine) as session:
        return local_login(session, profile_id=profile_id)


@router.post("/send_code", response_model=SmsCodeResponse)
async def api_send_code(req: SmsCodeRequest) -> SmsCodeResponse:
    """发送短信验证码 — 转发到 cloud-api"""
    return await send_code(req.phone, req.purpose)


@router.post("/verify", response_model=TokenResponse)
async def api_verify_code(
    req: VerifyCodeRequest,
    db_base: DatabaseBase = Depends(get_db_base),
) -> TokenResponse:
    """手机号验证码登录 — 转发 cloud-api 验证 + 本地 Profile 绑定"""
    with Session(db_base.engine) as session:
        return await verify_and_login(session, req.phone, req.code)


@router.post("/register", response_model=TokenResponse)
async def api_register(
    req: RegisterRequest,
    db_base: DatabaseBase = Depends(get_db_base),
) -> TokenResponse:
    """手机号注册 — 转发 cloud-api 注册 + 本地 Profile 绑定"""
    with Session(db_base.engine) as session:
        return await register_user(session, req.phone, req.code, req.username, req.password)


@router.post("/refresh_token", response_model=TokenResponse)
async def api_refresh_token(
    req: RefreshTokenRequest,
    db_base: DatabaseBase = Depends(get_db_base),
) -> TokenResponse:
    """刷新 Token — 使用 refresh_token 获取新的 token 对"""
    with Session(db_base.engine) as session:
        return refresh_token(session, req.refresh_token)


@router.get("/me", response_model=UserProfileResponse)
async def api_get_me(
    user: UserDep,
    db_base: DatabaseBase = Depends(get_db_base),
) -> UserProfileResponse:
    """获取当前登录用户资料"""
    with Session(db_base.engine) as session:
        db_user = session.get(type(user), user.id)
        if db_user is None:
            from fastapi import HTTPException  # noqa: PLC0415

            raise HTTPException(status_code=404, detail="用户不存在")
        return get_user_profile(session, db_user)
