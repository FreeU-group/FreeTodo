"""Todo CLI commands."""

from __future__ import annotations

from typing import Annotated, Any

import typer

from cli.client import TodoApiClient
from cli.commands.common import (
    emit_dry_run,
    emit_success,
    handle_cli_error,
    model_payload,
    read_existing_file,
    read_json_payload,
)
from cli.config import load_config
from cli.errors import CliError
from cli.schemas.todo import TodoCreate, TodoReorderRequest, TodoUpdate

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

BATCH_UPDATE_EXAMPLE = {
    "items": [
        {"id": 1, "patch": {"status": "completed"}},
        {"id": 2, "patch": {"priority": "high", "percent_complete": 50}},
    ]
}


def create_todo_client() -> TodoApiClient:
    """Build a Todo API client from environment configuration."""
    return TodoApiClient(load_config())


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

    emit_success(
        resource="todo",
        action="schema",
        data=data,
        request_id="local-schema",
        json_output=json_output,
    )


@todo_app.command("batch-update")
def batch_update_todos(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input", exists=True, dir_okay=False, help="Path to a batch update JSON file."
        ),
    ] = None,
    use_stdin: Annotated[
        bool,
        typer.Option("--stdin", help="Read batch update JSON from stdin."),
    ] = False,
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Validate and preview the batch without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Update multiple todos sequentially from a JSON payload."""
    try:
        payload = read_json_payload(input_path=input_path, use_stdin=use_stdin)
        items = payload.get("items")
        if not isinstance(items, list) or not items:
            raise CliError(
                code="INVALID_BATCH",
                message="Batch payload must include a non-empty 'items' list",
                exit_code=2,
            )

        normalized_items: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                raise CliError(
                    code="INVALID_BATCH_ITEM",
                    message="Each batch item must be an object with 'id' and 'patch'",
                    exit_code=2,
                )
            todo_id = item.get("id")
            patch = item.get("patch")
            if not isinstance(todo_id, int) or not isinstance(patch, dict):
                raise CliError(
                    code="INVALID_BATCH_ITEM",
                    message="Each batch item must contain integer 'id' and object 'patch'",
                    exit_code=2,
                )
            normalized_patch = model_payload(TodoUpdate, patch)
            if not normalized_patch:
                raise CliError(
                    code="EMPTY_PATCH",
                    message=f"Batch item for todo {todo_id} has an empty patch",
                    exit_code=2,
                )
            normalized_items.append({"id": todo_id, "patch": normalized_patch})

        if dry_run:
            emit_dry_run(
                resource="todo",
                action="batch-update",
                payload={"items": normalized_items},
                json_output=json_output,
            )
            return

        client = create_todo_client()
        try:
            results: list[dict[str, Any]] = []
            request_ids: list[str] = []
            for item in normalized_items:
                data, request_id = client.update_todo(item["id"], item["patch"])
                results.append({"id": item["id"], "result": data})
                if request_id:
                    request_ids.append(request_id)
            emit_success(
                resource="todo",
                action="batch-update",
                data={"items": results, "count": len(results)},
                request_id=request_ids[-1] if request_ids else "batch-update",
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(resource="todo", action="batch-update", error=exc, json_output=json_output)


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
        emit_dry_run(
            resource="todo",
            action="delete",
            payload={"id": todo_id},
            json_output=json_output,
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
        payload = model_payload(
            TodoReorderRequest,
            read_json_payload(input_path=input_path, use_stdin=use_stdin),
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


@todo_app.command("attach")
def upload_attachments(
    todo_id: Annotated[int, typer.Option("--id", help="Todo ID to attach files to.")],
    files: Annotated[
        list[str], typer.Option("--file", help="Attachment file path. Repeat for multiple files.")
    ],
    dry_run: Annotated[
        bool,
        typer.Option(
            "--dry-run", help="Validate and preview the attachment upload without sending it."
        ),
    ] = False,
    json_output: Annotated[
        bool, typer.Option("--json/--no-json", help="Emit structured JSON output.")
    ] = True,
) -> None:
    """Upload one or more attachments to a todo."""
    try:
        if not files:
            raise CliError(code="MISSING_FILES", message="Provide at least one --file", exit_code=2)
        resolved_files = [str(read_existing_file(path)) for path in files]
        if dry_run:
            emit_dry_run(
                resource="todo",
                action="attach",
                payload={"todo_id": todo_id, "files": resolved_files},
                json_output=json_output,
            )
            return
        client = create_todo_client()
        try:
            data, request_id = client.upload_attachments(todo_id, resolved_files)
            emit_success(
                resource="todo",
                action="attach",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(resource="todo", action="attach", error=exc, json_output=json_output)


@todo_app.command("detach")
def detach_attachment(
    todo_id: Annotated[int, typer.Option("--id", help="Todo ID that owns the attachment.")],
    attachment_id: Annotated[int, typer.Option("--attachment-id", help="Attachment ID to unbind.")],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the detach request without sending it."),
    ] = False,
    json_output: Annotated[
        bool, typer.Option("--json/--no-json", help="Emit structured JSON output.")
    ] = True,
) -> None:
    """Detach an attachment from a todo."""
    try:
        if dry_run:
            emit_dry_run(
                resource="todo",
                action="detach",
                payload={"todo_id": todo_id, "attachment_id": attachment_id},
                json_output=json_output,
            )
            return
        client = create_todo_client()
        try:
            _, request_id = client.delete_attachment(todo_id, attachment_id)
            emit_success(
                resource="todo",
                action="detach",
                data={"detached": True, "todo_id": todo_id, "attachment_id": attachment_id},
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(resource="todo", action="detach", error=exc, json_output=json_output)


@todo_app.command("download-attachment")
def download_attachment(
    attachment_id: Annotated[
        int, typer.Option("--attachment-id", help="Attachment ID to download.")
    ],
    output_path: Annotated[
        str, typer.Option("--output", help="Path to save the downloaded attachment.")
    ],
    json_output: Annotated[
        bool, typer.Option("--json/--no-json", help="Emit structured JSON output.")
    ] = True,
) -> None:
    """Download an attachment file by attachment ID."""
    client = create_todo_client()
    try:
        data, request_id = client.download_attachment(attachment_id, output_path)
        emit_success(
            resource="todo",
            action="download-attachment",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="todo", action="download-attachment", error=exc, json_output=json_output
        )
    finally:
        client.close()


@todo_app.command("export-ics")
def export_ics(
    output_path: Annotated[
        str, typer.Option("--output", help="Path to save the exported ICS file.")
    ],
    limit: Annotated[
        int, typer.Option("--limit", min=1, max=2000, help="Maximum todos to export.")
    ] = 2000,
    offset: Annotated[
        int, typer.Option("--offset", min=0, help="Zero-based offset for export.")
    ] = 0,
    status: Annotated[
        str | None, typer.Option("--status", help="Optional status filter for export.")
    ] = None,
    json_output: Annotated[
        bool, typer.Option("--json/--no-json", help="Emit structured JSON output.")
    ] = True,
) -> None:
    """Export todos as an ICS file."""
    client = create_todo_client()
    try:
        data, request_id = client.export_ics(
            output_path=output_path,
            limit=limit,
            offset=offset,
            status=status,
        )
        emit_success(
            resource="todo",
            action="export-ics",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="todo", action="export-ics", error=exc, json_output=json_output)
    finally:
        client.close()


@todo_app.command("import-ics")
def import_ics(
    input_path: Annotated[
        str, typer.Option("--input", exists=True, dir_okay=False, help="Path to an ICS file.")
    ],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the ICS import request without sending it."),
    ] = False,
    json_output: Annotated[
        bool, typer.Option("--json/--no-json", help="Emit structured JSON output.")
    ] = True,
) -> None:
    """Import todos from an ICS file."""
    try:
        file_path = str(read_existing_file(input_path))
        if dry_run:
            emit_dry_run(
                resource="todo",
                action="import-ics",
                payload={"file": file_path},
                json_output=json_output,
            )
            return
        client = create_todo_client()
        try:
            data, request_id = client.import_ics(file_path)
            emit_success(
                resource="todo",
                action="import-ics",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(resource="todo", action="import-ics", error=exc, json_output=json_output)
