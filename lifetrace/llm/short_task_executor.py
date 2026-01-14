"""短任务执行器 - 不持有 LLM，仅负责按决策调用工具"""

from typing import Any

from lifetrace.llm.agent_tool_formatter import format_tool_result
from lifetrace.llm.state import ShortTaskDecision
from lifetrace.llm.tools.registry import ToolRegistry
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class ShortTaskExecutor:
    """短任务执行器（One-step）

    约束：
    - 不持有 LLM client，也不依赖任何 LLM 抽象
    - 最多调用一次工具
    """

    def __init__(self, tool_registry: ToolRegistry | None = None) -> None:
        self._tool_registry = tool_registry or ToolRegistry()

    def execute(self, decision: ShortTaskDecision) -> dict[str, Any]:
        """根据 LLM 决策执行短任务。

        Returns:
            {
                "status": "success" | "tool_error" | "unsupported_short_task",
                "payload": str,
                "meta": {...}
            }
        """
        # 纯回答路径：不触碰工具
        if decision.decision_type == "answer_only":
            logger.info("[ShortTaskExecutor] answer_only 决策，直接返回 LLM 回答")
            return {
                "status": "success",
                "payload": decision.llm_direct_response or "",
                "meta": {
                    "decision_type": "answer_only",
                    "tool_name": None,
                    "tool_called": False,
                    "tool_success": None,
                },
            }

        # 工具执行路径
        tool_name = decision.tool_name
        tool_args = decision.tool_args or {}
        tool = self._tool_registry.get_tool(tool_name or "")
        if not tool:
            logger.warning(f"[ShortTaskExecutor] 工具不存在: {tool_name}")
            return {
                "status": "tool_error",
                "payload": f"工具 {tool_name} 不存在或不可用。",
                "meta": {
                    "decision_type": "tool",
                    "tool_name": tool_name,
                    "tool_called": False,
                    "tool_success": False,
                },
            }

        try:
            logger.info(
                "[ShortTaskExecutor] 执行工具: %s, 参数: %s",
                tool_name,
                tool_args,
            )
            tool_result = tool.execute(**tool_args)
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "[ShortTaskExecutor] 工具执行异常: %s, error=%s",
                tool_name,
                exc,
            )
            return {
                "status": "tool_error",
                "payload": f"执行工具 {tool_name} 时出错：{exc}",
                "meta": {
                    "decision_type": "tool",
                    "tool_name": tool_name,
                    "tool_called": True,
                    "tool_success": False,
                },
            }

        if not tool_result.success:
            logger.warning(
                "[ShortTaskExecutor] 工具执行失败: %s, error=%s",
                tool_name,
                tool_result.error,
            )
            return {
                "status": "tool_error",
                "payload": tool_result.error or f"执行工具 {tool_name} 失败。",
                "meta": {
                    "decision_type": "tool",
                    "tool_name": tool_name,
                    "tool_called": True,
                    "tool_success": False,
                },
            }

        # 成功执行工具，使用统一格式化函数构造文本
        formatted = format_tool_result(tool_name or "", tool_result)
        return {
            "status": "success",
            "payload": formatted,
            "meta": {
                "decision_type": "tool",
                "tool_name": tool_name,
                "tool_called": True,
                "tool_success": True,
            },
        }
