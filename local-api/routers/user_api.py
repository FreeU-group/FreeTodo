"""用户路由 — 用户名修改、头像、使用统计"""

from __future__ import annotations

import io
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session

from core.dependencies import get_db_base
from dependencies.auth import UserDep
from schemas.auth import (
    AuthModeResponse,
    UpdateUsernameRequest,
    UsageStatsResponse,
    UserProfileResponse,
)
from services.user_account_service import (
    get_auth_mode,
    get_usage_stats,
    get_user_profile,
    update_username,
)
from storage.models import User
from util.base_paths import get_user_data_dir
from util.logging_config import get_logger
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from storage.database_base import DatabaseBase

logger = get_logger()

router = APIRouter(prefix="/api/v1/user", tags=["user"])

AVATAR_DIR = get_user_data_dir() / "avatars"
ALLOWED_AVATAR_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_AVATAR_SIZE = 1 * 1024 * 1024  # 1MB


@router.put("/username", response_model=UserProfileResponse)
async def api_update_username(
    req: UpdateUsernameRequest,
    user: UserDep,
    db_base: DatabaseBase = Depends(get_db_base),
) -> UserProfileResponse:
    """修改用户名"""
    with Session(db_base.engine) as session:
        return update_username(session, user.id, req)


@router.post("/avatar", response_model=UserProfileResponse)
async def api_upload_avatar(
    file: UploadFile,
    user: UserDep,
    db_base: DatabaseBase = Depends(get_db_base),
) -> UserProfileResponse:
    """上传头像 — 支持 png/jpg/jpeg/webp，最大 1MB"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="请选择文件")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_AVATAR_EXTENSIONS:
        raise HTTPException(status_code=400, detail="仅支持 png/jpg/jpeg/webp 格式")

    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="头像文件不能超过 1MB")

    try:
        from PIL import Image  # noqa: PLC0415

        img = Image.open(io.BytesIO(content))
        size = min(img.width, img.height)
        left = (img.width - size) // 2
        top = (img.height - size) // 2
        img = img.crop((left, top, left + size, top + size))
        img = img.resize((256, 256), Image.LANCZOS)

        AVATAR_DIR.mkdir(parents=True, exist_ok=True)
        avatar_path = AVATAR_DIR / f"{user.id}.png"
        img.save(str(avatar_path), "PNG")
    except Exception as e:
        logger.error("头像处理失败: %s", e)
        raise HTTPException(status_code=500, detail="头像处理失败") from e

    with Session(db_base.engine) as session:
        db_user = session.get(User, user.id)
        if db_user:
            db_user.avatar_key = str(avatar_path)
            db_user.updated_at = get_utc_now()
            session.add(db_user)
            session.commit()
            session.refresh(db_user)
            return get_user_profile(session, db_user)
    raise HTTPException(status_code=404, detail="用户不存在")


@router.get("/avatar")
async def api_get_avatar(user: UserDep) -> FileResponse:
    """获取当前用户头像"""
    avatar_path = AVATAR_DIR / f"{user.id}.png"
    if not avatar_path.exists():
        raise HTTPException(status_code=404, detail="头像不存在")
    return FileResponse(str(avatar_path), media_type="image/png")


@router.get("/usage-stats", response_model=UsageStatsResponse)
async def api_get_usage_stats(
    user: UserDep,
    db_base: DatabaseBase = Depends(get_db_base),
) -> UsageStatsResponse:
    """获取使用统计"""
    with Session(db_base.engine) as session:
        return get_usage_stats(session, user.id)


@router.get("/auth-mode", response_model=AuthModeResponse)
async def api_get_auth_mode(user: UserDep) -> AuthModeResponse:
    """获取当前用户认证模式"""
    return get_auth_mode(user)
