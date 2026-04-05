"""手机号验证码认证服务 — 通过 cloud-api 代理完成认证 + 本地 Profile 自动关联

所有手机号认证操作（发送验证码、验证码登录、注册）转发到 cloud-api，
cloud-api 认证成功后在本地完成 Profile 绑定和 JWT 签发。
"""

from __future__ import annotations

from sqlmodel import Session, select

from core.security import create_access_token, create_refresh_token
from schemas.auth import SmsCodeResponse, TokenResponse
from services.cloud_auth_proxy import (
    fetch_cloud_user,
    proxy_register,
    proxy_send_code,
    proxy_verify,
)
from services.membership_service import create_free_membership
from storage.models import AuthMode, User, UserType
from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()


async def send_code(phone: str, purpose: str = "login") -> SmsCodeResponse:
    """转发发送验证码请求到 cloud-api"""
    result = await proxy_send_code(phone, purpose)
    return SmsCodeResponse(
        success=result.get("success", True), message=result.get("message", "验证码已发送")
    )


def _issue_tokens(user: User, profile_id: str | None = None) -> TokenResponse:
    """为用户签发本地 token 对"""
    access = create_access_token({"sub": user.id}, is_local=False)
    refresh = create_refresh_token({"sub": user.id}, is_local=False)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        auth_mode="cloud",
        profile_id=profile_id,
    )


def _ensure_cloud_profile(cloud_user_id: str, cloud_username: str) -> str:
    """确保存在一个与云端用户绑定的 Profile，返回 profile_id。

    查找优先级：
    1. 已绑定该 cloud_user_id 的 Profile -> 切换到它
    2. 当前激活的 standalone Profile -> 绑定它（保留已有本地数据）
    3. 其他 standalone Profile -> 绑定第一个
    4. 均不存在 -> 创建新的 bound Profile
    """
    from services.profile_service import (  # noqa: PLC0415
        bind_cloud,
        create_profile,
        find_profile_by_cloud_user,
        get_active_profile,
        list_profiles,
        switch_profile,
        update_profile_name,
    )
    from storage.database import reinitialize_db  # noqa: PLC0415
    from util.base_paths import invalidate_profile_cache  # noqa: PLC0415

    active = get_active_profile()

    existing = find_profile_by_cloud_user(cloud_user_id)
    if existing:
        if not active or active.id != existing.id:
            switch_profile(existing.id)
            reinitialize_db()
        return existing.id

    all_profiles = list_profiles()
    standalone = [p for p in all_profiles.profiles if p.cloud_user_id is None]

    if standalone:
        target = active if (active and active.cloud_user_id is None) else standalone[0]
        bind_cloud(target.id, cloud_user_id, cloud_username)
        update_profile_name(target.id, cloud_username)
        invalidate_profile_cache()

        if not active or active.id != target.id:
            switch_profile(target.id)
            reinitialize_db()

        logger.info(
            "Standalone Profile 已自动绑定云端账户: profile=%s, cloud_user=%s, username=%s",
            target.id,
            cloud_user_id,
            cloud_username,
        )
        return target.id

    new_profile = create_profile(cloud_username, cloud_user_id, cloud_username)
    switch_profile(new_profile.id)
    reinitialize_db()
    logger.info(
        "新 Profile 已创建并绑定云端账户: profile=%s, cloud_user=%s",
        new_profile.id,
        cloud_user_id,
    )
    return new_profile.id


def _get_fresh_session() -> Session:
    """从当前 db_base 获取一个新的 Session（Profile 切换后使用）"""
    from storage.database import db_base  # noqa: PLC0415

    return Session(db_base.engine)


def _bind_profile_and_update_user(
    session: Session,
    cloud_user_id: str,
    username: str,
    phone: str | None,
) -> tuple[User, str]:
    """绑定 Profile + 更新或创建本地 User，返回 (user, profile_id)"""
    profile_id = _ensure_cloud_profile(cloud_user_id, username)

    session.close()
    session = _get_fresh_session()

    local_user = session.get(User, profile_id)
    if local_user and not local_user.phone:
        local_user.username = username
        local_user.phone = phone
        local_user.auth_mode = AuthMode.CLOUD
        local_user.cloud_user_id = cloud_user_id
        local_user.last_login_at = get_utc_now()
        local_user.updated_at = get_utc_now()
        session.add(local_user)
        session.commit()
        session.refresh(local_user)
        logger.info(
            "本地用户已升级为云端用户: user_id=%s, phone=%s, username=%s",
            local_user.id,
            phone,
            username,
        )
        session.close()
        return local_user, profile_id

    existing_by_phone = None
    if phone:
        existing_by_phone = session.exec(
            select(User).where(User.phone == phone, User.is_deleted == False)  # noqa: E712
        ).first()
    if existing_by_phone:
        existing_by_phone.cloud_user_id = cloud_user_id
        existing_by_phone.last_login_at = get_utc_now()
        session.add(existing_by_phone)
        session.commit()
        session.refresh(existing_by_phone)
        session.close()
        return existing_by_phone, profile_id

    user = User(
        username=username,
        phone=phone,
        user_type=UserType.USER,
        auth_mode=AuthMode.CLOUD,
        cloud_user_id=cloud_user_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    create_free_membership(session, user.id)
    user.last_login_at = get_utc_now()
    session.add(user)
    session.commit()
    logger.info("新云端用户已创建: phone=%s, username=%s, id=%s", phone, username, user.id)
    session.close()
    return user, profile_id


async def verify_and_login(session: Session, phone: str, code: str) -> TokenResponse:
    """验证码登录 — 转发到 cloud-api 验证，成功后绑定本地 Profile。"""
    cloud_tokens = await proxy_verify(phone, code)
    cloud_user = await fetch_cloud_user(cloud_tokens.access_token)

    user, profile_id = _bind_profile_and_update_user(
        session,
        cloud_user_id=cloud_user.id,
        username=cloud_user.username,
        phone=cloud_user.phone,
    )
    return _issue_tokens(user, profile_id)


async def register_user(
    session: Session, phone: str, code: str, username: str, password: str
) -> TokenResponse:
    """手机号注册 — 转发到 cloud-api 注册，成功后绑定本地 Profile。

    如果本地已有 standalone Profile（含数据），自动绑定到新的云端账户，
    并将已有的本地默认用户升级为云端用户（保留所有关联数据）。
    """
    cloud_tokens = await proxy_register(phone, code, username, password)
    cloud_user = await fetch_cloud_user(cloud_tokens.access_token)

    user, profile_id = _bind_profile_and_update_user(
        session,
        cloud_user_id=cloud_user.id,
        username=cloud_user.username,
        phone=cloud_user.phone,
    )
    return _issue_tokens(user, profile_id)
