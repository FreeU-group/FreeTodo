"""计划编辑器相关的 Pydantic 模型"""

from pydantic import BaseModel


class TodoItem(BaseModel):
    id: str
    title: str
    checked: bool
    content: str | None = None


class PlanContent(BaseModel):
    title: str
    description: str
    todos: list[TodoItem]
