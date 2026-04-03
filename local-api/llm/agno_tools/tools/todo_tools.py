"""Todo Management Tools

CRUD operations for todo items.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from llm.agno_tools.base import get_message
from llm.agno_tools.tools.todo_tool_helpers import CreateTodoPayload, build_create_kwargs
from llm.agno_tools.tools.todo_tool_update_helpers import UpdateTodoPayload, build_update_kwargs
from util.logging_config import get_logger
from util.time_utils import to_local

if TYPE_CHECKING:
    from repositories.sql_todo_repository import SqlTodoRepository

logger = get_logger()


class TodoTools:
    """Todo CRUD tools mixin"""

    lang: str
    todo_repo: SqlTodoRepository

    def _msg(self, key: str, **kwargs) -> str:
        return get_message(self.lang, key, **kwargs)

    def create_todo(  # noqa: PLR0913
        self,
        name: str,
        summary: str | None = None,
        description: str | None = None,
        user_notes: str | None = None,
        who_founder: str | None = None,
        who_executor: str | None = None,
        parent_todo_id: int | str | None = None,
        item_type: str | None = None,
        location: str | None = None,
        categories: str | None = None,
        classification: str | None = None,
        deadline: str | datetime | None = None,
        start_time: str | datetime | None = None,
        end_time: str | datetime | None = None,
        dtstart: str | datetime | None = None,
        dtend: str | datetime | None = None,
        due: str | datetime | None = None,
        duration: str | None = None,
        time_zone: str | None = None,
        tzid: str | None = None,
        is_all_day: bool | str | int | None = None,
        dtstamp: str | datetime | None = None,
        created: str | datetime | None = None,
        last_modified: str | datetime | None = None,
        sequence: int | str | None = None,
        rdate: str | None = None,
        exdate: str | None = None,
        recurrence_id: str | datetime | None = None,
        related_to_uid: str | None = None,
        related_to_reltype: str | None = None,
        ical_status: str | None = None,
        reminder_offsets: list[int] | str | None = None,
        status: str | None = None,
        priority: str | None = None,
        completed_at: str | datetime | None = None,
        percent_complete: int | str | None = None,
        rrule: str | None = None,
        order: int | str | None = None,
        tags: list[str] | str | None = None,
        related_activities: list[int] | str | None = None,
        uid: str | None = None,
    ) -> str:
        """Create a new todo item

        Args:
            name: Todo name/title (required)
            summary: iCalendar SUMMARY (optional)
            description: Detailed description (optional)
            user_notes: User notes (optional)
            parent_todo_id: Parent todo ID (optional)
            item_type: VTODO/VEVENT (optional)
            location: iCalendar LOCATION (optional)
            categories: iCalendar CATEGORIES (optional)
            classification: iCalendar CLASS (optional)
            deadline: Legacy alias of start_time/due in ISO format (optional)
            start_time: Start time in ISO format (optional)
            end_time: End time in ISO format (optional)
            dtstart: iCalendar DTSTART (optional)
            dtend: iCalendar DTEND (optional)
            due: iCalendar DUE (optional)
            duration: iCalendar DURATION (optional)
            time_zone: IANA time zone (optional)
            tzid: iCalendar TZID (optional)
            is_all_day: All-day flag (optional)
            dtstamp: iCalendar DTSTAMP (optional)
            created: iCalendar CREATED (optional)
            last_modified: iCalendar LAST-MODIFIED (optional)
            sequence: iCalendar SEQUENCE (optional)
            rdate: iCalendar RDATE (optional)
            exdate: iCalendar EXDATE (optional)
            recurrence_id: iCalendar RECURRENCE-ID (optional)
            related_to_uid: iCalendar RELATED-TO UID (optional)
            related_to_reltype: iCalendar RELATED-TO RELTYPE (optional)
            ical_status: iCalendar STATUS (optional)
            reminder_offsets: Reminder offsets in minutes (optional)
            status: active/completed/canceled/draft (optional)
            priority: high/medium/low/none (optional)
            completed_at: Completed time (optional)
            percent_complete: Completion percentage (0-100) (optional)
            rrule: iCalendar RRULE (optional)
            order: Display order (optional)
            tags: Tag list or comma-separated string (optional)
            related_activities: Related activity IDs (optional)
            uid: iCalendar UID (optional)

        Returns:
            Success or failure message
        """
        try:
            todo_kwargs = build_create_kwargs(
                CreateTodoPayload(
                    name=name,
                    summary=summary,
                    description=description,
                    user_notes=user_notes,
                    who_founder=who_founder,
                    who_executor=who_executor,
                    parent_todo_id=parent_todo_id,
                    item_type=item_type,
                    location=location,
                    categories=categories,
                    classification=classification,
                    deadline=deadline,
                    start_time=start_time,
                    end_time=end_time,
                    dtstart=dtstart,
                    dtend=dtend,
                    due=due,
                    duration=duration,
                    time_zone=time_zone,
                    tzid=tzid,
                    is_all_day=is_all_day,
                    dtstamp=dtstamp,
                    created=created,
                    last_modified=last_modified,
                    sequence=sequence,
                    rdate=rdate,
                    exdate=exdate,
                    recurrence_id=recurrence_id,
                    related_to_uid=related_to_uid,
                    related_to_reltype=related_to_reltype,
                    ical_status=ical_status,
                    reminder_offsets=reminder_offsets,
                    status=status,
                    priority=priority,
                    completed_at=completed_at,
                    percent_complete=percent_complete,
                    rrule=rrule,
                    order=order,
                    tags=tags,
                    related_activities=related_activities,
                    uid=uid,
                )
            )

            todo_id = self.todo_repo.create(**todo_kwargs)

            if todo_id:
                return self._msg("create_success", id=todo_id, name=name)
            else:
                return self._msg("create_failed", error="Unknown error")

        except Exception as e:
            logger.error(f"Failed to create todo: {e}")
            return self._msg("create_failed", error=str(e))

    def complete_todo(self, todo_id: int) -> str:
        """Mark a todo as completed

        Args:
            todo_id: The ID of the todo to complete

        Returns:
            Success or failure message
        """
        try:
            todo = self.todo_repo.get_by_id(todo_id)
            if not todo:
                return self._msg("complete_not_found", id=todo_id)

            success = self.todo_repo.update(todo_id, status="completed")
            if success:
                return self._msg("complete_success", id=todo_id)
            else:
                return self._msg("complete_failed", error="Update failed")

        except Exception as e:
            logger.error(f"Failed to complete todo: {e}")
            return self._msg("complete_failed", error=str(e))

    def update_todo(  # noqa: PLR0913
        self,
        todo_id: int,
        name: str | None = None,
        summary: str | None = None,
        description: str | None = None,
        user_notes: str | None = None,
        who_founder: str | None = None,
        who_executor: str | None = None,
        parent_todo_id: int | str | None = None,
        item_type: str | None = None,
        location: str | None = None,
        categories: str | None = None,
        classification: str | None = None,
        deadline: str | datetime | None = None,
        start_time: str | datetime | None = None,
        end_time: str | datetime | None = None,
        dtstart: str | datetime | None = None,
        dtend: str | datetime | None = None,
        due: str | datetime | None = None,
        duration: str | None = None,
        time_zone: str | None = None,
        tzid: str | None = None,
        is_all_day: bool | str | int | None = None,
        dtstamp: str | datetime | None = None,
        created: str | datetime | None = None,
        last_modified: str | datetime | None = None,
        sequence: int | str | None = None,
        rdate: str | None = None,
        exdate: str | None = None,
        recurrence_id: str | datetime | None = None,
        related_to_uid: str | None = None,
        related_to_reltype: str | None = None,
        ical_status: str | None = None,
        reminder_offsets: list[int] | str | None = None,
        status: str | None = None,
        priority: str | None = None,
        completed_at: str | datetime | None = None,
        percent_complete: int | str | None = None,
        rrule: str | None = None,
        order: int | str | None = None,
        tags: list[str] | str | None = None,
        related_activities: list[int] | str | None = None,
    ) -> str:
        """Update an existing todo

        Args:
            todo_id: The ID of the todo to update
            name: New name (optional)
            summary: iCalendar SUMMARY (optional)
            description: New description (optional)
            user_notes: User notes (optional)
            parent_todo_id: Parent todo ID (optional, explicit null clears)
            item_type: VTODO/VEVENT (optional)
            location: iCalendar LOCATION (optional)
            categories: iCalendar CATEGORIES (optional)
            classification: iCalendar CLASS (optional)
            deadline: Legacy alias of start_time/due (optional)
            start_time: New start time in ISO format (optional)
            end_time: New end time in ISO format (optional)
            dtstart: iCalendar DTSTART (optional)
            dtend: iCalendar DTEND (optional)
            due: iCalendar DUE (optional)
            duration: iCalendar DURATION (optional)
            time_zone: IANA time zone (optional)
            tzid: iCalendar TZID (optional)
            is_all_day: All-day flag (optional)
            dtstamp: iCalendar DTSTAMP (optional)
            created: iCalendar CREATED (optional)
            last_modified: iCalendar LAST-MODIFIED (optional)
            sequence: iCalendar SEQUENCE (optional)
            rdate: iCalendar RDATE (optional)
            exdate: iCalendar EXDATE (optional)
            recurrence_id: iCalendar RECURRENCE-ID (optional)
            related_to_uid: iCalendar RELATED-TO UID (optional)
            related_to_reltype: iCalendar RELATED-TO RELTYPE (optional)
            ical_status: iCalendar STATUS (optional)
            reminder_offsets: Reminder offsets in minutes (optional)
            status: active/completed/canceled/draft (optional)
            priority: high/medium/low/none (optional)
            completed_at: Completed time (optional)
            percent_complete: Completion percentage (0-100) (optional)
            rrule: iCalendar RRULE (optional)
            order: Display order (optional)
            tags: Tag list or comma-separated string (optional)
            related_activities: Related activity IDs (optional)

        Returns:
            Success or failure message
        """
        try:
            todo = self.todo_repo.get_by_id(todo_id)
            if not todo:
                return self._msg("update_not_found", id=todo_id)

            update_kwargs = build_update_kwargs(
                UpdateTodoPayload(
                    name=name,
                    summary=summary,
                    description=description,
                    user_notes=user_notes,
                    who_founder=who_founder,
                    who_executor=who_executor,
                    parent_todo_id=parent_todo_id,
                    item_type=item_type,
                    location=location,
                    categories=categories,
                    classification=classification,
                    deadline=deadline,
                    start_time=start_time,
                    end_time=end_time,
                    dtstart=dtstart,
                    dtend=dtend,
                    due=due,
                    duration=duration,
                    time_zone=time_zone,
                    tzid=tzid,
                    is_all_day=is_all_day,
                    dtstamp=dtstamp,
                    created=created,
                    last_modified=last_modified,
                    sequence=sequence,
                    rdate=rdate,
                    exdate=exdate,
                    recurrence_id=recurrence_id,
                    related_to_uid=related_to_uid,
                    related_to_reltype=related_to_reltype,
                    ical_status=ical_status,
                    reminder_offsets=reminder_offsets,
                    status=status,
                    priority=priority,
                    completed_at=completed_at,
                    percent_complete=percent_complete,
                    rrule=rrule,
                    order=order,
                    tags=tags,
                    related_activities=related_activities,
                )
            )

            if not update_kwargs:
                return self._msg("update_success", id=todo_id)

            success = self.todo_repo.update(todo_id, **update_kwargs)
            if success:
                return self._msg("update_success", id=todo_id)
            else:
                return self._msg("update_failed", error="Update failed")

        except Exception as e:
            logger.error(f"Failed to update todo: {e}")
            return self._msg("update_failed", error=str(e))

    def list_todos(self, status: str = "all", limit: int = 50) -> str:
        """List todos with optional status filter

        Args:
            status: Filter by status - 'active', 'completed', 'canceled', 'all' (default: 'all')
            limit: Maximum number of todos to return (default: 50)

        Returns:
            Formatted list of todos or empty message
        """
        try:
            status_filter = status if status in ("active", "completed", "canceled") else None
            todos = self.todo_repo.list_todos(limit=limit, offset=0, status=status_filter)

            if not todos:
                return self._msg("list_empty", status=status)

            result = self._msg("list_header", status=status, count=len(todos))
            for todo in todos:
                item = self._msg(
                    "list_item",
                    id=todo["id"],
                    priority=todo.get("priority", "none"),
                    name=todo["name"],
                )
                parent_id = todo.get("parent_todo_id")
                if parent_id:
                    item += f" [子任务，父ID:{parent_id}]"
                start_time = (
                    todo.get("dtstart")
                    or todo.get("due")
                    or todo.get("start_time")
                    or todo.get("deadline")
                )
                end_time = todo.get("dtend") or todo.get("end_time")
                if start_time:
                    if isinstance(start_time, datetime):
                        local_start = to_local(start_time) or start_time
                        start_label = local_start.strftime("%Y-%m-%d %H:%M")
                    else:
                        start_label = str(start_time)
                    end_label = None
                    if end_time:
                        if isinstance(end_time, datetime):
                            local_end = to_local(end_time) or end_time
                            end_label = local_end.strftime("%Y-%m-%d %H:%M")
                        else:
                            end_label = str(end_time)
                    time_label = start_label
                    if end_label:
                        time_label = f"{start_label} ~ {end_label}"
                    item += self._msg("list_item_with_time", time=time_label)
                result += item + "\n"

            return result.strip()

        except Exception as e:
            logger.error(f"Failed to list todos: {e}")
            return self._msg("list_empty", status=status)

    def get_todo_detail(self, todo_id: int) -> str:
        """Get detailed info of a single todo, including parent/child hierarchy

        Args:
            todo_id: The ID of the todo to inspect

        Returns:
            Detailed todo info with hierarchy
        """
        try:
            todo = self.todo_repo.get_by_id(todo_id)
            if not todo:
                return f"未找到 ID 为 {todo_id} 的待办。"

            lines = [f"待办详情 (ID:{todo_id}):"]
            lines.append(f"  名称: {todo['name']}")
            lines.append(f"  状态: {todo.get('status', 'active')}")
            lines.append(f"  优先级: {todo.get('priority', 'none')}")

            parent_id = todo.get("parent_todo_id")
            if parent_id:
                parent = self.todo_repo.get_by_id(parent_id)
                parent_name = parent["name"] if parent else "未知"
                lines.append(f"  父任务: {parent_name} (ID:{parent_id})")

            start = todo.get("dtstart") or todo.get("start_time")
            end = todo.get("dtend") or todo.get("end_time")
            if start:
                if isinstance(start, datetime):
                    start = (to_local(start) or start).strftime("%Y-%m-%d %H:%M")
                lines.append(f"  开始: {start}")
            if end:
                if isinstance(end, datetime):
                    end = (to_local(end) or end).strftime("%Y-%m-%d %H:%M")
                lines.append(f"  结束: {end}")

            desc = todo.get("description")
            if desc:
                lines.append(f"  描述: {desc[:200]}")

            tags = todo.get("tags")
            if tags:
                tag_str = ", ".join(tags) if isinstance(tags, list) else str(tags)
                lines.append(f"  标签: {tag_str}")

            children = self.todo_repo.list_todos(limit=50, offset=0, status=None)
            child_list = [t for t in children if t.get("parent_todo_id") == todo_id]
            if child_list:
                lines.append(f"  子任务 ({len(child_list)}):")
                for c in child_list:
                    c_status = c.get("status", "active")
                    lines.append(f"    - {c['name']} (ID:{c['id']}, {c_status})")

            return "\n".join(lines)

        except Exception as e:
            logger.error(f"Failed to get todo detail: {e}")
            return f"获取待办详情失败: {e}"

    def search_todos(self, keyword: str) -> str:
        """Search todos by keyword

        Args:
            keyword: Search keyword to match against todo name and description

        Returns:
            Formatted search results or empty message
        """
        try:
            matches = self.todo_repo.search(keyword=keyword, limit=200, offset=0, status=None)

            if not matches:
                return self._msg("search_empty", keyword=keyword)

            result = self._msg("search_header", keyword=keyword, count=len(matches))
            for todo in matches:
                item = self._msg(
                    "search_item",
                    id=todo["id"],
                    status=todo.get("status", "active"),
                    name=todo["name"],
                )
                parent_id = todo.get("parent_todo_id")
                if parent_id:
                    item += f" [子任务，父ID:{parent_id}]"
                result += item + "\n"

            return result.strip()

        except Exception as e:
            logger.error(f"Failed to search todos: {e}")
            return self._msg("search_empty", keyword=keyword)

    def delete_todo(self, todo_id: int) -> str:
        """Delete a todo item

        Args:
            todo_id: The ID of the todo to delete

        Returns:
            Success or failure message
        """
        try:
            todo = self.todo_repo.get_by_id(todo_id)
            if not todo:
                return self._msg("delete_not_found", id=todo_id)

            success = self.todo_repo.delete(todo_id)
            if success:
                return self._msg("delete_success", id=todo_id)
            else:
                return self._msg("delete_failed", error="Delete failed")

        except Exception as e:
            logger.error(f"Failed to delete todo: {e}")
            return self._msg("delete_failed", error=str(e))
