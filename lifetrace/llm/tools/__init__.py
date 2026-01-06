"""工具模块 - Agent 工具调用框架"""

from lifetrace.llm.tools.base import Tool, ToolResult
from lifetrace.llm.tools.registry import ToolRegistry
from lifetrace.llm.tools.todo_tools import (
    ClarifyTodoTool,
    CreateTodoTool,
    DeleteTodoTool,
    ExtractTodoTool,
    OrganizeTodosTool,
    QueryProjectTool,
    QueryTodoTool,
    UpdateTodoTool,
)
from lifetrace.llm.tools.web_search_tool import WebSearchTool

# 初始化工具注册表并注册工具
tool_registry = ToolRegistry()
tool_registry.register(WebSearchTool())

# 注册Todo管理工具
tool_registry.register(CreateTodoTool())
tool_registry.register(UpdateTodoTool())
tool_registry.register(DeleteTodoTool())
tool_registry.register(QueryTodoTool())
tool_registry.register(QueryProjectTool())
tool_registry.register(ClarifyTodoTool())
tool_registry.register(ExtractTodoTool())
tool_registry.register(OrganizeTodosTool())

__all__ = ["Tool", "ToolResult", "ToolRegistry", "tool_registry"]
