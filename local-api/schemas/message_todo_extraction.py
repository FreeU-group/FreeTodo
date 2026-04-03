"""从消息中提取待办相关的 Pydantic 模型"""

from pydantic import BaseModel, Field


class MessageTodoExtractionRequest(BaseModel):
    """从消息中提取待办的请求模型"""

    messages: list[dict[str, str]] = Field(
        ...,
        description="消息列表，包含 role 和 content 字段",
    )
    parent_todo_id: int | None = Field(
        None,
        description="父待办ID，提取的待办将作为该待办的子待办",
    )
    todo_context: str | None = Field(
        None,
        description="待办上下文信息，用于帮助AI理解关联的待办",
    )


class ExtractedMessageTodo(BaseModel):
    """从消息中提取的待办项结构"""

    name: str = Field(..., description="待办名称", min_length=1, max_length=100)
    description: str | None = Field(None, description="待办描述（可选）", max_length=500)
    tags: list[str] = Field(default_factory=list, description="标签列表")


class MessageTodoExtractionResponse(BaseModel):
    """从消息中提取待办的响应模型"""

    todos: list[ExtractedMessageTodo] = Field(
        default_factory=list,
        description="提取的待办列表",
    )
    error_message: str | None = Field(None, description="错误信息（如果有）")
