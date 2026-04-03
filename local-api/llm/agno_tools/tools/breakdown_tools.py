"""Task Breakdown Tools

Tools for breaking down complex tasks into subtasks.
The Agent directly breaks down tasks without nested LLM calls for better performance.
"""

from __future__ import annotations

from llm.agno_tools.base import get_message
from util.logging_config import get_logger

logger = get_logger()


class BreakdownTools:
    """Task breakdown tools mixin"""

    lang: str

    def _msg(self, key: str, **kwargs) -> str:
        return get_message(self.lang, key, **kwargs)

    def breakdown_task(self, task_description: str) -> str:
        """Break down a complex task into subtasks

        This tool provides context for task breakdown. The Agent should directly
        break down the task into subtasks without calling LLM again.

        Args:
            task_description: Description of the task to break down

        Returns:
            Instructions for the Agent to break down the task directly
        """
        # 返回拆解指导信息，让 Agent 自己完成拆解
        # 这样可以避免嵌套 LLM 调用，提升性能
        breakdown_guide = self._msg("breakdown_guide", task_description=task_description)
        return breakdown_guide
