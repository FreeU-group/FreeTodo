"""Shared helpers and examples for todo CLI commands."""

from __future__ import annotations

from typing import Any

from freetodo_cli.client import TodoApiClient
from freetodo_cli.config import load_config
from freetodo_cli.schemas.todo import TodoCreate, TodoReorderRequest, TodoUpdate

TODO_HELP_TEXT = (
    "Todo resource commands.\n\n"
    "Use JSON-first commands for reliable agent automation.\n"
    "Read commands return backend data; write commands modify backend todos through HTTP APIs.\n\n"
    "Examples:\n"
    "  freetodo todo list --status active --json\n"
    "  freetodo todo get --id 42 --json\n"
    "  freetodo todo create --input todo.json --json\n"
    "  freetodo todo update --id 42 --patch patch.json --json\n"
    "  freetodo todo delete --id 42 --json"
)

SCHEMA_MODELS = {
    "create": TodoCreate,
    "update": TodoUpdate,
    "reorder": TodoReorderRequest,
}

SCHEMA_EXAMPLES: dict[str, dict[str, Any]] = {
    "create": {
        "name": "Prepare weekly review",
        "description": "Collect notes and summarize progress",
        "status": "active",
        "priority": "medium",
    },
    "update": {"status": "completed", "percent_complete": 100},
    "reorder": {"items": [{"id": 1, "order": 10}, {"id": 2, "order": 20, "parent_todo_id": 1}]},
}

BATCH_UPDATE_EXAMPLE = {
    "items": [
        {"id": 1, "patch": {"status": "completed"}},
        {"id": 2, "patch": {"priority": "high", "percent_complete": 50}},
    ]
}


def create_todo_client() -> TodoApiClient:
    """Build a Todo API client from environment configuration."""
    return TodoApiClient(load_config())
