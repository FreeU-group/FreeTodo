from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from lifetrace.jobs.job_manager import get_job_manager
from lifetrace.routers import (
    activity,
    chat,
    context,
    cost_tracking,
    event,
    health,
    journal,
    logs,
    ocr,
    project,
    rag,
    scheduler,
    screenshot,
    search,
    system,
    task,
    time_allocation,
    todo,
    todo_extraction,
    vector,
    vision,
)
from lifetrace.routers import config as config_router
from lifetrace.services.config_service import is_llm_configured
from lifetrace.util.logging_config import get_logger, setup_logging
from lifetrace.util.path_utils import get_user_logs_dir
from lifetrace.util.settings import settings

# 使用处理后的日志路径配置
logging_config = settings.get("logging").copy()
logging_config["log_path"] = str(get_user_logs_dir()) + "/"
setup_logging(logging_config)

logger = get_logger()

# 全局管理器实例
job_manager = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global job_manager

    # 启动逻辑
    logger.info("Web服务器启动")

    # 初始化任务管理器
    job_manager = get_job_manager()

    # 启动所有后台任务
    job_manager.start_all()

    yield

    # 关闭逻辑
    logger.error("Web服务器关闭，正在停止后台服务")

    # 停止所有后台任务
    if job_manager:
        job_manager.stop_all()


app = FastAPI(
    title="LifeTrace API",
    description="智能生活记录系统 API",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Session-Id"],  # 允许前端读取会话ID，支持多轮对话
)

# 向量服务、RAG服务和OCR处理器均改为延迟加载
# 通过 lifetrace.core.dependencies 模块按需获取

# 全局配置状态标志
llm_configured = is_llm_configured()
config_status = "已配置" if llm_configured else "未配置，需要引导配置"
logger.info(f"LLM配置状态: {config_status}")


# 注册所有路由
app.include_router(health.router)
app.include_router(config_router.router)
app.include_router(chat.router)
app.include_router(activity.router)
app.include_router(search.router)
app.include_router(screenshot.router)
app.include_router(event.router)
app.include_router(ocr.router)
app.include_router(vector.router)
app.include_router(system.router)
app.include_router(logs.router)
app.include_router(project.router)
app.include_router(task.router)
app.include_router(todo.router)
app.include_router(journal.router)
app.include_router(context.router)
app.include_router(rag.router)
app.include_router(scheduler.router)
app.include_router(cost_tracking.router)
app.include_router(time_allocation.router)
app.include_router(todo_extraction.router)
app.include_router(vision.router)


if __name__ == "__main__":
    server_host = settings.server.host
    server_port = settings.server.port
    server_debug = settings.server.debug

    logger.info(f"启动服务器: http://{server_host}:{server_port}")
    logger.info(f"调试模式: {'开启' if server_debug else '关闭'}")
    uvicorn.run(
        "lifetrace.server:app",
        host=server_host,
        port=server_port,
        reload=server_debug,
        access_log=server_debug,
        log_level="debug" if server_debug else "info",
    )
