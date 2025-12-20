"""路由依赖项 - 会话管理相关功能

此模块仅保留聊天会话管理功能。
其他依赖（如 OCR 处理器、配置等）已迁移到 core/dependencies.py 模块。
"""

import uuid
from collections import defaultdict
from datetime import datetime
from typing import Any

from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 会话管理
chat_sessions = defaultdict(dict)


def generate_session_id() -> str:
    """生成新的会话ID"""
    return str(uuid.uuid4())


def create_new_session(session_id: str = None) -> str:
    """创建新的聊天会话"""
    if not session_id:
        session_id = generate_session_id()

    chat_sessions[session_id] = {
        "context": [],
        "created_at": datetime.now(),
        "last_active": datetime.now(),
    }

    logger.info(f"创建新会话: {session_id}")
    return session_id


def clear_session_context(session_id: str) -> bool:
    """清除会话上下文"""
    if session_id in chat_sessions:
        chat_sessions[session_id]["context"] = []
        chat_sessions[session_id]["last_active"] = datetime.now()
        logger.info(f"清除会话上下文: {session_id}")
        return True
    return False


def get_session_context(session_id: str) -> list[dict[str, Any]]:
    """获取会话上下文"""
    if session_id in chat_sessions:
        chat_sessions[session_id]["last_active"] = datetime.now()
        return chat_sessions[session_id]["context"]
    return []


def add_to_session_context(session_id: str, role: str, content: str):
    """添加消息到会话上下文"""
    if session_id not in chat_sessions:
        create_new_session(session_id)

    chat_sessions[session_id]["context"].append(
        {"role": role, "content": content, "timestamp": datetime.now()}
    )
    chat_sessions[session_id]["last_active"] = datetime.now()

    # 限制上下文长度，避免内存过度使用
    max_context_length = 50
    if len(chat_sessions[session_id]["context"]) > max_context_length:
        chat_sessions[session_id]["context"] = chat_sessions[session_id]["context"][
            -max_context_length:
        ]


# ========== 向后兼容的延迟加载服务访问 ==========
# 这些函数提供向后兼容性，推荐直接使用 core.dependencies 模块


def get_vector_service():
    """向后兼容：获取向量服务（延迟加载）"""
    from lifetrace.core.dependencies import get_vector_service as core_get

    return core_get()


def get_rag_service():
    """向后兼容：获取 RAG 服务（延迟加载）"""
    from lifetrace.core.dependencies import get_rag_service as core_get

    return core_get()
