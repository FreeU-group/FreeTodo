"""Typer application assembly."""

from __future__ import annotations

import typer

from cli.commands.todo import todo_app

app = typer.Typer(
    help=(
        "Agent-first CLI for Lifetrace/FreeTodo backend operations.\n\n"
        "English first, with key Chinese hints for human operators.\n"
        "Use this CLI to read and modify backend resources through the HTTP API.\n\n"
        "Quick start:\n"
        "  1. Start server: uv run --directory server python server.py\n"
        "  2. List todos:   uv run --directory server python -m cli.main todo list --json\n"
        "  3. Create todo:  uv run --directory server python -m cli.main todo create --input todo.json --json\n\n"
        "Environment variables:\n"
        "  FREETODO_BASE_URL   Backend base URL. Default: http://127.0.0.1:8001\n"
        "  FREETODO_API_TOKEN  Bearer token for authenticated deployments\n"
        "  FREETODO_TIMEOUT_SEC  HTTP timeout in seconds. Default: 30\n\n"
        "Agent usage recommendation:\n"
        "  Prefer --json and file/stdin input for stable automation.\n\n"
        "面向 Agent 的命令行入口。默认优先英文，并为人工使用者补充中文提示。"
    ),
    no_args_is_help=True,
    add_completion=False,
)
app.add_typer(todo_app, name="todo")
