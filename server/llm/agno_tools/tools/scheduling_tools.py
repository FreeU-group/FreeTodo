"""Scheduling Tools

Free time slot discovery for proactive schedule management.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import TYPE_CHECKING

from llm.agno_tools.base import get_message
from llm.agno_tools.tools.conflict_tools import _get_todo_range
from util.logging_config import get_logger

if TYPE_CHECKING:
    from repositories.sql_todo_repository import SqlTodoRepository

logger = get_logger()

BUSINESS_HOUR_START = 8
BUSINESS_HOUR_END = 22


def _collect_busy_ranges(
    todos: list[dict], day_start: datetime, day_end: datetime
) -> list[tuple[datetime, datetime]]:
    """Extract and clip busy time ranges from todos."""
    busy: list[tuple[datetime, datetime]] = []
    for todo in todos:
        rng = _get_todo_range(todo)
        if rng is None:
            continue
        t_start, t_end = rng
        if t_start < day_end and t_end > day_start:
            busy.append((max(t_start, day_start), min(t_end, day_end)))
    busy.sort(key=lambda x: x[0])

    merged: list[tuple[datetime, datetime]] = []
    for start, end in busy:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def _find_free_windows(
    todos: list[dict],
    day_start: datetime,
    day_end: datetime,
    min_minutes: int,
) -> list[tuple[datetime, datetime]]:
    """Find continuous free time windows on a given day."""
    merged = _collect_busy_ranges(todos, day_start, day_end)
    min_gap = timedelta(minutes=min_minutes)

    free: list[tuple[datetime, datetime]] = []
    cursor = day_start
    for b_start, b_end in merged:
        if b_start > cursor and (b_start - cursor) >= min_gap:
            free.append((cursor, b_start))
        cursor = max(cursor, b_end)

    if day_end > cursor and (day_end - cursor) >= min_gap:
        free.append((cursor, day_end))

    return free


class SchedulingTools:
    """Scheduling assistant tools mixin"""

    lang: str
    todo_repo: SqlTodoRepository

    def _msg(self, key: str, **kwargs) -> str:
        return get_message(self.lang, key, **kwargs)

    def find_free_slots(
        self,
        date: str,
        min_duration_minutes: int = 60,
        start_hour: int = BUSINESS_HOUR_START,
        end_hour: int = BUSINESS_HOUR_END,
    ) -> str:
        """Find available free time slots on a given date

        Scans the user's schedule and returns all continuous free windows
        that are at least min_duration_minutes long.

        Args:
            date: Target date in ISO format (YYYY-MM-DD)
            min_duration_minutes: Minimum free window length in minutes (default: 60)
            start_hour: Day start hour (default: 8)
            end_hour: Day end hour (default: 22)

        Returns:
            Formatted list of free time slots
        """
        try:
            target = datetime.fromisoformat(date)
            day_start = datetime.combine(target.date(), time(hour=start_hour))
            day_end = datetime.combine(target.date(), time(hour=end_hour))

            todos = self.todo_repo.list_todos(limit=200, offset=0, status="active")
            free = _find_free_windows(todos, day_start, day_end, min_duration_minutes)

            if not free:
                return self._msg(
                    "no_free_slots",
                    date=date,
                    min_duration=min_duration_minutes,
                )

            lines = []
            for idx, (slot_start, slot_end) in enumerate(free, 1):
                duration = int((slot_end - slot_start).total_seconds() / 60)
                lines.append(
                    f"  {idx}. {slot_start.strftime('%H:%M')} - "
                    f"{slot_end.strftime('%H:%M')}（{duration} 分钟）"
                )

            return self._msg(
                "free_slots_found",
                date=date,
                count=len(free),
                slots="\n".join(lines),
            )

        except Exception as e:
            logger.error(f"Failed to find free slots: {e}")
            return self._msg("free_slots_failed", error=str(e))
