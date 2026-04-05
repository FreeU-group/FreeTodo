"""本地认证服务 — 本地安全模式登录与 Token 刷新"""

from __future__ import annotations

from typing import TYPE_CHECKING

from core.security import create_access_token, create_refresh_token, decode_token
from schemas.auth import LocalLoginResponse, TokenResponse
from services.membership_service import create_free_membership
from storage.models import AuthMode, User, UserType
from util.logging_config import get_logger
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from sqlmodel import Session

logger = get_logger()

LOCAL_DEFAULT_USER_ID = "local-default-user"


def _get_default_user_id() -> str:
    """获取当前 Profile 对应的默认用户 ID"""
    try:
        from services.profile_service import get_active_profile  # noqa: PLC0415

        profile = get_active_profile()
        if profile:
            return profile.id
    except Exception:
        pass
    return LOCAL_DEFAULT_USER_ID


def _get_default_username() -> str:
    """获取当前 Profile 对应的默认用户名"""
    try:
        from services.profile_service import get_active_profile  # noqa: PLC0415

        profile = get_active_profile()
        if profile:
            return profile.name
    except Exception:
        pass
    return "本地用户"


def local_login(session: Session, profile_id: str | None = None) -> LocalLoginResponse:
    """本地安全模式登录：无需凭据，直接签发本地 JWT

    Args:
        session: 数据库会话
        profile_id: 可选的 Profile ID。如果提供，先切换到该 Profile。
    """
    if profile_id:
        try:
            from services.profile_service import switch_profile  # noqa: PLC0415
            from storage.database import reinitialize_db  # noqa: PLC0415

            switch_profile(profile_id)
            reinitialize_db()
            session.close()
            from storage.database import db_base  # noqa: PLC0415

            session = __import__("sqlmodel").Session(db_base.engine)
        except Exception:
            logger.warning("Profile 切换失败，使用当前 Profile")

    user_id = _get_default_user_id()
    username = _get_default_username()

    user = session.get(User, user_id)
    if not user:
        user = User(
            id=user_id,
            username=username,
            user_type=UserType.ADMIN,
            auth_mode=AuthMode.LOCAL,
        )
        session.add(user)
        session.commit()
        create_free_membership(session, user.id)

    user.last_login_at = get_utc_now()
    session.add(user)
    session.commit()

    access = create_access_token({"sub": user.id}, is_local=True)
    refresh = create_refresh_token({"sub": user.id}, is_local=True)
    return LocalLoginResponse(
        access_token=access,
        refresh_token=refresh,
        auth_mode="local",
        user_id=user.id,
        profile_id=user_id,
    )


def refresh_token(session: Session, refresh_token_str: str) -> TokenResponse:
    """验证 refresh_token 并签发新的 token 对"""
    from fastapi import HTTPException  # noqa: PLC0415

    payload = decode_token(refresh_token_str)
    if payload is None:
        raise HTTPException(status_code=401, detail="无效的刷新令牌")

    token_type = payload.get("token_type")
    if token_type != "refresh":
        raise HTTPException(status_code=401, detail="请使用 refresh_token 进行刷新")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="令牌中缺少用户信息")

    user = session.get(User, user_id)
    if user is None or user.is_deleted:
        raise HTTPException(status_code=401, detail="用户不存在")

    is_local = payload.get("auth_mode") == "local"
    new_access = create_access_token({"sub": user.id}, is_local=is_local)
    new_refresh = create_refresh_token({"sub": user.id}, is_local=is_local)
    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        auth_mode="local" if is_local else "cloud",
    )
