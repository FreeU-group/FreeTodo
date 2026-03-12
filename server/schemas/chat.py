"""聊天相关的 Pydantic 模型"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="allow")  # 允许额外字段，用于传递 Dify 等服务的参数

    message: str  # 发送给 LLM 的完整消息（包含 system prompt + context + user input）
    user_input: str | None = None  # 用户真正输入的内容（用于保存到历史记录）
    context: str | None = None  # 待办上下文（可选，用于 Agent 处理）
    system_prompt: str | None = None  # 系统提示词（可选）
    conversation_id: str | None = None  # 会话ID
    user_id: str | None = None  # 用户ID（用于 Agno Learning 记忆）
    use_rag: bool = True  # 是否使用RAG
    mode: str | None = None  # 前端聊天模式（ask/plan/edit/dify_test/agno 等）

    # Agno Agent 工具配置
    selected_tools: list[str] | None = (
        None  # Lifetrace 工具列表（如 ['create_todo', 'list_todos']）
    )
    external_tools: list[str] | None = None  # 外部工具列表（如 ['duckduckgo']）

    # Cowork 配置（本地文件操作）
    workspace_path: str | None = None  # 工作区目录路径（用于 Cowork 模式）
    enable_file_delete: bool = False  # 是否允许删除文件（默认不允许）

    def get_user_input_for_storage(self) -> str:
        """获取用于保存到历史记录的用户输入内容。

        优先返回 user_input 字段，如果未提供则降级返回完整 message。
        """
        return self.user_input if self.user_input is not None else self.message


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
