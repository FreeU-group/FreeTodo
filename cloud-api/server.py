"""Cloud API 服务入口 — FastAPI + PostgreSQL + Redis"""

from __future__ import annotations

from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from core.config import settings
from core.database import async_session_factory, close_db, init_db
from core.redis import close_redis, get_redis
from services.membership_service import init_default_plans


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Cloud API 启动中...")

    # 开发环境自动建表（生产使用 alembic upgrade head）
    if settings.ENV == "dev":
        await init_db()
        logger.info("开发环境：数据库表已自动创建/校验")

    # 初始化默认会员计划
    async with async_session_factory() as session:
        await init_default_plans(session)

    # 测试 Redis 连接
    try:
        redis = await get_redis()
        await redis.ping()
        logger.info("Redis 连接成功")
    except Exception as e:
        logger.warning("Redis 连接失败: %s", e)

    yield

    await close_redis()
    await close_db()
    logger.info("Cloud API 已关闭")


app = FastAPI(
    title="FreeTodo Cloud API",
    description="FreeTodo 云端用户系统、认证、会员与数据同步服务",
    version=settings.API_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
from routers.admin import router as admin_router  # noqa: E402
from routers.auth import router as auth_router  # noqa: E402
from routers.health import router as health_router  # noqa: E402
from routers.notification import router as notification_router  # noqa: E402
from routers.sync import router as sync_router  # noqa: E402
from routers.sync_ws import router as sync_ws_router  # noqa: E402
from routers.user import router as user_router  # noqa: E402

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(user_router)
app.include_router(admin_router)
app.include_router(sync_router)
app.include_router(sync_ws_router)
app.include_router(notification_router)

if __name__ == "__main__":
    logger.info(
        "启动 Cloud API: http://%s:%s", settings.API_HOST, settings.API_PORT
    )
    uvicorn.run(
        "server:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.API_RELOAD,
    )
