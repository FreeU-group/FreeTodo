"""Tag Management Tools

Tag listing, filtering, and suggestion.
The Agent directly suggests tags without nested LLM calls for better performance.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from llm.agno_tools.base import get_message
from util.logging_config import get_logger

if TYPE_CHECKING:
    from repositories.sql_todo_repository import SqlTodoRepository

logger = get_logger()


class TagTools:
    """Tag management tools mixin"""

    lang: str
    todo_repo: SqlTodoRepository

    def _msg(self, key: str, **kwargs) -> str:
        return get_message(self.lang, key, **kwargs)

    def list_tags(self) -> str:
        """List all used tags with todo counts

        Returns:
            Formatted list of tags
        """
        try:
            todos = self.todo_repo.list_todos(limit=1000, offset=0, status=None)

            tag_counts: dict[str, int] = {}
            for todo in todos:
                tags = todo.get("tags", [])
                if tags:
                    for tag in tags:
                        tag_counts[tag] = tag_counts.get(tag, 0) + 1

            if not tag_counts:
                return self._msg("tags_empty")

            sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)

            result = self._msg("tags_header", count=len(sorted_tags))
            for tag, count in sorted_tags:
                result += self._msg("tags_item", tag=tag, count=count) + "\n"

            return result.strip()

        except Exception as e:
            logger.error(f"Failed to list tags: {e}")
            return self._msg("tags_empty")

    def get_todos_by_tag(self, tag: str) -> str:
        """Get all todos with a specific tag

        Args:
            tag: Tag name to filter by

        Returns:
            Formatted list of todos with the tag
        """
        try:
            todos = self.todo_repo.list_todos(limit=200, offset=0, status=None)

            matches = [todo for todo in todos if tag in (todo.get("tags") or [])]

            if not matches:
                return self._msg("todos_by_tag_empty", tag=tag)

            result = self._msg("todos_by_tag_header", tag=tag, count=len(matches))
            for todo in matches:
                result += (
                    self._msg(
                        "todos_by_tag_item",
                        id=todo["id"],
                        status=todo.get("status", "active"),
                        name=todo["name"],
                    )
                    + "\n"
                )

            return result.strip()

        except Exception as e:
            logger.error(f"Failed to get todos by tag: {e}")
            return self._msg("todos_by_tag_empty", tag=tag)

    def suggest_tags(self, todo_name: str) -> str:
        """Suggest tags based on todo name

        This tool provides context for tag suggestion. The Agent should directly
        suggest tags without calling LLM again.

        Args:
            todo_name: Name of the todo to suggest tags for

        Returns:
            Instructions for the Agent to suggest tags directly
        """
        try:
            # 获取现有标签作为参考
            todos = self.todo_repo.list_todos(limit=500, offset=0, status=None)
            existing_tags = set()
            for todo in todos:
                for tag in todo.get("tags") or []:
                    existing_tags.add(tag)

            existing_tags_str = ", ".join(sorted(existing_tags)) if existing_tags else "None"

            # 返回推荐指导信息，让 Agent 自己完成推荐
            # 这样可以避免嵌套 LLM 调用，提升性能
            suggestion_guide = self._msg(
                "suggest_tags_guide",
                todo_name=todo_name,
                existing_tags=existing_tags_str,
            )
            return suggestion_guide

        except Exception as e:
            logger.error(f"Failed to get tag suggestion context: {e}")
            return self._msg("suggest_tags_failed", error=str(e))
