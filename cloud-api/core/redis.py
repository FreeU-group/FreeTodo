"""Redis 连接管理 — 用于验证码缓存与限流"""

from __future__ import annotations

import redis.asyncio as aioredis
from loguru import logger

from core.config import settings

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis  # noqa: PLW0603
    if _redis is None:
        _redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
        )
    return _redis


async def close_redis() -> None:
    global _redis  # noqa: PLW0603
    if _redis is not None:
        await _redis.close()
        _redis = None
        logger.info("Redis 连接已关闭")
