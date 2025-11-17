"""聊天相关的 Pydantic 模型"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ChatMessage(BaseModel):
    message: str
    conversation_id: str | None = None  # 会话ID
    project_id: int | None = None  # 项目ID，用于过滤上下文
    task_ids: list[int] | None = None  # 选中的任务ID列表
    use_rag: bool = True  # 是否使用RAG


class ChatMessageWithContext(BaseModel):
    message: str
    conversation_id: str | None = None
    event_context: list[dict[str, Any]] | None = None  # 新增事件上下文


class ChatResponse(BaseModel):
    response: str
    timestamp: datetime
    query_info: dict[str, Any] | None = None
    retrieval_info: dict[str, Any] | None = None
    performance: dict[str, Any] | None = None
    session_id: str | None = None


class NewChatRequest(BaseModel):
    session_id: str | None = None


class NewChatResponse(BaseModel):
    session_id: str
    message: str
    timestamp: datetime


class AddMessageRequest(BaseModel):
    role: str
    content: str
