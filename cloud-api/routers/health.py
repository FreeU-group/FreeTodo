"""健康检查路由"""

from __future__ import annotations

from fastapi import APIRouter

from core.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict:
    return {
        "status": "ok",
        "service": settings.API_NAME,
        "version": settings.API_VERSION,
    }
