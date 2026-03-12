"""工具基类定义"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class ToolResult:
    """工具执行结果"""

    success: bool
    content: str  # 工具返回的内容
    metadata: dict[str, Any] | None = None  # 额外元数据（如来源链接）
    error: str | None = None


class Tool(ABC):
    """工具基类"""

    @property
    @abstractmethod
    def name(self) -> str:
        """工具名称"""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """工具描述，用于 LLM 选择工具"""
        pass

    @property
    @abstractmethod
    def parameters_schema(self) -> dict:
        """工具参数 JSON Schema，用于 LLM 生成参数"""
        pass

    @abstractmethod
    def execute(self, **kwargs) -> ToolResult:
        """执行工具"""
        pass

    def is_available(self) -> bool:
        """检查工具是否可用"""
        return True
