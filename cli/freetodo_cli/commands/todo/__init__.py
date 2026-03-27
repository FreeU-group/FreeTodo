"""Todo CLI commands."""

from __future__ import annotations

from typing import Annotated

import typer

from freetodo_cli.commands.common import (
    emit_dry_run,
    emit_success,
    handle_cli_error,
    model_payload,
    read_json_payload,
)
from freetodo_cli.commands.todo_batch import register_batch_routes, register_schema_routes
from freetodo_cli.commands.todo_helpers import TODO_HELP_TEXT, create_todo_client
from freetodo_cli.commands.todo_transfer import register_transfer_routes
from freetodo_cli.errors import CliError
from freetodo_cli.schemas.todo import TodoCreate, TodoReorderRequest, TodoUpdate

todo_app = typer.Typer(help=TODO_HELP_TEXT, no_args_is_help=True, add_completion=False)


@todo_app.command("list")
def list_todos(
    limit: Annotated[
        int, typer.Option("--limit", min=1, max=2000, help="Maximum number of todos to return.")
    ] = 200,
    offset: Annotated[
        int, typer.Option("--offset", min=0, help="Zero-based offset for pagination.")
    ] = 0,
    status: Annotated[
        str | None,
        typer.Option("--status", help="Optional status filter, e.g. active/completed/canceled."),
    ] = None,
    json_output: Annotated[
        bool, typer.Option("--json/--no-json", help="Emit structured JSON output.")
    ] = True,
) -> None:
    """List todos."""
    client = create_todo_client()
    try:
        data, request_id = client.list_todos(limit=limit, offset=offset, status=status)
        emit_success(
            resource="todo",
            action="list",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="todo", action="list", error=exc, json_output=json_output)
    finally:
        client.close()


@todo_app.command("get")
def get_todo(
    todo_id: Annotated[int, typer.Option("--id", help="Todo ID to fetch.")],
    json_output: Annotated[
        bool, typer.Option("--json/--no-json", help="Emit structured JSON output.")
    ] = True,
) -> None:
    """Get a single todo."""
    client = create_todo_client()
    try:
        data, request_id = client.get_todo(todo_id)
        emit_success(
            resource="todo", action="get", data=data, request_id=request_id, json_output=json_output
        )
    except CliError as exc:
        handle_cli_error(resource="todo", action="get", error=exc, json_output=json_output)
    finally:
        client.close()


@todo_app.command("create")
def create_todo(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching TodoCreate schema.",
        ),
    ] = None,
    use_stdin: Annotated[
        bool, typer.Option("--stdin", help="Read JSON payload from stdin.")
    ] = False,
    dry_run: Annotated[
        bool, typer.Option("--dry-run", help="Validate and preview the request without sending it.")
    ] = False,
    json_output: Annotated[
        bool, typer.Option("--json/--no-json", help="Emit structured JSON output.")
    ] = True,
) -> None:
    """Create a todo from JSON input."""
    try:
        payload = model_payload(
            TodoCreate, read_json_payload(input_path=input_path, use_stdin=use_stdin)
        )
        if dry_run:
            emit_dry_run(resource="todo", action="create", payload=payload, json_output=json_output)
            return
        client = create_todo_client()
        try:
            data, request_id = client.create_todo(payload)
            emit_success(
                resource="todo",
                action="create",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(resource="todo", action="create", error=exc, json_output=json_output)


@todo_app.command("update")
def update_todo(
    todo_id: Annotated[int, typer.Option("--id", help="Todo ID to update.")],
    input_path: Annotated[
        str | None,
        typer.Option(
            "--patch",
            exists=True,
            dir_okay=False,
            help="Path to a partial JSON payload matching TodoUpdate schema.",
        ),
    ] = None,
    use_stdin: Annotated[bool, typer.Option("--stdin", help="Read patch JSON from stdin.")] = False,
    dry_run: Annotated[
        bool, typer.Option("--dry-run", help="Validate and preview the request without sending it.")
    ] = False,
    json_output: Annotated[
        bool, typer.Option("--json/--no-json", help="Emit structured JSON output.")
    ] = True,
) -> None:
    """Update a todo with a partial JSON payload."""
    try:
        payload = model_payload(
            TodoUpdate, read_json_payload(input_path=input_path, use_stdin=use_stdin)
        )
        if not payload:
            raise CliError(
                code="EMPTY_PATCH",
                message="Update payload must include at least one field",
                exit_code=2,
            )
        if dry_run:
            emit_dry_run(
                resource="todo",
                action="update",
                payload=payload,
                json_output=json_output,
                extra={"todo_id": todo_id},
            )
            return
        client = create_todo_client()
        try:
            data, request_id = client.update_todo(todo_id, payload)
            emit_success(
                resource="todo",
                action="update",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(resource="todo", action="update", error=exc, json_output=json_output)


@todo_app.command("delete")
def delete_todo(
    todo_id: Annotated[int, typer.Option("--id", help="Todo ID to delete.")],
    dry_run: Annotated[
        bool, typer.Option("--dry-run", help="Preview the delete request without sending it.")
    ] = False,
    json_output: Annotated[
        bool, typer.Option("--json/--no-json", help="Emit structured JSON output.")
    ] = True,
) -> None:
    """Delete a todo."""
    if dry_run:
        emit_dry_run(
            resource="todo", action="delete", payload={"id": todo_id}, json_output=json_output
        )
        return
    client = create_todo_client()
    try:
        _, request_id = client.delete_todo(todo_id)
        emit_success(
            resource="todo",
            action="delete",
            data={"deleted": True, "id": todo_id},
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="todo", action="delete", error=exc, json_output=json_output)
    finally:
        client.close()


@todo_app.command("reorder")
def reorder_todos(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching TodoReorderRequest schema.",
        ),
    ] = None,
    use_stdin: Annotated[
        bool, typer.Option("--stdin", help="Read reorder JSON from stdin.")
    ] = False,
    dry_run: Annotated[
        bool, typer.Option("--dry-run", help="Validate and preview the request without sending it.")
    ] = False,
    json_output: Annotated[
        bool, typer.Option("--json/--no-json", help="Emit structured JSON output.")
    ] = True,
) -> None:
    """Reorder todos using a JSON payload."""
    try:
        payload = model_payload(
            TodoReorderRequest, read_json_payload(input_path=input_path, use_stdin=use_stdin)
        )
        if dry_run:
            emit_dry_run(
                resource="todo", action="reorder", payload=payload, json_output=json_output
            )
            return
        client = create_todo_client()
        try:
            data, request_id = client.reorder_todos(payload)
            emit_success(
                resource="todo",
                action="reorder",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(resource="todo", action="reorder", error=exc, json_output=json_output)


register_schema_routes(todo_app)
register_batch_routes(todo_app)
register_transfer_routes(todo_app)
