"""L0 Writer — append PerceptionEvent to daily Markdown files."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from util.logging_config import get_logger
from util.time_utils import to_local

if TYPE_CHECKING:
    from pathlib import Path

    from perception.models import PerceptionEvent

logger = get_logger()


class MemoryWriter:
    """Append-only writer: PerceptionEvent → daily Markdown file.

    Each day produces one file at ``{memory_dir}/raw_L0/{YYYY-MM-DD}.md``.
    The writer is safe for concurrent async calls thanks to an asyncio.Lock.
    """

    def __init__(self, memory_dir: Path):
        self._memory_dir = memory_dir
        self._raw_dir = memory_dir / "raw_L0"
        self._raw_dir.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._current_date: str | None = None
        self._current_file: Path | None = None
        self._write_count = 0

    async def on_event(self, event: PerceptionEvent) -> None:
        """PerceptionStream subscriber callback."""
        try:
            line = self._format_event(event)
            # 按本地时区取日期，便于按“自然日”分文件
            local_ts = to_local(event.timestamp)
            date_str = (local_ts or event.timestamp).strftime("%Y-%m-%d")

            async with self._lock:
                if date_str != self._current_date:
                    self._rotate_file(date_str)

                if self._current_file is None:
                    raise RuntimeError("MemoryWriter output file is not initialized")
                with open(self._current_file, "a", encoding="utf-8") as f:
                    f.write(line)
                self._write_count += 1
        except Exception:
            logger.exception(f"MemoryWriter failed to persist event {event.event_id}")

    def _format_event(self, event: PerceptionEvent) -> str:
        # 写入 md 时使用本地时间显示，避免 UTC 造成困惑（如 14:20 实为本地 22:20）
        local_ts = to_local(event.timestamp)
        ts = (local_ts or event.timestamp).strftime("%H:%M")
        source = event.source.value

        parts: list[str] = [ts, source]
        meta = event.metadata
        if meta.get("app"):
            parts.append(str(meta["app"]))
        if meta.get("speaker"):
            speaker = str(meta["speaker"])
            if meta.get("target"):
                speaker = f"{speaker} → {meta['target']}"
            parts.append(speaker)

        header = " | ".join(parts)
        content = event.content_text.strip()
        return f"\n## {header}\n{content}\n"

    def _rotate_file(self, date_str: str) -> None:
        self._current_date = date_str
        self._current_file = self._raw_dir / f"{date_str}.md"
        if not self._current_file.exists():
            with open(self._current_file, "w", encoding="utf-8") as f:
                f.write(f"# {date_str} 感知记录\n")
            logger.info(f"MemoryWriter created new raw file: {self._current_file.name}")

    def get_stats(self) -> dict:
        return {
            "current_date": self._current_date,
            "write_count": self._write_count,
            "raw_dir": str(self._raw_dir),
        }
