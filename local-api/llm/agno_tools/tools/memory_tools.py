"""Memory Tools mixin for Agno Agent.

Provides personal memory read/search capabilities as Agent skills.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from memory.manager import MemoryManager

_lazy_manager: MemoryManager | None = None


def _get_manager() -> MemoryManager | None:
    """Get or lazily create a read-only MemoryManager.

    The server process initialises the global singleton via
    ``init_memory_manager()``.  In other processes (e.g. AgentOS) the
    singleton is ``None``, so we fall back to creating a lightweight,
    read-only manager that can still browse the memory files on disk.
    """
    global _lazy_manager  # noqa: PLW0603

    from memory.manager import try_get_memory_manager  # noqa: PLC0415

    mgr = try_get_memory_manager()
    if mgr is not None:
        return mgr

    if _lazy_manager is not None:
        return _lazy_manager

    try:
        from memory.manager import MemoryManager  # noqa: PLC0415

        _lazy_manager = MemoryManager(config={"auto_compress": False})
        return _lazy_manager
    except Exception:
        return None


class MemoryTools:
    """Mixin providing memory-related tool methods.

    Expected attributes set by the owning Toolkit:
        lang: str
    """

    lang: str

    def recall_today(self) -> str:
        """回忆今天发生了什么。

        Returns:
            今天的事件摘要或原始感知记录。
        """
        mgr = _get_manager()
        if mgr is None:
            return "Memory 模块未初始化。"

        from util.time_utils import local_today_str  # noqa: PLC0415

        today = local_today_str()
        content = mgr.reader.read_by_date(today)
        if content:
            return content
        return f"今天（{today}）还没有任何记忆记录。"

    def recall_date(self, date: str) -> str:
        """回忆指定日期发生了什么。

        Args:
            date: 日期，格式 YYYY-MM-DD

        Returns:
            该日期的事件摘要或原始记录。
        """
        mgr = _get_manager()
        if mgr is None:
            return "Memory 模块未初始化。"

        content = mgr.reader.read_by_date(date)
        if content:
            return content
        return f"{date} 没有找到记忆记录。"

    def search_memory(self, keyword: str, days: int = 7) -> str:
        """按关键词搜索最近的记忆。

        Args:
            keyword: 搜索关键词
            days: 搜索最近多少天（默认7天）

        Returns:
            匹配的记忆片段。
        """
        mgr = _get_manager()
        if mgr is None:
            return "Memory 模块未初始化。"

        results = mgr.reader.search_keyword(keyword, days=days, max_results=5)
        if not results:
            return f"在最近 {days} 天内没有找到与「{keyword}」相关的记忆。"

        output = f"找到 {len(results)} 条与「{keyword}」相关的记忆：\n\n"
        for r in results:
            output += f"### {r.date}（{r.level.value}）\n"
            output += r.snippet + "\n\n"
        return output

    def list_memory_dates(self) -> str:
        """列出所有有记忆记录的日期。

        Returns:
            日期列表。
        """
        mgr = _get_manager()
        if mgr is None:
            return "Memory 模块未初始化。"

        dates = mgr.reader.list_available_dates()
        if not dates:
            return "还没有任何记忆记录。"
        return "有记忆记录的日期：\n" + "\n".join(f"- {d}" for d in dates[:30])
