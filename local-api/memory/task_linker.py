"""L3 TaskLinker — associate L2 event summaries with active Todos.

After L2 compression produces a day's event summaries, TaskLinker uses an LLM
to match each event against the active Todo list.  Matched events are appended
to ``tasks_L3/{slug}.md``; unmatched events are silently skipped.
"""

from __future__ import annotations

import asyncio
import json
import re
import unicodedata
from typing import TYPE_CHECKING

from util.logging_config import get_logger

if TYPE_CHECKING:
    from pathlib import Path

    from llm.llm_client import LLMClient

logger = get_logger()

LINK_SYSTEM_PROMPT = (
    "你是一个任务关联助手。判断一个事件摘要属于哪个待办任务。\n"
    "只输出一个 JSON：\n"
    '{"todo_index": <匹配的待办序号, 从1开始, 无匹配则为0>, '
    '"confidence": <0.0~1.0>, "reason": "简要原因"}'
)

LINK_USER_TEMPLATE = """当前活跃的待办任务列表：
{todos}

需要归类的事件摘要：
{event_text}

判断规则：
- 如果这个事件明显属于某个待办任务（主题相关、人物相关、项目相关），输出对应序号
- 如果不确定或不属于任何任务，todo_index 输出 0
- confidence 代表你的把握程度
"""


def _slugify(text: str, max_len: int = 60) -> str:
    """Turn a Todo name into a safe filesystem slug."""
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[\\/:*?\"<>|]", "_", text)
    text = text.strip().strip(".")
    return text[:max_len] if text else "unknown"


class TaskLinker:
    """L3: link L2 event summaries to active Todos, producing task files.

    Each active Todo that has at least one linked event gets a Markdown file
    at ``tasks_L3/{slug}.md`` with a chronological list of related event summaries.
    """

    def __init__(
        self,
        memory_dir: Path,
        llm_client: LLMClient,
        *,
        model: str = "qwen-flash",
    ):
        self._memory_dir = memory_dir
        self._tasks_dir = memory_dir / "tasks_L3"
        self._tasks_dir.mkdir(parents=True, exist_ok=True)
        self._events_dir = memory_dir / "events_L2"
        self._llm = llm_client
        self._model = model

        self._stats = {"total_events": 0, "linked": 0, "unlinked": 0, "errors": 0}

    MIN_LINK_CONFIDENCE = 0.5

    def get_stats(self) -> dict:
        return dict(self._stats)

    async def link_day(self, date_str: str) -> int:
        """Link all L2 events for *date_str* to active Todos.

        Returns the number of successfully linked events.
        """
        events_file = self._events_dir / f"{date_str}.md"
        if not events_file.exists():
            logger.debug(f"No events file for {date_str}, skipping task linking")
            return 0

        events_content = events_file.read_text(encoding="utf-8")
        event_blocks = self._split_events(events_content)
        if not event_blocks:
            return 0

        todos_text = self._load_todos_snapshot()
        if not todos_text:
            logger.debug(f"No active todos, skipping task linking for {date_str}")
            return 0

        todo_names = self._parse_todo_names(todos_text)

        linked = 0
        for block in event_blocks:
            self._stats["total_events"] += 1
            result = await self._match_event(block, todos_text)
            if result and 1 <= result["index"] <= len(todo_names):
                todo_name = todo_names[result["index"] - 1]
                await self._append_to_task_file(todo_name, date_str, block)
                linked += 1
                self._stats["linked"] += 1
            else:
                self._stats["unlinked"] += 1

        if linked:
            logger.info(f"TaskLinker: linked {linked}/{len(event_blocks)} events for {date_str}")
        return linked

    def _load_todos_snapshot(self) -> str:
        """Load active todos via MemoryReader's bridge."""
        try:
            from memory.reader import MemoryReader  # noqa: PLC0415

            reader = MemoryReader(self._memory_dir)
            return reader.get_active_todos_snapshot()
        except Exception:
            logger.debug("Failed to load todos snapshot", exc_info=True)
            return ""

    @staticmethod
    def _parse_todo_names(todos_text: str) -> list[str]:
        """Extract todo names in order from the snapshot text."""
        names: list[str] = []
        for line in todos_text.strip().split("\n"):
            match = re.match(r"\d+\.\s*\[[^\]]*\]\s*(.+?)(?:\s*\(|$)", line)
            if match:
                name = match.group(1).strip()
                names.append(name)
        return names

    @staticmethod
    def _split_events(content: str) -> list[str]:
        """Split an L2 events Markdown file into individual event blocks."""
        blocks: list[str] = []
        current: list[str] = []
        for line in content.split("\n"):
            if line.startswith("## Event:") or line.startswith("## event:"):
                if current:
                    blocks.append("\n".join(current).strip())
                current = [line]
            elif current:
                current.append(line)
        if current:
            blocks.append("\n".join(current).strip())
        return [b for b in blocks if b]

    async def _match_event(self, event_text: str, todos_text: str) -> dict | None:
        """Ask LLM which todo this event belongs to."""
        prompt = LINK_USER_TEMPLATE.format(todos=todos_text, event_text=event_text)
        messages: list[dict[str, str]] = [
            {"role": "system", "content": LINK_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]

        try:
            resp = await asyncio.to_thread(
                self._llm.chat,
                messages,
                0.0,
                self._model,
                120,
                log_usage=True,
                log_meta={"endpoint": "memory_task_link", "feature_type": "memory_task_link"},
            )
            return self._parse_link_result(resp)
        except Exception:
            logger.exception("LLM task linking failed")
            self._stats["errors"] += 1
            return None

    @staticmethod
    def _parse_link_result(resp: str) -> dict | None:
        if not resp:
            return None
        try:
            start = resp.find("{")
            end = resp.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(resp[start:end])
                idx = int(data.get("todo_index", 0))
                conf = float(data.get("confidence", 0))
                if idx > 0 and conf >= TaskLinker.MIN_LINK_CONFIDENCE:
                    return {"index": idx, "confidence": conf}
        except (json.JSONDecodeError, ValueError, KeyError):
            pass
        return None

    async def _append_to_task_file(self, todo_name: str, date_str: str, event_block: str) -> None:
        """Append an event block to the corresponding task file."""
        slug = _slugify(todo_name)
        task_file = self._tasks_dir / f"{slug}.md"

        if not task_file.exists():
            header = f"# {todo_name}\n\n- **首次关联**: {date_str}\n"
            task_file.write_text(header, encoding="utf-8")
            logger.info(f"TaskLinker created task file: {task_file.name}")

        content = task_file.read_text(encoding="utf-8")

        date_header = f"\n### {date_str}\n"
        if date_header.strip() not in content:
            with open(task_file, "a", encoding="utf-8") as f:
                f.write(date_header)

        title_line = event_block.split("\n")[0] if event_block else ""
        compact = self._compact_event(event_block)
        with open(task_file, "a", encoding="utf-8") as f:
            f.write(f"- {compact}\n")

        logger.debug(f"Appended event to task file {slug}: {title_line[:60]}")

    @staticmethod
    def _compact_event(block: str) -> str:
        """Extract a one-line summary from an event block."""
        time_str = ""
        summary = ""
        for line in block.split("\n"):
            stripped = line.strip()
            if stripped.startswith("- **时间**:"):
                time_str = stripped.replace("- **时间**:", "").strip()
            elif stripped.startswith("- **摘要**:"):
                summary = stripped.replace("- **摘要**:", "").strip()
        title = ""
        first_line = block.split("\n")[0].strip()
        if first_line.startswith("## Event:"):
            title = first_line.replace("## Event:", "").strip()

        parts: list[str] = []
        if time_str:
            parts.append(time_str)
        if title:
            parts.append(title)
        if summary:
            parts.append(summary)
        return " | ".join(parts) if parts else block.split("\n")[0][:100]
