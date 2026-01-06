"""工具注册表"""

from lifetrace.llm.tools.base import Tool
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class ToolRegistry:
    """工具注册表（单例）"""

    _instance = None
    _tools: dict[str, Tool] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def register(self, tool: Tool):
        """注册工具"""
        self._tools[tool.name] = tool
        logger.info(f"注册工具: {tool.name}")

    def get_tool(self, name: str) -> Tool | None:
        """获取工具"""
        return self._tools.get(name)

    def get_available_tools(self) -> list[Tool]:
        """获取所有可用工具"""
        return [tool for tool in self._tools.values() if tool.is_available()]

    def get_tools_schema(self) -> list[dict]:
        """获取所有工具的 JSON Schema（用于 LLM）"""
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters_schema,
            }
            for tool in self.get_available_tools()
        ]
