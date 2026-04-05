"""认证路由 — 注册、登录（密码/验证码）、密码重置、Token 刷新、用户资料"""

from __future__ import annotations

from fastapi import APIRouter

from core.redis import get_redis
from dependencies.auth import SessionDep, UserDep
from schemas.auth import (
    LoginRequest,
    MessageResponse,
    RefreshTokenRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SmsCodeRequest,
    SmsCodeResponse,
    TokenResponse,
    UserProfileResponse,
    VerifyCodeRequest,
)
from services.auth_service import (
    login_by_code,
    login_by_password,
    refresh_token,
    register,
    reset_password,
)
from services.sms_service import send_code
from services.user_service import get_user_profile

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/send_code", response_model=SmsCodeResponse)
async def api_send_code(req: SmsCodeRequest) -> SmsCodeResponse:
    """发送短信验证码"""
    redis = await get_redis()
    await send_code(redis, req.phone, req.purpose)
    return SmsCodeResponse(success=True, message="验证码已发送")


@router.post("/verify", response_model=TokenResponse)
async def api_verify_code(req: VerifyCodeRequest, session: SessionDep) -> TokenResponse:
    """手机号验证码登录"""
    redis = await get_redis()
    return await login_by_code(session, redis, req)


@router.post("/register", response_model=TokenResponse)
async def api_register(req: RegisterRequest, session: SessionDep) -> TokenResponse:
    """手机号注册 — 验证码 + 用户名 + 密码"""
    redis = await get_redis()
    return await register(session, redis, req)


@router.post("/login", response_model=TokenResponse)
async def api_login(req: LoginRequest, session: SessionDep) -> TokenResponse:
    """手机号密码登录"""
    return await login_by_password(session, req)


@router.post("/reset_password", response_model=MessageResponse)
async def api_reset_password(req: ResetPasswordRequest, session: SessionDep) -> MessageResponse:
    """重置密码"""
    redis = await get_redis()
    await reset_password(session, redis, req)
    return MessageResponse(success=True, message="密码重置成功")


@router.post("/refresh_token", response_model=TokenResponse)
async def api_refresh_token(req: RefreshTokenRequest, session: SessionDep) -> TokenResponse:
    """刷新 Token"""
    return await refresh_token(session, req.refresh_token)


@router.get("/me", response_model=UserProfileResponse)
async def api_get_me(user: UserDep, session: SessionDep) -> UserProfileResponse:
    """获取当前登录用户资料"""
    db_user = await session.get(type(user), user.id)
    if db_user is None:
        from fastapi import HTTPException  # noqa: PLC0415

        raise HTTPException(status_code=404, detail="用户不存在")
    return await get_user_profile(session, db_user)
