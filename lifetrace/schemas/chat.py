"""聊天相关的 Pydantic 模型"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="allow")  # 允许额外字段，用于传递 Dify 等服务的参数

    message: str
    conversation_id: str | None = None  # 会话ID
    use_rag: bool = True  # 是否使用RAG
    mode: str | None = None  # 前端聊天模式（ask/plan/edit/dify_test 等）


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


class PlanQuestionnaireRequest(BaseModel):
    todo_name: str
    todo_id: int | None = None  # 新增：用于查询上下文
    session_id: str | None = None  # 会话ID，用于保存聊天记录


class PlanSummaryRequest(BaseModel):
    todo_name: str
    answers: dict[str, list[str]]  # question_id -> selected_options
    session_id: str | None = None  # 会话ID，用于保存聊天记录
