"""路由依赖项 - 共享的全局对象和函数"""

import uuid
from collections import defaultdict
from datetime import datetime
from typing import Any

from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 全局依赖对象 - 在 server.py 中初始化
ocr_processor = None
vector_service = None
rag_service = None
behavior_tracker = None
config = None
workspace_manager = None

# 会话管理
chat_sessions = defaultdict(dict)

# 配置状态标志
is_llm_configured = False


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


def init_dependencies(
    ocr_proc,
    vec_service,
    rag_svc,
    cfg,
    is_llm_config,
    workspace_mgr=None,
):
    """初始化全局依赖"""
    global ocr_processor, vector_service
    global rag_service, config, is_llm_configured, workspace_manager

    ocr_processor = ocr_proc
    vector_service = vec_service
    rag_service = rag_svc
    config = cfg
    is_llm_configured = is_llm_config
    workspace_manager = workspace_mgr
