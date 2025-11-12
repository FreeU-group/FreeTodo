"""聊天相关的 Pydantic 模型"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ChatMessage(BaseModel):
    message: str


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
    chat_type: str = "event"  # 默认为 event 类型
    context_id: int | None = None  # 上下文ID（如 project_id）


class NewChatResponse(BaseModel):
    session_id: str
    message: str
    timestamp: datetime
