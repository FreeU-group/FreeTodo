from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from lifetrace.jobs.job_manager import get_job_manager
from lifetrace.jobs.ocr import SimpleOCRProcessor
from lifetrace.llm.rag_service import RAGService
from lifetrace.llm.vector_service import create_vector_service
from lifetrace.routers import (
    behavior,
    chat,
    context,
    cost_tracking,
    event,
    health,
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
    vector,
)
from lifetrace.routers import config as config_router
from lifetrace.routers import dependencies as deps
from lifetrace.util.config import config
from lifetrace.util.config_watcher import ConfigChangeType, get_config_watcher
from lifetrace.util.llm_config_handler import get_llm_config_handler
from lifetrace.util.logging_config import get_logger, setup_logging

# 使用处理后的日志路径配置
logging_config = config.get("logging", {}).copy()
logging_config["log_path"] = config.log_path
setup_logging(logging_config)

logger = get_logger()

# 全局管理器实例
job_manager = None
config_watcher = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global job_manager, config_watcher

    # 启动逻辑
    logger.info("Web服务器启动")

    # 初始化配置监听管理器
    config_watcher = get_config_watcher()

    # 初始化 LLM 配置处理器
    llm_config_handler = get_llm_config_handler(deps, config)

    # 初始化任务管理器
    job_manager = get_job_manager()

    # 注册配置变更处理器
    config_watcher.register_handler(ConfigChangeType.LLM, llm_config_handler)
    config_watcher.register_handler(ConfigChangeType.JOBS, job_manager)

    # 启动配置文件监听
    config_watcher.start_watching()

    # 启动所有后台任务
    job_manager.start_all()

    yield

    # 关闭逻辑
    logger.error("Web服务器关闭，正在停止后台服务")

    # 停止所有后台任务
    if job_manager:
        job_manager.stop_all()

    # 停止配置文件监听
    if config_watcher:
        config_watcher.stop_watching()


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
)

# 初始化OCR处理器
ocr_processor = SimpleOCRProcessor()

# 初始化向量数据库服务
vector_service = create_vector_service(config)

# 初始化RAG服务 - 从配置文件读取API配置
rag_service = RAGService()
logger.info(f"RAG服务初始化完成 - 模型: {config.llm_model}, Base URL: {config.llm_base_url}")

# 全局配置状态标志
is_llm_configured = config.is_configured()
config_status = "已配置" if is_llm_configured else "未配置，需要引导配置"
logger.info(f"LLM配置状态: {config_status}")

# 初始化路由依赖
deps.init_dependencies(
    ocr_processor,
    vector_service,
    rag_service,
    config,
    is_llm_configured,
)


# 注册所有路由
app.include_router(health.router)
app.include_router(config_router.router)
app.include_router(chat.router)
app.include_router(search.router)
app.include_router(screenshot.router)
app.include_router(event.router)
app.include_router(ocr.router)
app.include_router(vector.router)
app.include_router(system.router)
app.include_router(logs.router)
app.include_router(behavior.router)
app.include_router(project.router)
app.include_router(task.router)
app.include_router(context.router)
app.include_router(rag.router)
app.include_router(scheduler.router)
app.include_router(cost_tracking.router)
app.include_router(time_allocation.router)


if __name__ == "__main__":
    logger.info(f"启动服务器: http://{config.server_host}:{config.server_port}")
    logger.info(f"调试模式: {'开启' if config.server_debug else '关闭'}")
    uvicorn.run(
        "lifetrace.server:app",
        host=config.server_host,
        port=config.server_port,
        reload=config.server_debug,
        access_log=config.server_debug,
        log_level="debug" if config.server_debug else "info",
    )
