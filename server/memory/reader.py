"""Memory Reader — file-based retrieval engine (time + keyword search)."""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

from memory.models import MemoryLevel, MemorySearchResult
from util.time_utils import get_local_now

if TYPE_CHECKING:
    from pathlib import Path
from util.logging_config import get_logger

logger = get_logger()


class MemoryReader:
    """File-based memory retrieval engine.

    Supports:
    - Date-based lookup (raw / events files)
    - Keyword search across recent days
    - Listing available dates
    """

    def __init__(self, memory_dir: Path):
        self._memory_dir = memory_dir
        self._raw_dir = memory_dir / "raw_L0"
        self._deduped_dir = memory_dir / "deduped_L1"
        self._events_dir = memory_dir / "events_L2"

    def read_by_date(self, date_str: str, level: str = "events") -> str | None:  # noqa: ARG002
        """Read memory file for a given date.

        Priority: events (L2) → deduped (L1) → raw (L0).
        """
        for subdir in (self._events_dir, self._deduped_dir, self._raw_dir):
            f = subdir / f"{date_str}.md"
            if f.exists():
                return f.read_text(encoding="utf-8")
        return None

    def search_keyword(
        self,
        keyword: str,
        days: int = 7,
        max_results: int = 10,
    ) -> list[MemorySearchResult]:
        """Search recent files for *keyword* (case-insensitive)."""
        results: list[MemorySearchResult] = []
        today = get_local_now()

        for i in range(days):
            date = today - timedelta(days=i)
            date_str = date.strftime("%Y-%m-%d")

            for subdir_name, level in (
                ("events_L2", MemoryLevel.EVENT),
                ("deduped_L1", MemoryLevel.DEDUPED),
                ("raw_L0", MemoryLevel.RAW),
            ):
                file_path = self._memory_dir / subdir_name / f"{date_str}.md"
                if not file_path.exists():
                    continue

                content = file_path.read_text(encoding="utf-8")
                if keyword.lower() not in content.lower():
                    continue

                snippets = self._extract_matching_sections(content, keyword)
                for snippet in snippets:
                    results.append(
                        MemorySearchResult(
                            level=level,
                            date=date_str,
                            snippet=snippet,
                            file_path=str(file_path),
                        )
                    )
                    if len(results) >= max_results:
                        return results
        return results

    def list_available_dates(self) -> list[str]:
        """Return all dates that have at least one memory file, newest first."""
        dates: set[str] = set()
        for subdir in (self._raw_dir, self._deduped_dir, self._events_dir):
            if subdir.exists():
                for f in subdir.glob("*.md"):
                    dates.add(f.stem)
        return sorted(dates, reverse=True)

    def get_user_profile(self) -> str:
        """Read L4 user profile file (manually maintained in MVP)."""
        profile_file = self._memory_dir / "profile_L4" / "user_profile.md"
        if profile_file.exists():
            return profile_file.read_text(encoding="utf-8")
        return ""

    def get_active_todos_snapshot(self) -> str:
        """Read active Todo list as a text snapshot for intent recognition.

        Bridges the existing Lifetrace system. Returns a formatted text listing
        all non-completed todos with title, status, priority, and time info.
        """
        try:
            from repositories.sql_todo_repository import (  # noqa: PLC0415
                SqlTodoRepository,
            )
            from storage.database import db_base  # noqa: PLC0415

            repo = SqlTodoRepository(db_base)
            todos = repo.list_todos(limit=50, offset=0, status="active")
            if not todos:
                return ""

            lines: list[str] = []
            for i, todo in enumerate(todos, 1):
                priority = todo.get("priority", "none")
                name = todo.get("name", "")
                status_label = todo.get("status", "active")
                start_time = todo.get("dtstart") or todo.get("start_time") or todo.get("due")
                tags = todo.get("tags") or []

                entry = f"{i}. [{status_label}] {name}"
                if priority and priority != "none":
                    entry += f" (优先级: {priority})"
                if start_time:
                    if hasattr(start_time, "strftime"):
                        entry += f" (时间: {start_time.strftime('%Y-%m-%d %H:%M')})"
                    else:
                        entry += f" (时间: {start_time})"
                if tags:
                    tag_str = ", ".join(str(t) for t in tags[:5])
                    entry += f" [标签: {tag_str}]"
                lines.append(entry)

            return "\n".join(lines)
        except Exception:
            logger.debug("Failed to load todos snapshot, returning empty", exc_info=True)
            return ""

    def get_raw_content(self, date_str: str) -> str | None:
        """Read raw L0 file for a given date."""
        raw_file = self._raw_dir / f"{date_str}.md"
        if raw_file.exists():
            return raw_file.read_text(encoding="utf-8")
        return None

    def _extract_matching_sections(
        self,
        content: str,
        keyword: str,
        context_lines: int = 5,
    ) -> list[str]:
        """Extract text snippets containing *keyword* with surrounding context."""
        lines = content.split("\n")
        keyword_lower = keyword.lower()
        snippets: list[str] = []
        seen_ranges: list[tuple[int, int]] = []

        for i, line in enumerate(lines):
            if keyword_lower not in line.lower():
                continue
            start = max(0, i - context_lines)
            end = min(len(lines), i + context_lines + 1)

            if any(s <= i <= e for s, e in seen_ranges):
                continue
            seen_ranges.append((start, end))
            snippets.append("\n".join(lines[start:end]))

        return snippets
