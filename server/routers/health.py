"""健康检查路由"""

import os
import shutil
import subprocess  # nosec B404
from functools import lru_cache

from fastapi import APIRouter

from util.logging_config import get_logger
from util.settings import settings
from util.time_utils import get_utc_now

logger = get_logger()

router = APIRouter()


@lru_cache(maxsize=1)
def get_git_commit() -> str:
    """获取当前 Git Commit（优先读取环境变量，失败时返回 unknown）"""
    env_commit = os.getenv("LIFETRACE_GIT_COMMIT") or os.getenv("GIT_COMMIT")
    if env_commit:
        return env_commit

    git_path = shutil.which("git")
    if not git_path:
        return "unknown"

    try:
        return subprocess.check_output(  # nosec B603
            [git_path, "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
    except Exception:
        return "unknown"


@router.api_route("/", methods=["GET", "HEAD"])
async def root():
    """根路径，避免 HEAD / 404"""
    return {"app": "lifetrace", "status": "ok"}


@router.get("/health")
async def health_check():
    """健康检查"""
    from storage import db_base  # noqa: PLC0415

    return {
        "app": "lifetrace",  # 固定的应用标识，用于前端识别后端服务
        "status": "healthy",
        "git_commit": get_git_commit(),
        "timestamp": get_utc_now(),
        "database": "connected" if db_base.engine else "disconnected",
    }


@router.get("/health/llm")
async def llm_health_check():
    """LLM服务健康检查"""
    try:
        # 获取RAG服务（延迟加载）- 验证服务能正常初始化
        try:
            from core.dependencies import get_rag_service  # noqa: PLC0415

            get_rag_service()
        except Exception as init_error:
            return {
                "status": "unavailable",
                "message": f"RAG服务初始化失败: {init_error!s}",
                "timestamp": get_utc_now().isoformat(),
            }

        # 检查配置是否完整
        llm_key = settings.llm.api_key
        base_url = settings.llm.base_url

        if not llm_key or not base_url:
            return {
                "status": "unconfigured",
                "message": "LLM配置不完整，请设置API Key和Base URL",
                "timestamp": get_utc_now().isoformat(),
            }

        try:
            from openai import OpenAI  # noqa: PLC0415
        except Exception as exc:
            logger.error(f"OpenAI 依赖未安装: {exc}")
            return {
                "status": "error",
                "message": f"OpenAI 依赖未安装: {exc}",
                "timestamp": get_utc_now().isoformat(),
            }

        client = OpenAI(api_key=llm_key, base_url=base_url)
        model = settings.llm.model

        # 发送最小化测试请求
        client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "test"}],
            max_tokens=5,
            timeout=10,
        )

        return {
            "status": "healthy",
            "message": "LLM服务正常",
            "model": model,
            "timestamp": get_utc_now().isoformat(),
        }

    except Exception as e:
        logger.error(f"LLM健康检查失败: {e}")
        return {
            "status": "error",
            "message": f"LLM服务异常: {e!s}",
            "timestamp": get_utc_now().isoformat(),
        }
