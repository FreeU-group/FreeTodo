"""工具模块 - Agent 工具调用框架"""

from lifetrace.llm.tools.base import Tool, ToolResult
from lifetrace.llm.tools.registry import ToolRegistry
from lifetrace.llm.tools.web_search_tool import WebSearchTool

# 初始化工具注册表并注册工具
tool_registry = ToolRegistry()
tool_registry.register(WebSearchTool())

__all__ = ["Tool", "ToolResult", "ToolRegistry", "tool_registry"]
