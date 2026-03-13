"""Automation CLI commands."""

from __future__ import annotations

from typing import Annotated, Any

import typer

from cli.client import AutomationApiClient
from cli.commands.common import (
    emit_dry_run,
    emit_success,
    handle_cli_error,
    model_payload,
    read_json_payload,
)
from cli.config import load_config
from cli.errors import CliError
from schemas.automation import AutomationTaskCreate, AutomationTaskUpdate

automation_app = typer.Typer(
    help=(
        "Automation task commands.\n\n"
        "Use these commands to inspect, create, update, and control backend automation tasks.\n\n"
        "Examples:\n"
        "  freetodo automation list --json\n"
        "  freetodo automation create --input task.json --json\n"
        "  freetodo automation run --id 12 --json\n"
        "  freetodo automation pause --id 12 --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)

SCHEMA_EXAMPLES: dict[str, dict[str, Any]] = {
    "create": {
        "name": "Daily fetch",
        "description": "Run a daily web fetch job",
        "enabled": True,
        "schedule": {"type": "interval", "interval_seconds": 3600},
        "action": {"type": "web_fetch", "payload": {"url": "https://example.com"}},
    },
    "update": {
        "enabled": False,
        "description": "Temporarily paused",
    },
}


def create_automation_client() -> AutomationApiClient:
    """Build an Automation API client from environment configuration."""
    return AutomationApiClient(load_config())


@automation_app.command("schema")
def automation_schema(
    kind: Annotated[
        str,
        typer.Option(
            "--kind", help="Schema kind to render: create or update.", case_sensitive=False
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
    """Render JSON schema for automation task payloads."""
    schema_map = {"create": AutomationTaskCreate, "update": AutomationTaskUpdate}
    normalized_kind = kind.lower()
    if normalized_kind not in schema_map:
        raise typer.BadParameter("kind must be one of: create, update")

    data: dict[str, Any] = {
        "kind": normalized_kind,
        "schema": schema_map[normalized_kind].model_json_schema(),
    }
    if include_example:
        data["example"] = SCHEMA_EXAMPLES[normalized_kind]

    emit_success(
        resource="automation",
        action="schema",
        data=data,
        request_id="local-schema",
        json_output=json_output,
    )


@automation_app.command("list")
def list_tasks(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """List automation tasks."""
    client = create_automation_client()
    try:
        data, request_id = client.list_tasks()
        emit_success(
            resource="automation",
            action="list",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="automation", action="list", error=exc, json_output=json_output)
    finally:
        client.close()


@automation_app.command("get")
def get_task(
    task_id: Annotated[int, typer.Option("--id", help="Automation task ID to fetch.")],
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get a single automation task."""
    client = create_automation_client()
    try:
        data, request_id = client.get_task(task_id)
        emit_success(
            resource="automation",
            action="get",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="automation", action="get", error=exc, json_output=json_output)
    finally:
        client.close()


@automation_app.command("create")
def create_task(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching AutomationTaskCreate schema.",
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
    """Create an automation task."""
    try:
        payload = model_payload(
            AutomationTaskCreate,
            read_json_payload(input_path=input_path, use_stdin=use_stdin),
        )
        if dry_run:
            emit_dry_run(
                resource="automation",
                action="create",
                payload=payload,
                json_output=json_output,
            )
            return
        client = create_automation_client()
        try:
            data, request_id = client.create_task(payload)
            emit_success(
                resource="automation",
                action="create",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(resource="automation", action="create", error=exc, json_output=json_output)


@automation_app.command("update")
def update_task(
    task_id: Annotated[int, typer.Option("--id", help="Automation task ID to update.")],
    input_path: Annotated[
        str | None,
        typer.Option(
            "--patch",
            exists=True,
            dir_okay=False,
            help="Path to a partial JSON payload matching AutomationTaskUpdate schema.",
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
    """Update an automation task."""
    try:
        payload = model_payload(
            AutomationTaskUpdate,
            read_json_payload(input_path=input_path, use_stdin=use_stdin),
        )
        if not payload:
            raise CliError(
                code="EMPTY_PATCH",
                message="Update payload must include at least one field",
                exit_code=2,
            )
        if dry_run:
            emit_dry_run(
                resource="automation",
                action="update",
                payload=payload,
                json_output=json_output,
                extra={"task_id": task_id},
            )
            return
        client = create_automation_client()
        try:
            data, request_id = client.update_task(task_id, payload)
            emit_success(
                resource="automation",
                action="update",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(resource="automation", action="update", error=exc, json_output=json_output)


@automation_app.command("delete")
def delete_task(
    task_id: Annotated[int, typer.Option("--id", help="Automation task ID to delete.")],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the delete request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Delete an automation task."""
    if dry_run:
        emit_dry_run(
            resource="automation",
            action="delete",
            payload={"id": task_id},
            json_output=json_output,
        )
        return
    client = create_automation_client()
    try:
        data, request_id = client.delete_task(task_id)
        emit_success(
            resource="automation",
            action="delete",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="automation", action="delete", error=exc, json_output=json_output)
    finally:
        client.close()


def _task_control_action(
    *,
    action: str,
    task_id: int,
    dry_run: bool,
    json_output: bool,
) -> None:
    if dry_run:
        emit_dry_run(
            resource="automation",
            action=action,
            payload={"id": task_id},
            json_output=json_output,
        )
        return
    client = create_automation_client()
    try:
        data, request_id = getattr(client, f"{action}_task")(task_id)
        emit_success(
            resource="automation",
            action=action,
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    finally:
        client.close()


@automation_app.command("run")
def run_task(
    task_id: Annotated[int, typer.Option("--id", help="Automation task ID to run.")],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the run request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Run an automation task immediately."""
    try:
        _task_control_action(
            action="run", task_id=task_id, dry_run=dry_run, json_output=json_output
        )
    except CliError as exc:
        handle_cli_error(resource="automation", action="run", error=exc, json_output=json_output)


@automation_app.command("pause")
def pause_task(
    task_id: Annotated[int, typer.Option("--id", help="Automation task ID to pause.")],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the pause request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Pause an automation task."""
    try:
        _task_control_action(
            action="pause", task_id=task_id, dry_run=dry_run, json_output=json_output
        )
    except CliError as exc:
        handle_cli_error(resource="automation", action="pause", error=exc, json_output=json_output)


@automation_app.command("resume")
def resume_task(
    task_id: Annotated[int, typer.Option("--id", help="Automation task ID to resume.")],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the resume request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Resume an automation task."""
    try:
        _task_control_action(
            action="resume", task_id=task_id, dry_run=dry_run, json_output=json_output
        )
    except CliError as exc:
        handle_cli_error(resource="automation", action="resume", error=exc, json_output=json_output)
