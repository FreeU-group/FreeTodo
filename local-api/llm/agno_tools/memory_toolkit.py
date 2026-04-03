"""MemoryToolkit for Agno Agent — personal memory recall/search tools."""

from __future__ import annotations

from agno.tools import Toolkit

from llm.agno_tools.tools.memory_tools import MemoryTools
from util.logging_config import get_logger

logger = get_logger()


class MemoryToolkit(MemoryTools, Toolkit):
    """Memory Toolkit — personal memory retrieval tools for Agno Agent.

    Tools:
    - recall_today: recall what happened today
    - recall_date: recall what happened on a specific date
    - search_memory: search memories by keyword
    - list_memory_dates: list dates with memory records
    """

    def __init__(
        self,
        lang: str = "en",
        selected_tools: list[str] | None = None,
        **kwargs,
    ):
        self.lang = lang

        all_tools = {
            "recall_today": self.recall_today,
            "recall_date": self.recall_date,
            "search_memory": self.search_memory,
            "list_memory_dates": self.list_memory_dates,
        }

        if selected_tools:
            tools = [all_tools[name] for name in selected_tools if name in all_tools]
        else:
            tools = list(all_tools.values())

        logger.info(
            "MemoryToolkit initialized with lang=%s, %d tools enabled",
            lang,
            len(tools),
        )
        super().__init__(name="memory_toolkit", tools=tools, **kwargs)
