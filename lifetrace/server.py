from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from lifetrace.jobs.job_manager import get_job_manager
from lifetrace.routers import (
    activity,
    chat,
    cost_tracking,
    event,
    health,
    journal,
    logs,
    notification,
    ocr,
    rag,
    scheduler,
    screenshot,
    search,
    system,
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


def get_cors_origins() -> list[str]:
    """
    生成 CORS 允许的来源列表，支持动态端口。

    为了支持 Build 版和开发版同时运行，需要允许端口范围：
    - 前端端口范围：3000-3099
    - 后端端口范围：8000-8099（用于 API 测试和跨域请求）
    """
    origins = []
    # 前端端口范围 3000-3099
    for port in range(3000, 3100):
        origins.extend([f"http://localhost:{port}", f"http://127.0.0.1:{port}"])
    # 后端端口范围 8000-8099
    for port in range(8000, 8100):
        origins.extend([f"http://localhost:{port}", f"http://127.0.0.1:{port}"])
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
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
app.include_router(todo.router)
app.include_router(journal.router)
app.include_router(rag.router)
app.include_router(scheduler.router)
app.include_router(cost_tracking.router)
app.include_router(time_allocation.router)
app.include_router(todo_extraction.router)
app.include_router(vision.router)
app.include_router(notification.router)


def find_available_port(host: str, start_port: int, max_attempts: int = 100) -> int:
    """
    查找可用端口。

    从 start_port 开始，依次尝试直到找到可用端口。
    支持 Build 版和开发版同时运行，自动避免端口冲突。

    Args:
        host: 绑定的主机地址
        start_port: 起始端口号
        max_attempts: 最大尝试次数

    Returns:
        可用的端口号

    Raises:
        RuntimeError: 如果在指定范围内找不到可用端口
    """
    import socket

    for offset in range(max_attempts):
        port = start_port + offset
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind((host, port))
                if offset > 0:
                    logger.info(f"端口 {start_port} 已被占用，使用端口 {port}")
                return port
        except OSError:
            continue

    raise RuntimeError(f"无法在 {start_port}-{start_port + max_attempts} 范围内找到可用端口")


if __name__ == "__main__":
    server_host = settings.server.host
    server_port = settings.server.port
    server_debug = settings.server.debug

    # 动态端口分配：如果默认端口被占用，自动尝试下一个可用端口
    try:
        actual_port = find_available_port(server_host, server_port)
    except RuntimeError as e:
        logger.error(f"端口分配失败: {e}")
        raise

    logger.info(f"启动服务器: http://{server_host}:{actual_port}")
    logger.info(f"调试模式: {'开启' if server_debug else '关闭'}")
    if actual_port != server_port:
        logger.info(f"注意: 原始端口 {server_port} 已被占用，已自动切换到 {actual_port}")

    uvicorn.run(
        "lifetrace.server:app",
        host=server_host,
        port=actual_port,
        reload=server_debug,
        access_log=server_debug,
        log_level="debug" if server_debug else "info",
    )
