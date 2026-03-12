"""延迟加载服务模块

解决启动时同步加载向量服务和RAG服务导致的30秒+启动延迟问题。
服务在首次访问时才进行初始化。
"""

from functools import lru_cache
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from llm.rag_service import RAGService
    from llm.vector_service import VectorService


@lru_cache(maxsize=1)
def get_vector_service() -> "VectorService":
    """延迟加载向量服务 - 首次访问时初始化"""
    from llm.vector_service import create_vector_service  # noqa: PLC0415

    return create_vector_service()


@lru_cache(maxsize=1)
def get_rag_service() -> "RAGService":
    """延迟加载 RAG 服务 - 首次访问时初始化"""
    from llm.rag_service import RAGService  # noqa: PLC0415

    return RAGService()


def reinit_vector_service():
    """重新初始化向量服务

    在配置变更（如向量数据库设置变更）时调用。
    """
    get_vector_service.cache_clear()


def reinit_rag_service():
    """重新初始化 RAG 服务

    在配置变更（如 LLM API Key 或 Base URL 变更）时调用。
    同时也会重新初始化向量服务。
    """
    get_rag_service.cache_clear()
    get_vector_service.cache_clear()
