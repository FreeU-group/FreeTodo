"""Lifetrace Toolkit for Agno Agent

Main toolkit class that combines all tool mixins.
"""

from __future__ import annotations

import importlib

from agno.tools import Toolkit

from llm.agno_tools.base import AgnoToolsMessageLoader
from llm.agno_tools.tools import (
    BreakdownTools,
    ConflictTools,
    LocationTools,
    MessageTools,
    PlanningTools,
    SchedulingTools,
    StatsTools,
    TagTools,
    TimeTools,
    TodoTools,
)
from util.logging_config import get_logger

logger = get_logger()


class LifetraceToolkit(
    TodoTools,
    BreakdownTools,
    TimeTools,
    ConflictTools,
    SchedulingTools,
    PlanningTools,
    LocationTools,
    MessageTools,
    StatsTools,
    TagTools,
    Toolkit,
):
    """Lifetrace Toolkit - Todo management tools for Agno Agent

    Combines all tool mixins into a single Toolkit.
    Supports internationalization through lang parameter.

    Tools included:
    - Todo CRUD: create_todo, complete_todo, update_todo, list_todos, search_todos, delete_todo
    - Task breakdown: breakdown_task
    - Time parsing: parse_time
    - Conflict detection: check_schedule_conflict
    - Scheduling: find_free_slots
    - Location: search_nearby_places
    - Message: draft_reply_message
    - Statistics: get_todo_stats, get_overdue_todos
    - Tag management: list_tags, get_todos_by_tag, suggest_tags
    """

    def __init__(self, lang: str = "en", selected_tools: list[str] | None = None, **kwargs):
        """Initialize LifetraceToolkit

        Args:
            lang: Language code for messages ('zh' or 'en'), defaults to 'en'
            selected_tools: List of tool names to enable. If None or empty, no tools are enabled.
            **kwargs: Additional arguments passed to Toolkit base class
        """
        self.lang = lang

        # Initialize message loader (preload messages)
        AgnoToolsMessageLoader(lang)

        # Lazy import to avoid circular dependencies
        repo_module = importlib.import_module("repositories.sql_todo_repository")
        db_module = importlib.import_module("storage.database")
        sql_todo_repository_class = repo_module.SqlTodoRepository
        db_base = db_module.db_base

        self.db_base = db_base
        self.todo_repo = sql_todo_repository_class(db_base)

        # All available tools
        all_tools = {
            # Todo management (from TodoTools)
            "create_todo": self.create_todo,
            "complete_todo": self.complete_todo,
            "update_todo": self.update_todo,
            "list_todos": self.list_todos,
            "search_todos": self.search_todos,
            "delete_todo": self.delete_todo,
            # Task breakdown (from BreakdownTools)
            "breakdown_task": self.breakdown_task,
            # Time parsing (from TimeTools)
            "parse_time": self.parse_time,
            # Conflict detection (from ConflictTools)
            "check_schedule_conflict": self.check_schedule_conflict,
            # Scheduling (from SchedulingTools)
            "find_free_slots": self.find_free_slots,
            # Planning (from PlanningTools)
            "plan_schedule": self.plan_schedule,
            # Location (from LocationTools)
            "search_nearby_places": self.search_nearby_places,
            # Message (from MessageTools)
            "draft_reply_message": self.draft_reply_message,
            # Statistics (from StatsTools)
            "get_todo_stats": self.get_todo_stats,
            "get_overdue_todos": self.get_overdue_todos,
            # Tag management (from TagTools)
            "list_tags": self.list_tags,
            "get_todos_by_tag": self.get_todos_by_tag,
            "suggest_tags": self.suggest_tags,
        }

        # Filter tools based on selected_tools
        # Default: no tools enabled (user must explicitly select tools)
        if selected_tools and len(selected_tools) > 0:
            tools = [all_tools[tool_name] for tool_name in selected_tools if tool_name in all_tools]
            logger.info(
                f"LifetraceToolkit initialized with lang={lang}, "
                f"selected {len(tools)} tools: {selected_tools}"
            )
        else:
            tools = []
            logger.info(
                f"LifetraceToolkit initialized with lang={lang}, no tools enabled (default)"
            )

        super().__init__(name="lifetrace_toolkit", tools=tools, **kwargs)
