"""Typer application assembly."""

from __future__ import annotations

import typer

from cli.commands.todo import todo_app

app = typer.Typer(
    help="Agent-friendly CLI for Lifetrace/FreeTodo backend operations.",
    no_args_is_help=True,
    add_completion=False,
)
app.add_typer(todo_app, name="todo")
