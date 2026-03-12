"""Conflict Detection Tools

Schedule conflict detection for todos.
"""

from __future__ import annotations

import contextlib
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from llm.agno_tools.base import get_message
from util.logging_config import get_logger

if TYPE_CHECKING:
    from repositories.sql_todo_repository import SqlTodoRepository

logger = get_logger()

# Default duration for todos without explicit end time
DEFAULT_TODO_DURATION_HOURS = 1


def _parse_datetime(value: str | datetime) -> datetime:
    """Parse datetime from string or return as-is if already datetime."""
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value


def _parse_duration_value(value: str | None) -> timedelta | None:  # noqa: C901, PLR0912
    if not value:
        return None
    match = value.strip().upper().removeprefix("P")
    if not match:
        return None
    # Basic ISO 8601 duration parsing: PnW, PnD, PTnHnMnS.
    weeks = days = hours = minutes = seconds = 0
    if "T" in match:
        date_part, time_part = match.split("T", 1)
    else:
        date_part, time_part = match, ""
    if date_part.endswith("W"):
        with contextlib.suppress(ValueError):
            weeks = int(date_part[:-1] or 0)
        date_part = ""
    if date_part.endswith("D"):
        with contextlib.suppress(ValueError):
            days = int(date_part[:-1] or 0)
    if time_part:
        number = ""
        value_int = 0
        for ch in time_part:
            if ch.isdigit():
                number += ch
                continue
            with contextlib.suppress(ValueError):
                value_int = int(number or 0)
            if ch == "H":
                hours = value_int
            elif ch == "M":
                minutes = value_int
            elif ch == "S":
                seconds = value_int
            number = ""
    total_days = days + weeks * 7
    if total_days == hours == minutes == seconds == 0:
        return None
    return timedelta(days=total_days, hours=hours, minutes=minutes, seconds=seconds)


def _get_todo_range(todo: dict) -> tuple[datetime, datetime] | None:
    start_raw = todo.get("dtstart") or todo.get("start_time")
    end_raw = todo.get("dtend") or todo.get("end_time")
    due_raw = todo.get("due") or todo.get("deadline")

    if not start_raw:
        start_raw = due_raw
    if not start_raw:
        return None

    todo_start = _parse_datetime(start_raw)
    if not end_raw and due_raw and start_raw is not due_raw:
        end_raw = due_raw

    if end_raw:
        todo_end = _parse_datetime(end_raw)
    else:
        duration_raw = todo.get("duration")
        duration = _parse_duration_value(duration_raw)
        if duration is not None:
            try:
                todo_end = todo_start + duration
            except Exception:
                todo_end = todo_start + timedelta(hours=DEFAULT_TODO_DURATION_HOURS)
        else:
            todo_end = todo_start + timedelta(hours=DEFAULT_TODO_DURATION_HOURS)
    return todo_start, todo_end


def _check_schedule_conflict(todo: dict, start: datetime, end: datetime, conflicts: list) -> None:
    """Check if todo schedule overlaps with the specified range."""
    todo_range = _get_todo_range(todo)
    if not todo_range:
        return
    todo_start, todo_end = todo_range

    if start < todo_end and end > todo_start:
        existing_ids = [c["id"] for c in conflicts]
        if todo["id"] not in existing_ids:
            conflicts.append(
                {"id": todo["id"], "name": todo["name"], "start": todo_start, "end": todo_end}
            )


def _find_conflicts(todos: list, start: datetime, end: datetime) -> list:
    """Find all conflicting todos within the time range."""
    conflicts = []
    for todo in todos:
        _check_schedule_conflict(todo, start, end, conflicts)
    return conflicts


class ConflictTools:
    """Conflict detection tools mixin"""

    lang: str
    todo_repo: SqlTodoRepository

    def _msg(self, key: str, **kwargs) -> str:
        return get_message(self.lang, key, **kwargs)

    def _format_conflict_result(self, conflicts: list, time_range: str) -> str:
        """Format conflict check result as message."""
        if not conflicts:
            return self._msg("no_conflict", time_range=time_range)

        conflict_lines = [
            self._msg(
                "conflict_item",
                id=c["id"],
                name=c["name"],
                start=c["start"].strftime("%H:%M") if c.get("start") else "N/A",
                end=c["end"].strftime("%H:%M") if c.get("end") else "",
            )
            for c in conflicts
        ]
        return self._msg(
            "conflict_found",
            time_range=time_range,
            count=len(conflicts),
            conflicts="\n".join(conflict_lines),
        )

    def check_schedule_conflict(self, start_time: str, end_time: str | None = None) -> str:
        """Check if the specified time conflicts with existing todos

        Args:
            start_time: Start time in ISO format
            end_time: End time in ISO format (optional, defaults to start_time + 1 hour)

        Returns:
            Conflict information or availability message
        """
        try:
            start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            end = (
                datetime.fromisoformat(end_time.replace("Z", "+00:00"))
                if end_time
                else start + timedelta(hours=DEFAULT_TODO_DURATION_HOURS)
            )

            time_range = f"{start.strftime('%Y-%m-%d %H:%M')} - {end.strftime('%H:%M')}"
            todos = self.todo_repo.list_todos(limit=200, offset=0, status="active")
            conflicts = _find_conflicts(todos, start, end)

            return self._format_conflict_result(conflicts, time_range)

        except Exception as e:
            logger.error(f"Failed to check schedule conflict: {e}")
            return self._msg("conflict_failed", error=str(e))
