"""Schema and batch helpers for todo CLI commands."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import typer

from freetodo_cli.commands.common import (
    emit_dry_run,
    emit_success,
    handle_cli_error,
    model_payload,
    read_json_payload,
)
from freetodo_cli.commands.todo_helpers import (
    BATCH_UPDATE_EXAMPLE,
    SCHEMA_EXAMPLES,
    SCHEMA_MODELS,
    create_todo_client,
)
from freetodo_cli.errors import CliError
from freetodo_cli.schemas.todo import TodoUpdate

if TYPE_CHECKING:
    from typer import Typer


def _normalize_batch_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
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
    return normalized_items


def register_schema_routes(todo_app: Typer) -> None:
    @todo_app.command("schema")
    def todo_schema(
        kind: str = typer.Option(
            "create",
            "--kind",
            help="Schema kind to render: create, update, or reorder.",
            case_sensitive=False,
        ),
        include_example: bool = typer.Option(
            True, "--example/--no-example", help="Include an example payload."
        ),
        json_output: bool = typer.Option(
            True, "--json/--no-json", help="Emit structured JSON output."
        ),
    ) -> None:
        """Render JSON schema for todo command payloads."""
        normalized_kind = kind.lower()
        if normalized_kind not in SCHEMA_MODELS:
            raise typer.BadParameter("kind must be one of: create, update, reorder")
        data: dict[str, Any] = {
            "kind": normalized_kind,
            "schema": SCHEMA_MODELS[normalized_kind].model_json_schema(),
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

    @todo_app.command("batch-example")
    def batch_example(
        json_output: bool = typer.Option(
            True, "--json/--no-json", help="Emit structured JSON output."
        ),
    ) -> None:
        """Print an example payload for batch update."""
        emit_success(
            resource="todo",
            action="batch-example",
            data=BATCH_UPDATE_EXAMPLE,
            request_id="local-example",
            json_output=json_output,
        )


def register_batch_routes(todo_app: Typer) -> None:
    @todo_app.command("batch-update")
    def batch_update_todos(
        input_path: str | None = typer.Option(
            None, "--input", exists=True, dir_okay=False, help="Path to a batch update JSON file."
        ),
        use_stdin: bool = typer.Option(False, "--stdin", help="Read batch update JSON from stdin."),
        dry_run: bool = typer.Option(
            False, "--dry-run", help="Validate and preview the batch without sending it."
        ),
        json_output: bool = typer.Option(
            True, "--json/--no-json", help="Emit structured JSON output."
        ),
    ) -> None:
        """Update multiple todos sequentially from a JSON payload."""
        try:
            normalized_items = _normalize_batch_items(
                read_json_payload(input_path=input_path, use_stdin=use_stdin)
            )
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
            handle_cli_error(
                resource="todo", action="batch-update", error=exc, json_output=json_output
            )
