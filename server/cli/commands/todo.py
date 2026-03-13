"""Todo CLI commands."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Annotated, Any

import typer
from pydantic import ValidationError

from cli.client import TodoApiClient
from cli.config import load_config
from cli.errors import CliError
from cli.output import build_envelope, emit_json
from schemas.todo import TodoCreate, TodoReorderRequest, TodoUpdate

todo_app = typer.Typer(
    help=(
        "Todo resource commands.\n\n"
        "Use JSON-first commands for reliable agent automation.\n"
        "Read commands return backend data; write commands modify backend todos through HTTP APIs.\n\n"
        "Examples:\n"
        "  freetodo todo list --status active --json\n"
        "  freetodo todo get --id 42 --json\n"
        "  freetodo todo create --input todo.json --json\n"
        "  freetodo todo update --id 42 --patch patch.json --json\n"
        "  freetodo todo delete --id 42 --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)

SCHEMA_EXAMPLES: dict[str, dict[str, Any]] = {
    "create": {
        "name": "Prepare weekly review",
        "description": "Collect notes and summarize progress",
        "status": "active",
        "priority": "medium",
    },
    "update": {
        "status": "completed",
        "percent_complete": 100,
    },
    "reorder": {
        "items": [
            {"id": 1, "order": 10},
            {"id": 2, "order": 20, "parent_todo_id": 1},
        ]
    },
}


def create_todo_client() -> TodoApiClient:
    """Build a Todo API client from environment configuration."""
    return TodoApiClient(load_config())


def _read_json_payload(
    *,
    input_path: str | None,
    use_stdin: bool,
) -> dict[str, Any]:
    if input_path and use_stdin:
        raise CliError(
            code="INVALID_INPUT_MODE",
            message="Use either --input or --stdin, not both",
            exit_code=2,
        )
    if input_path:
        try:
            return json.loads(Path(input_path).read_text(encoding="utf-8"))
        except OSError as exc:
            raise CliError(
                code="INPUT_READ_FAILED",
                message=f"Failed to read input file: {exc}",
                exit_code=2,
            ) from exc
        except json.JSONDecodeError as exc:
            raise CliError(
                code="INVALID_JSON",
                message=f"Input file does not contain valid JSON: {exc}",
                exit_code=2,
            ) from exc
    if use_stdin:
        raw = sys.stdin.read()
        if not raw.strip():
            raise CliError(
                code="EMPTY_STDIN",
                message="Expected JSON payload on stdin",
                exit_code=2,
            )
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise CliError(
                code="INVALID_JSON",
                message=f"stdin does not contain valid JSON: {exc}",
                exit_code=2,
            ) from exc
    raise CliError(
        code="MISSING_INPUT",
        message="Provide JSON via --input or --stdin",
        exit_code=2,
    )


def _model_payload(
    model_cls: type[TodoCreate] | type[TodoUpdate] | type[TodoReorderRequest],
    payload: dict[str, Any],
) -> dict[str, Any]:
    try:
        model = model_cls.model_validate(payload)
    except ValidationError as exc:
        raise CliError(
            code="VALIDATION_ERROR",
            message="Payload validation failed",
            exit_code=2,
            details={"errors": exc.errors()},
        ) from exc
    return model.model_dump(mode="json", exclude_unset=True)


def _emit_success(
    *,
    resource: str,
    action: str,
    data: Any,
    request_id: str | None,
    json_output: bool,
    dry_run: bool = False,
) -> None:
    payload = build_envelope(
        ok=True,
        resource=resource,
        action=action,
        data=data,
        request_id=request_id,
        dry_run=dry_run,
    )
    if json_output:
        emit_json(payload)
        return
    typer.echo(json.dumps(payload, ensure_ascii=False, indent=2))


def _handle_cli_error(*, resource: str, action: str, error: CliError, json_output: bool) -> None:
    payload = build_envelope(
        ok=False,
        resource=resource,
        action=action,
        data=None,
        error={
            "code": error.code,
            "message": error.message,
            "details": error.details or {},
        },
    )
    if json_output:
        emit_json(payload, stream="stderr")
    else:
        typer.echo(json.dumps(payload, ensure_ascii=False, indent=2), err=True)
    raise typer.Exit(code=error.exit_code)


def _emit_dry_run(
    *,
    action: str,
    payload: Any,
    json_output: bool,
    extra: dict[str, Any] | None = None,
) -> None:
    dry_run_data = {"payload": payload}
    if extra:
        dry_run_data.update(extra)
    _emit_success(
        resource="todo",
        action=action,
        data=dry_run_data,
        request_id="dry-run",
        json_output=json_output,
        dry_run=True,
    )


@todo_app.command("schema")
def todo_schema(
    kind: Annotated[
        str,
        typer.Option(
            "--kind",
            help="Schema kind to render: create, update, or reorder.",
            case_sensitive=False,
        ),
    ] = "create",
    include_example: Annotated[
        bool,
        typer.Option("--example/--no-example", help="Include an example payload."),
    ] = True,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Render JSON schema for todo command payloads."""
    schema_map = {
        "create": TodoCreate,
        "update": TodoUpdate,
        "reorder": TodoReorderRequest,
    }
    normalized_kind = kind.lower()
    if normalized_kind not in schema_map:
        raise typer.BadParameter("kind must be one of: create, update, reorder")

    data: dict[str, Any] = {
        "kind": normalized_kind,
        "schema": schema_map[normalized_kind].model_json_schema(),
    }
    if include_example:
        data["example"] = SCHEMA_EXAMPLES[normalized_kind]

    _emit_success(
        resource="todo",
        action="schema",
        data=data,
        request_id="local-schema",
        json_output=json_output,
    )


@todo_app.command("list")
def list_todos(
    limit: Annotated[
        int,
        typer.Option("--limit", min=1, max=2000, help="Maximum number of todos to return."),
    ] = 200,
    offset: Annotated[
        int,
        typer.Option("--offset", min=0, help="Zero-based offset for pagination."),
    ] = 0,
    status: Annotated[
        str | None,
        typer.Option("--status", help="Optional status filter, e.g. active/completed/canceled."),
    ] = None,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """List todos."""
    client = create_todo_client()
    try:
        data, request_id = client.list_todos(limit=limit, offset=offset, status=status)
        _emit_success(
            resource="todo",
            action="list",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        _handle_cli_error(resource="todo", action="list", error=exc, json_output=json_output)
    finally:
        client.close()


@todo_app.command("get")
def get_todo(
    todo_id: Annotated[
        int,
        typer.Option("--id", help="Todo ID to fetch."),
    ],
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get a single todo."""
    client = create_todo_client()
    try:
        data, request_id = client.get_todo(todo_id)
        _emit_success(
            resource="todo", action="get", data=data, request_id=request_id, json_output=json_output
        )
    except CliError as exc:
        _handle_cli_error(resource="todo", action="get", error=exc, json_output=json_output)
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
        bool,
        typer.Option("--stdin", help="Read JSON payload from stdin."),
    ] = False,
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Validate and preview the request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Create a todo from JSON input."""
    try:
        payload = _model_payload(
            TodoCreate, _read_json_payload(input_path=input_path, use_stdin=use_stdin)
        )
        if dry_run:
            _emit_dry_run(action="create", payload=payload, json_output=json_output)
            return
        client = create_todo_client()
        try:
            data, request_id = client.create_todo(payload)
            _emit_success(
                resource="todo",
                action="create",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        _handle_cli_error(resource="todo", action="create", error=exc, json_output=json_output)


@todo_app.command("update")
def update_todo(
    todo_id: Annotated[
        int,
        typer.Option("--id", help="Todo ID to update."),
    ],
    input_path: Annotated[
        str | None,
        typer.Option(
            "--patch",
            exists=True,
            dir_okay=False,
            help="Path to a partial JSON payload matching TodoUpdate schema.",
        ),
    ] = None,
    use_stdin: Annotated[
        bool,
        typer.Option("--stdin", help="Read patch JSON from stdin."),
    ] = False,
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Validate and preview the request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Update a todo with a partial JSON payload."""
    try:
        payload = _model_payload(
            TodoUpdate, _read_json_payload(input_path=input_path, use_stdin=use_stdin)
        )
        if not payload:
            raise CliError(
                code="EMPTY_PATCH",
                message="Update payload must include at least one field",
                exit_code=2,
            )
        if dry_run:
            _emit_dry_run(
                action="update",
                payload=payload,
                json_output=json_output,
                extra={"todo_id": todo_id},
            )
            return
        client = create_todo_client()
        try:
            data, request_id = client.update_todo(todo_id, payload)
            _emit_success(
                resource="todo",
                action="update",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        _handle_cli_error(resource="todo", action="update", error=exc, json_output=json_output)


@todo_app.command("delete")
def delete_todo(
    todo_id: Annotated[
        int,
        typer.Option("--id", help="Todo ID to delete."),
    ],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the delete request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Delete a todo."""
    if dry_run:
        _emit_dry_run(
            action="delete",
            payload={"id": todo_id},
            json_output=json_output,
        )
        return
    client = create_todo_client()
    try:
        _, request_id = client.delete_todo(todo_id)
        _emit_success(
            resource="todo",
            action="delete",
            data={"deleted": True, "id": todo_id},
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        _handle_cli_error(resource="todo", action="delete", error=exc, json_output=json_output)
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
        bool,
        typer.Option("--stdin", help="Read reorder JSON from stdin."),
    ] = False,
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Validate and preview the request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Reorder todos using a JSON payload."""
    try:
        payload = _model_payload(
            TodoReorderRequest,
            _read_json_payload(input_path=input_path, use_stdin=use_stdin),
        )
        if dry_run:
            _emit_dry_run(action="reorder", payload=payload, json_output=json_output)
            return
        client = create_todo_client()
        try:
            data, request_id = client.reorder_todos(payload)
            _emit_success(
                resource="todo",
                action="reorder",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        _handle_cli_error(resource="todo", action="reorder", error=exc, json_output=json_output)
