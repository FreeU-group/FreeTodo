import asyncio
from contextlib import asynccontextmanager, suppress

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.module_registry import (
    MODULES,
    get_enabled_module_ids,
    get_module_states,
    log_module_summary,
    register_modules,
)
from jobs.job_manager import get_job_manager
from memory.manager import init_memory_manager, shutdown_memory_manager
from perception.manager import init_perception_manager, shutdown_perception_manager
from services.config_service import is_llm_configured
from util.base_paths import get_user_logs_dir
from util.logging_config import get_logger, setup_logging
from util.settings import settings

# 使用处理后的日志路径配置
logging_config = settings.get("logging").copy()
logging_config["log_path"] = str(get_user_logs_dir()) + "/"
setup_logging(logging_config)

logger = get_logger()

PRIORITY_MODULES = ("health", "config", "system", "todo", "perception")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动逻辑
    logger.info("Web服务器启动")

    # 初始化 Memory 模块（先创建 deduper，暂不订阅 Perception Stream）
    memory_config = settings.get("memory", {}) or {}
    if memory_config.get("enabled", True):
        app.state.memory_manager = await init_memory_manager(config=memory_config)

    # 初始化 Perception Stream（subscriber 可通过 MemoryDeduper 订阅 L1 去重流）
    perception_config = settings.get("perception", {}) or {}
    if perception_config.get("enabled", True):
        app.state.perception_manager = await init_perception_manager(perception_config)

    # 将 Memory 订阅到 Perception Stream（L0 写入 + L1 去重）
    mm = getattr(app.state, "memory_manager", None)
    pm = getattr(app.state, "perception_manager", None)
    if mm is not None and pm is not None:
        await mm.start(pm.stream)

    # 初始化任务管理器
    manager = get_job_manager()
    app.state.job_manager = manager
    background_tasks = []
    app.state.background_tasks = background_tasks

    # 延迟启动后台任务，避免阻塞启动流程
    background_tasks.append(asyncio.create_task(_start_job_manager_async(app)))

    # 延迟加载非优先模块
    background_tasks.append(asyncio.create_task(_register_deferred_modules(app)))

    # 延迟验证 LLM 连接
    background_tasks.append(asyncio.create_task(_verify_llm_connection_async()))

    # 延迟初始化日记插画服务
    background_tasks.append(asyncio.create_task(_init_diary_illustration_async()))

    yield

    # 关闭逻辑
    logger.error("Web服务器关闭，正在停止后台服务")

    # 停止后台任务
    for task in getattr(app.state, "background_tasks", []):
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

    # 停止所有后台任务
    manager = getattr(app.state, "job_manager", None)
    if manager:
        manager.stop_all()

    with suppress(Exception):
        await shutdown_memory_manager()

    with suppress(Exception):
        await shutdown_perception_manager()


app = FastAPI(
    title="Lifetrace API",
    description="Lifetrace API (part of FreeU Project)",
    version="0.1.2",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Session-Id"],
)

# 向量服务、RAG服务和OCR处理器均改为延迟加载
# 通过 lifetrace.core.dependencies 模块按需获取

# 全局配置状态标志
llm_configured = is_llm_configured()
config_status = "已配置" if llm_configured else "未配置，需要引导配置"
logger.info(f"LLM配置状态: {config_status}")


def _order_modules(module_ids: list[str]) -> list[str]:
    module_id_set = set(module_ids)
    return [module.id for module in MODULES if module.id in module_id_set]


def _register_priority_modules(app: FastAPI) -> None:
    states = get_module_states()
    log_module_summary(states)
    enabled_ids = get_enabled_module_ids(states)

    priority_ids = _order_modules([mid for mid in enabled_ids if mid in PRIORITY_MODULES])
    deferred_ids = _order_modules([mid for mid in enabled_ids if mid not in PRIORITY_MODULES])

    registered = register_modules(app, priority_ids, states=states)
    app.state.registered_modules = set(registered)
    app.state.deferred_modules = [
        mid for mid in deferred_ids if mid not in app.state.registered_modules
    ]

    logger.info(f"快速启动：优先加载模块: {', '.join(priority_ids) or 'none'}")
    if app.state.deferred_modules:
        logger.info(f"延迟加载模块: {', '.join(app.state.deferred_modules)}")


async def _register_deferred_modules(app: FastAPI) -> None:
    deferred_modules = getattr(app.state, "deferred_modules", [])
    if not deferred_modules:
        return

    logger.info(f"开始延迟加载 {len(deferred_modules)} 个模块")
    for module_id in deferred_modules:
        registered = register_modules(app, [module_id])
        if registered:
            app.state.registered_modules.update(registered)
        await asyncio.sleep(0)
    logger.info("延迟模块加载完成")


async def _start_job_manager_async(app: FastAPI) -> None:
    manager = getattr(app.state, "job_manager", None)
    if not manager:
        return
    await asyncio.to_thread(manager.start_all)


async def _verify_llm_connection_async() -> None:
    try:
        from routers.config import (  # noqa: PLC0415
            verify_llm_connection_on_startup,
        )
    except Exception as exc:
        logger.debug(f"LLM 验证初始化跳过: {exc}")
        return
    await asyncio.to_thread(verify_llm_connection_on_startup)


async def _init_diary_illustration_async() -> None:
    """Initialize diary illustration service and its scheduled job."""
    try:
        from services.diary_illustration_service import (  # noqa: PLC0415
            sync_diary_illustration_job,
        )

        await asyncio.to_thread(sync_diary_illustration_job, True)
    except Exception:
        logger.exception("DiaryIllustration: initialization failed")


# 注册按配置启用的路由
_register_priority_modules(app)


if __name__ == "__main__":
    server_host = settings.server.host
    server_port = settings.server.port
    server_debug = settings.server.debug

    logger.info(f"启动服务器: http://{server_host}:{server_port}")
    logger.info(f"调试模式: {'开启' if server_debug else '关闭'}")

    uvicorn.run(
        "server:app",
        host=server_host,
        port=server_port,
        reload=server_debug,
        access_log=server_debug,
        log_level="debug" if server_debug else "info",
    )
