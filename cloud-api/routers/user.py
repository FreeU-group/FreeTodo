"""用户路由 — 用户名修改、头像上传/获取、使用统计、会员升级"""

from __future__ import annotations

import io
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from loguru import logger
from minio import Minio

from core.config import settings
from dependencies.auth import SessionDep, UserDep
from models.user import User
from schemas.auth import (
    AuthModeResponse,
    MessageResponse,
    UpdateUsernameRequest,
    UpgradePlanRequest,
    UsageStatsResponse,
    UserProfileResponse,
)
from services.membership_service import upgrade_membership
from services.user_service import (
    get_auth_mode,
    get_usage_stats,
    get_user_profile,
    update_username,
)

router = APIRouter(prefix="/api/v1/user", tags=["user"])

ALLOWED_AVATAR_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_AVATAR_SIZE = 1 * 1024 * 1024


def _get_minio_client() -> Minio:
    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )


@router.put("/username", response_model=UserProfileResponse)
async def api_update_username(
    req: UpdateUsernameRequest, user: UserDep, session: SessionDep
) -> UserProfileResponse:
    return await update_username(session, user.id, req)


@router.post("/avatar", response_model=UserProfileResponse)
async def api_upload_avatar(
    file: UploadFile, user: UserDep, session: SessionDep
) -> UserProfileResponse:
    """上传头像 — 居中裁剪 + 存储到 MinIO"""
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

        buf = io.BytesIO()
        img.save(buf, "PNG")
        buf.seek(0)
        png_data = buf.read()
    except Exception as e:
        logger.error("头像处理失败: %s", e)
        raise HTTPException(status_code=500, detail="头像处理失败") from e

    object_key = f"avatars/{user.id}.png"
    try:
        client = _get_minio_client()
        if not client.bucket_exists(settings.MINIO_BUCKET_NAME):
            client.make_bucket(settings.MINIO_BUCKET_NAME)
        client.put_object(
            settings.MINIO_BUCKET_NAME,
            object_key,
            io.BytesIO(png_data),
            len(png_data),
            content_type="image/png",
        )
    except Exception as e:
        logger.error("MinIO 上传失败: %s", e)
        raise HTTPException(status_code=500, detail="头像存储失败") from e

    from datetime import UTC, datetime  # noqa: PLC0415

    db_user = await session.get(User, user.id)
    if db_user:
        db_user.avatar_key = object_key
        db_user.updated_at = datetime.now(UTC).replace(tzinfo=None)
        session.add(db_user)
        await session.commit()
        await session.refresh(db_user)
        return await get_user_profile(session, db_user)
    raise HTTPException(status_code=404, detail="用户不存在")


@router.get("/avatar")
async def api_get_avatar(user: UserDep) -> StreamingResponse:
    """获取当前用户头像"""
    object_key = f"avatars/{user.id}.png"
    try:
        client = _get_minio_client()
        response = client.get_object(settings.MINIO_BUCKET_NAME, object_key)
        return StreamingResponse(response, media_type="image/png")
    except Exception:
        raise HTTPException(status_code=404, detail="头像不存在")


@router.get("/usage-stats", response_model=UsageStatsResponse)
async def api_get_usage_stats(user: UserDep, session: SessionDep) -> UsageStatsResponse:
    return await get_usage_stats(session, user.id)


@router.get("/auth-mode", response_model=AuthModeResponse)
async def api_get_auth_mode(user: UserDep) -> AuthModeResponse:
    return get_auth_mode(user)


@router.post("/upgrade", response_model=MessageResponse)
async def api_upgrade_membership(
    req: UpgradePlanRequest, user: UserDep, session: SessionDep
) -> MessageResponse:
    """升级会员"""
    await upgrade_membership(session, user.id, req.plan_id)
    return MessageResponse(success=True, message="会员升级成功")
