"""延迟加载服务模块

解决启动时同步加载向量服务和RAG服务导致的30秒+启动延迟问题。
服务在首次访问时才进行初始化。
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from lifetrace.llm.rag_service import RAGService
    from lifetrace.llm.vector_service import VectorService

_vector_service: "VectorService | None" = None
_rag_service: "RAGService | None" = None


def get_vector_service() -> "VectorService":
    """延迟加载向量服务 - 首次访问时初始化"""
    global _vector_service
    if _vector_service is None:
        from lifetrace.llm.vector_service import create_vector_service

        _vector_service = create_vector_service()
    return _vector_service


def get_rag_service() -> "RAGService":
    """延迟加载 RAG 服务 - 首次访问时初始化"""
    global _rag_service
    if _rag_service is None:
        from lifetrace.llm.rag_service import RAGService

        _rag_service = RAGService()
    return _rag_service


def reinit_vector_service():
    """重新初始化向量服务

    在配置变更（如向量数据库设置变更）时调用。
    """
    global _vector_service
    _vector_service = None


def reinit_rag_service():
    """重新初始化 RAG 服务

    在配置变更（如 LLM API Key 或 Base URL 变更）时调用。
    同时也会重新初始化向量服务。
    """
    global _rag_service, _vector_service
    _rag_service = None
    _vector_service = None
