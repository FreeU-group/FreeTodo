"""工具模块 - Agent 工具调用框架"""

from lifetrace.llm.tools.base import Tool, ToolResult
from lifetrace.llm.tools.registry import ToolRegistry
from lifetrace.llm.tools.todo_crud_tools import CreateTodoTool, DeleteTodoTool, UpdateTodoTool
from lifetrace.llm.tools.todo_extraction_tools import ClarifyTodoTool, ExtractTodoTool
from lifetrace.llm.tools.todo_organize_tool import OrganizeTodosTool
from lifetrace.llm.tools.todo_query_tool import QueryTodoTool
from lifetrace.llm.tools.web_search_tool import WebSearchTool

# 初始化工具注册表并注册工具
tool_registry = ToolRegistry()
tool_registry.register(WebSearchTool())

# 注册Todo管理工具
tool_registry.register(CreateTodoTool())
tool_registry.register(UpdateTodoTool())
tool_registry.register(DeleteTodoTool())
tool_registry.register(QueryTodoTool())
tool_registry.register(ClarifyTodoTool())
tool_registry.register(ExtractTodoTool())
tool_registry.register(OrganizeTodosTool())

__all__ = ["Tool", "ToolResult", "ToolRegistry", "tool_registry"]
