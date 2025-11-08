import threading
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from lifetrace.util.config import config
from lifetrace.util.logging_config import get_logger, setup_logging
from lifetrace.llm.multimodal_vector_service import (
    create_multimodal_vector_service,
)
from lifetrace.llm.rag_service import RAGService
from lifetrace.tool.ocr import SimpleOCRProcessor, ocr_service
from lifetrace.storage import db_manager
from lifetrace.llm.vector_service import create_vector_service
from lifetrace.tool.recorder import ScreenRecorder
from lifetrace.routers import dependencies as deps
from lifetrace.routers import (
    behavior,
    chat,
    config as config_router,
    event,
    health,
    logs,
    ocr,
    plan,
    project,
    rag,
    screenshot,
    search,
    system,
    task,
    vector,
)

setup_logging(config.get("logging"))

logger = get_logger()

# 后台服务控制
recorder_instance = None
recorder_thread = None
ocr_thread = None
stop_background_services = threading.Event()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global recorder_thread, ocr_thread

    # 启动逻辑
    logger.info("Web服务器启动")

    # 启动配置文件监听
    config.register_callback(on_config_change)
    config.start_watching()
    logger.info("已启动配置文件监听")

    # 启动录制器后台线程
    stop_background_services.clear()
    recorder_thread = threading.Thread(
        target=recorder_background_task,
        daemon=True,
        name="RecorderThread"
    )
    recorder_thread.start()
    logger.info("录制器后台线程已启动")

    # 启动OCR后台线程
    ocr_thread = threading.Thread(
        target=ocr_background_task,
        daemon=True,
        name="OCRThread"
    )
    ocr_thread.start()
    logger.info("OCR后台线程已启动")

    logger.info("所有后台服务已启动")

    yield

    # 关闭逻辑
    global recorder_instance
    logger.info("Web服务器关闭，正在停止后台服务")

    # 设置停止标志
    stop_background_services.set()

    # 停止录制器
    if recorder_instance:
        try:
            logger.info("正在停止录制器...")
        except Exception as e:
            logger.error(f"停止录制器失败: {e}")

    # 等待线程结束（最多等待5秒）
    if recorder_thread and recorder_thread.is_alive():
        recorder_thread.join(timeout=5)
        if recorder_thread.is_alive():
            logger.warning("录制器线程未能在超时时间内停止")
        else:
            logger.info("录制器线程已停止")

    if ocr_thread and ocr_thread.is_alive():
        ocr_thread.join(timeout=5)
        if ocr_thread.is_alive():
            logger.warning("OCR线程未能在超时时间内停止")
        else:
            logger.info("OCR线程已停止")

    # 停止配置文件监听
    config.stop_watching()
    logger.info("已停止配置文件监听")


app = FastAPI(
    title="LifeTrace API",
    description="智能生活记录系统 API",
    version="0.1.0",
    lifespan=lifespan
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
vector_service = create_vector_service(config, db_manager)

# 初始化多模态向量数据库服务
multimodal_vector_service = create_multimodal_vector_service(
    config, db_manager
)

# 初始化RAG服务 - 从配置文件读取API配置
rag_service = RAGService(
    db_manager=db_manager,
    api_key=config.llm_api_key,
    base_url=config.llm_base_url,
    model=config.llm_model,
)
logger.info(
    f"RAG服务初始化完成 - 模型: {config.llm_model}, "
    f"Base URL: {config.llm_base_url}"
)

# 全局配置状态标志
is_llm_configured = config.is_configured()
config_status = "已配置" if is_llm_configured else "未配置，需要引导配置"
logger.info(f"LLM配置状态: {config_status}")

# 初始化路由依赖
deps.init_dependencies(
    db_manager,
    ocr_processor,
    vector_service,
    multimodal_vector_service,
    rag_service,
    config,
    logger,
    is_llm_configured,
)


def on_config_change(old_config: dict, new_config: dict):
    """配置变更回调函数"""
    try:
        # 检查LLM配置是否变更
        old_llm = old_config.get("llm", {})
        new_llm = new_config.get("llm", {})

        if old_llm != new_llm:
            logger.info("检测到LLM配置变更")

            # 更新配置状态
            deps.is_llm_configured = config.is_configured()
            status = "已配置" if deps.is_llm_configured else "未配置"
            logger.info(f"LLM配置状态已更新: {status}")

            # 注意：根据计划，不重新初始化RAG服务
            logger.info("配置已更新，RAG服务将使用新配置（不重新初始化）")

        # 记录其他配置变更
        if old_config.get("server") != new_config.get("server"):
            logger.info("检测到服务器配置变更")

        if old_config.get("record") != new_config.get("record"):
            logger.info("检测到录制配置变更")

        if old_config.get("ocr") != new_config.get("ocr"):
            logger.info("检测到OCR配置变更")

    except Exception as e:
        logger.error(f"处理配置变更失败: {e}")


def recorder_background_task():
    """录制器后台任务"""
    global recorder_instance
    try:
        logger.info("启动录制器后台服务")
        recorder_instance = ScreenRecorder()
        recorder_instance.start_recording()
    except Exception as e:
        logger.error(f"录制器后台服务异常: {e}", exc_info=True)


def ocr_background_task():
    """OCR处理器后台任务"""
    try:
        logger.info("启动OCR后台服务")
        ocr_service()
    except Exception as e:
        logger.error(f"OCR后台服务异常: {e}", exc_info=True)


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
app.include_router(plan.router)
app.include_router(project.router)
app.include_router(task.router)
app.include_router(rag.router)


if __name__ == "__main__":
    logger.info(f"启动服务器: http://{config.server_host}:{config.server_port}")
    uvicorn.run(
        app,
        host=config.server_host,
        port=config.server_port,
        reload=False,
        access_log=False,
    )
