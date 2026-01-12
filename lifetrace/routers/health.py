"""健康检查路由"""

from fastapi import APIRouter
from openai import OpenAI

from lifetrace.core.dependencies import get_ocr_processor, get_rag_service
from lifetrace.storage import db_base
from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings
from lifetrace.util.time_utils import get_utc_now

logger = get_logger()

router = APIRouter()

# 服务器模式：由命令行参数设置，默认为 "dev"
# "dev" = 开发模式（从源码运行或 pnpm dev）
# "build" = 打包模式（Electron 打包后运行）
_server_mode: str = "dev"


def set_server_mode(mode: str) -> None:
    """设置服务器模式（由 server.py 在启动时调用）"""
    global _server_mode
    _server_mode = mode
    logger.info(f"服务器模式已设置为: {mode}")


def get_server_mode() -> str:
    """获取当前服务器模式"""
    return _server_mode


@router.get("/health")
async def health_check():
    """健康检查"""
    ocr_processor = get_ocr_processor()
    return {
        "app": "lifetrace",  # 固定的应用标识，用于前端识别后端服务
        "status": "healthy",
        "server_mode": _server_mode,  # 服务器模式：dev 或 build
        "timestamp": get_utc_now(),
        "database": "connected" if db_base.engine else "disconnected",
        "ocr": "available" if ocr_processor.is_available() else "unavailable",
    }


@router.get("/health/llm")
async def llm_health_check():
    """LLM服务健康检查"""
    try:
        # 获取RAG服务（延迟加载）- 验证服务能正常初始化
        try:
            get_rag_service()
        except Exception as init_error:
            return {
                "status": "unavailable",
                "message": f"RAG服务初始化失败: {str(init_error)}",
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

        client = OpenAI(api_key=llm_key, base_url=base_url)
        model = settings.llm.model

        # 发送最小化测试请求
        response = client.chat.completions.create(  # noqa: F841
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
            "message": f"LLM服务异常: {str(e)}",
            "timestamp": get_utc_now().isoformat(),
        }
