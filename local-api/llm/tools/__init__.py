"""工具模块 - Agent 工具调用框架"""

from llm.tools.base import Tool, ToolResult
from llm.tools.registry import ToolRegistry
from llm.tools.web_search_tool import WebSearchTool

# 初始化工具注册表并注册工具
tool_registry = ToolRegistry()
tool_registry.register(WebSearchTool())

__all__ = ["Tool", "ToolRegistry", "ToolResult", "tool_registry"]
