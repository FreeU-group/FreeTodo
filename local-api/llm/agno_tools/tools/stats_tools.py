"""Statistics Tools

Todo statistics and analysis.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from llm.agno_tools.base import get_message
from util.logging_config import get_logger
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from repositories.sql_todo_repository import SqlTodoRepository

logger = get_logger()


def _parse_datetime(value: str | datetime) -> datetime:
    """Parse datetime from string or return as-is if already datetime."""
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value


def _get_schedule_time(todo: dict) -> datetime | None:
    """Return schedule time from todo with legacy fallback."""
    schedule = (
        todo.get("due") or todo.get("dtstart") or todo.get("deadline") or todo.get("start_time")
    )
    if not schedule:
        return None
    return _parse_datetime(schedule)


def _get_start_date(date_range: str, now: datetime) -> datetime | None:
    """Get start date based on date range string."""
    if date_range == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if date_range == "week":
        return now - timedelta(days=7)
    if date_range == "month":
        return now - timedelta(days=30)
    return None


def _filter_by_date(todos: list, start_date: datetime | None) -> list:
    """Filter todos by start date."""
    if not start_date:
        return todos
    return [
        t for t in todos if t.get("created_at") and _parse_datetime(t["created_at"]) >= start_date
    ]


def _count_overdue(todos: list, now: datetime) -> int:
    """Count overdue active todos."""
    count = 0
    for t in todos:
        if t.get("status") != "active":
            continue
        schedule = _get_schedule_time(t)
        if schedule and schedule < now:
            count += 1
    return count


def _count_by_priority(todos: list) -> dict:
    """Count todos by priority level."""
    counts = {"high": 0, "medium": 0, "low": 0, "none": 0}
    for t in todos:
        priority = t.get("priority", "none")
        if priority in counts:
            counts[priority] += 1
    return counts


class StatsTools:
    """Statistics tools mixin"""

    lang: str
    todo_repo: SqlTodoRepository

    def _msg(self, key: str, **kwargs) -> str:
        return get_message(self.lang, key, **kwargs)

    def get_todo_stats(self, date_range: str = "today") -> str:
        """Get todo statistics

        Args:
            date_range: Time range - 'today', 'week', 'month', 'all' (default: 'today')

        Returns:
            Formatted statistics
        """
        try:
            all_todos = self.todo_repo.list_todos(limit=1000, offset=0, status=None)
            now = get_utc_now()

            start_date = _get_start_date(date_range, now)
            filtered_todos = _filter_by_date(all_todos, start_date)

            total = len(filtered_todos)
            completed = sum(1 for t in filtered_todos if t.get("status") == "completed")
            active = sum(1 for t in filtered_todos if t.get("status") == "active")
            overdue = _count_overdue(filtered_todos, now)
            priority_counts = _count_by_priority(filtered_todos)

            result = self._msg("stats_header", date_range=date_range)
            result += self._msg("stats_total", total=total) + "\n"
            result += self._msg("stats_completed", completed=completed) + "\n"
            result += self._msg("stats_active", active=active) + "\n"
            result += self._msg("stats_overdue", overdue=overdue) + "\n"
            result += self._msg(
                "stats_by_priority",
                high=priority_counts["high"],
                medium=priority_counts["medium"],
                low=priority_counts["low"],
                none=priority_counts["none"],
            )

            return result

        except Exception as e:
            logger.error(f"Failed to get todo stats: {e}")
            return self._msg("stats_failed", error=str(e))

    def get_overdue_todos(self) -> str:
        """Get all overdue todos

        Returns:
            Formatted list of overdue todos
        """
        try:
            now = get_utc_now()
            todos = self.todo_repo.list_todos(limit=200, offset=0, status="active")

            overdue = []
            for todo in todos:
                schedule = _get_schedule_time(todo)
                if not schedule:
                    continue
                if schedule < now:
                    days_overdue = (now - schedule).days
                    overdue.append({"id": todo["id"], "name": todo["name"], "days": days_overdue})

            if not overdue:
                return self._msg("no_overdue")

            overdue.sort(key=lambda x: x["days"], reverse=True)

            result = self._msg("overdue_header", count=len(overdue))
            for item in overdue:
                result += (
                    self._msg("overdue_item", id=item["id"], name=item["name"], days=item["days"])
                    + "\n"
                )

            return result.strip()

        except Exception as e:
            logger.error(f"Failed to get overdue todos: {e}")
            return self._msg("no_overdue")
