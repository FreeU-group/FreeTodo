"""Todo Management Tools

CRUD operations for todo items.
"""

from __future__ import annotations

import contextlib
from datetime import datetime
from typing import TYPE_CHECKING, Any

from llm.agno_tools.base import get_message
from util.logging_config import get_logger

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
        description: str | None = None,
        start_time: str | None = None,
        end_time: str | None = None,
        time_zone: str | None = None,
        deadline: str | None = None,
        priority: str | None = None,
        tags: str | None = None,
    ) -> str:
        """Create a new todo item

        Args:
            name: Todo name/title (required)
            description: Detailed description (optional)
            start_time: Start time in ISO format like '2024-01-20T14:00:00' (optional)
            end_time: End time in ISO format like '2024-01-20T16:00:00' (optional)
            time_zone: IANA time zone like 'Asia/Shanghai' (optional)
            deadline: Legacy alias of start_time in ISO format (optional)
            priority: Priority level - 'high', 'medium', 'low', or 'none' (optional, default: 'none')
            tags: Comma-separated tags like 'work,urgent' (optional)

        Returns:
            Success or failure message
        """
        try:
            parsed_start_time = None
            if start_time:
                with contextlib.suppress(ValueError):
                    parsed_start_time = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            elif deadline:
                with contextlib.suppress(ValueError):
                    parsed_start_time = datetime.fromisoformat(deadline.replace("Z", "+00:00"))

            parsed_end_time = None
            if end_time:
                with contextlib.suppress(ValueError):
                    parsed_end_time = datetime.fromisoformat(end_time.replace("Z", "+00:00"))

            # Parse tags
            tag_list = None
            if tags:
                tag_list = [t.strip() for t in tags.split(",") if t.strip()]

            # Normalize priority (handle None and invalid values)
            valid_priorities = ("high", "medium", "low", "none")
            normalized_priority = priority if priority in valid_priorities else "none"

            # Create todo
            todo_id = self.todo_repo.create(
                name=name,
                description=description,
                start_time=parsed_start_time,
                end_time=parsed_end_time,
                time_zone=time_zone,
                priority=normalized_priority,
                tags=tag_list,
            )

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

    def update_todo(  # noqa: PLR0913, C901
        self,
        todo_id: int,
        name: str | None = None,
        description: str | None = None,
        start_time: str | None = None,
        end_time: str | None = None,
        time_zone: str | None = None,
        deadline: str | None = None,
        priority: str | None = None,
    ) -> str:
        """Update an existing todo

        Args:
            todo_id: The ID of the todo to update
            name: New name (optional)
            description: New description (optional)
            start_time: New start time in ISO format (optional)
            end_time: New end time in ISO format (optional)
            time_zone: IANA time zone like 'Asia/Shanghai' (optional)
            deadline: Legacy alias of start_time (optional)
            priority: New priority - 'high', 'medium', 'low', or 'none' (optional)

        Returns:
            Success or failure message
        """
        try:
            todo = self.todo_repo.get_by_id(todo_id)
            if not todo:
                return self._msg("update_not_found", id=todo_id)

            update_kwargs: dict[str, Any] = {}
            if name is not None:
                update_kwargs["name"] = name
            if description is not None:
                update_kwargs["description"] = description
            if start_time is not None:
                with contextlib.suppress(ValueError):
                    update_kwargs["start_time"] = datetime.fromisoformat(
                        start_time.replace("Z", "+00:00")
                    )
            elif deadline is not None:
                with contextlib.suppress(ValueError):
                    update_kwargs["start_time"] = datetime.fromisoformat(
                        deadline.replace("Z", "+00:00")
                    )
            if end_time is not None:
                with contextlib.suppress(ValueError):
                    update_kwargs["end_time"] = datetime.fromisoformat(
                        end_time.replace("Z", "+00:00")
                    )
            if time_zone is not None:
                update_kwargs["time_zone"] = time_zone
            if priority is not None and priority in ("high", "medium", "low", "none"):
                update_kwargs["priority"] = priority

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

    def list_todos(self, status: str = "active", limit: int = 10) -> str:
        """List todos with optional status filter

        Args:
            status: Filter by status - 'active', 'completed', 'all' (default: 'active')
            limit: Maximum number of todos to return (default: 10)

        Returns:
            Formatted list of todos or empty message
        """
        try:
            status_filter = status if status in ("active", "completed") else None
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
                start_time = (
                    todo.get("dtstart")
                    or todo.get("due")
                    or todo.get("start_time")
                    or todo.get("deadline")
                )
                end_time = todo.get("dtend") or todo.get("end_time")
                if start_time:
                    if isinstance(start_time, datetime):
                        start_label = start_time.strftime("%Y-%m-%d %H:%M")
                    else:
                        start_label = str(start_time)
                    end_label = None
                    if end_time:
                        if isinstance(end_time, datetime):
                            end_label = end_time.strftime("%Y-%m-%d %H:%M")
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

    def search_todos(self, keyword: str) -> str:
        """Search todos by keyword

        Args:
            keyword: Search keyword to match against todo name and description

        Returns:
            Formatted search results or empty message
        """
        try:
            all_todos = self.todo_repo.list_todos(limit=200, offset=0, status=None)
            keyword_lower = keyword.lower()

            matches = [
                todo
                for todo in all_todos
                if keyword_lower in todo["name"].lower()
                or (todo.get("description") and keyword_lower in todo["description"].lower())
            ]

            if not matches:
                return self._msg("search_empty", keyword=keyword)

            result = self._msg("search_header", keyword=keyword, count=len(matches))
            for todo in matches:
                result += (
                    self._msg(
                        "search_item",
                        id=todo["id"],
                        status=todo.get("status", "active"),
                        name=todo["name"],
                    )
                    + "\n"
                )

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
