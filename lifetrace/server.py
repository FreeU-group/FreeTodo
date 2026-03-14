import argparse
import asyncio
import os
import socket
import sys
from contextlib import asynccontextmanager, suppress
from ipaddress import IPv4Address

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from lifetrace.core.module_registry import (
    MODULES,
    get_enabled_module_ids,
    get_module_states,
    log_module_summary,
    register_modules,
)
from lifetrace.jobs.job_manager import get_job_manager
from lifetrace.memory.manager import init_memory_manager, shutdown_memory_manager
from lifetrace.perception.manager import init_perception_manager, shutdown_perception_manager
from lifetrace.services.config_service import is_llm_configured
from lifetrace.util.base_paths import get_user_logs_dir
from lifetrace.util.logging_config import get_logger, setup_logging
from lifetrace.util.settings import settings

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
    title="FreeTodo API",
    description="FreeTodo API (part of FreeU Project)",
    version="0.1.2",
    lifespan=lifespan,
)


def _detect_server_role() -> str:
    """Detect role early so CORS middleware is configured before __main__ runs."""
    role = os.environ.get("LIFETRACE_ROLE")
    if role and role in ("standalone", "center"):
        return role
    try:
        idx = sys.argv.index("--role")
        if idx + 1 < len(sys.argv) and sys.argv[idx + 1] in ("standalone", "center"):
            return sys.argv[idx + 1]
    except (ValueError, IndexError):
        pass
    return "standalone"


_server_role: str = _detect_server_role()


def get_server_role() -> str:
    return _server_role


def get_cors_origins() -> list[str]:
    """
    生成 CORS 允许的来源列表，支持动态端口。

    为了支持 Build 版和开发版同时运行，需要允许端口范围：
    - 前端端口范围：3000-3200（包括 3200，Build 版默认端口）
    - 后端端口范围：8000-8200（包括 8200，Build 版默认端口）
    center 模式下额外允许所有来源（远程浏览器 / cpolar 域名）。
    """
    if _server_role == "center":
        return ["*"]
    origins = []
    for port in range(3000, 3201):
        origins.extend([f"http://localhost:{port}", f"http://127.0.0.1:{port}"])
    for port in range(8000, 8201):
        origins.extend([f"http://localhost:{port}", f"http://127.0.0.1:{port}"])
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
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
        from lifetrace.routers.config import (  # noqa: PLC0415
            verify_llm_connection_on_startup,
        )
    except Exception as exc:
        logger.debug(f"LLM 验证初始化跳过: {exc}")
        return
    await asyncio.to_thread(verify_llm_connection_on_startup)


async def _init_diary_illustration_async() -> None:
    """延迟初始化日记插画服务并注册定时任务"""
    try:
        from lifetrace.llm.llm_client import LLMClient  # noqa: PLC0415
        from lifetrace.services.diary_illustration_service import (  # noqa: PLC0415
            init_diary_illustration_service,
        )

        llm = LLMClient()
        if not llm.is_available():
            logger.info("DiaryIllustration: LLM not available, service not initialized")
            return

        svc = init_diary_illustration_service(llm)
        logger.info("DiaryIllustration: service initialized")

        # 注册定时任务
        job_cfg = settings.get("jobs.diary_illustration", {}) or {}
        if not job_cfg.get("enabled", False):
            return

        cron_expr: str = str(job_cfg.get("cron", "0 22 * * *"))
        # cron_expr format: "min hour dom mon dow"
        parts = cron_expr.strip().split()
        _cron_field_count = 5
        if len(parts) == _cron_field_count:
            minute, hour, day, month, day_of_week = parts
        else:
            minute, hour, day, month, day_of_week = "0", "22", "*", "*", "*"

        manager = get_job_manager()
        sched_mgr = manager.scheduler_manager if manager else None
        scheduler = sched_mgr.scheduler if sched_mgr else None
        if scheduler:
            from apscheduler.triggers.cron import CronTrigger  # noqa: PLC0415

            async def _run_daily_illustration():
                try:
                    result = await svc.generate_for_date()
                    if result["ok"]:
                        logger.info(
                            "DiaryIllustration: daily job completed, path=%s", result["path"]
                        )
                    else:
                        logger.warning(
                            "DiaryIllustration: daily job failed: %s", result.get("error")
                        )
                except Exception:
                    logger.exception("DiaryIllustration: daily job error")

            scheduler.add_job(
                _run_daily_illustration,
                trigger=CronTrigger(
                    minute=minute,
                    hour=hour,
                    day=day,
                    month=month,
                    day_of_week=day_of_week,
                ),
                id="diary_illustration_job",
                name="日记插画生成",
                replace_existing=True,
            )
            logger.info("DiaryIllustration: scheduled job registered (cron=%s)", cron_expr)

    except Exception:
        logger.exception("DiaryIllustration: initialization failed")


# 注册按配置启用的路由
_register_priority_modules(app)


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


def parse_args():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(description="LifeTrace 后端服务器")
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="服务器端口号（默认从配置文件读取）",
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default=None,
        help="数据目录路径",
    )
    parser.add_argument(
        "--mode",
        type=str,
        choices=["dev", "build"],
        default="dev",
        help="服务器模式：dev（开发模式）或 build（打包模式）",
    )
    parser.add_argument(
        "--role",
        type=str,
        choices=["standalone", "center"],
        default="standalone",
        help="部署角色：standalone（单机）或 center（中心节点，绑定 0.0.0.0）",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()

    # Persist role for uvicorn reload subprocesses (env var is inherited)
    os.environ["LIFETRACE_ROLE"] = args.role
    _server_role = args.role

    # 设置服务器模式
    from lifetrace.routers.health import set_server_mode

    set_server_mode(args.mode)

    server_host = settings.server.host
    server_port = args.port if args.port else settings.server.port
    server_debug = settings.server.debug

    if args.role == "center":
        server_host = str(IPv4Address(0))
        logger.info("Center 模式：绑定 %s，接受远程连接", server_host)

    # 强制使用指定端口，不进行自动顺延
    actual_port = server_port

    # 检查端口占用情况（仅作为提示）
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind((server_host, actual_port))
    except OSError:
        logger.error(f"端口 {actual_port} 已被占用，服务器启动失败")
        # 依然尝试启动，让 uvicorn 报错退出，避免多实例混淆
        # raise RuntimeError(f"端口 {actual_port} 已被占用")

    logger.info(f"启动服务器: http://{server_host}:{actual_port}")
    logger.info(f"服务器模式: {args.mode}  部署角色: {args.role}")
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
