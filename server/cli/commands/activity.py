"""Activity CLI commands."""

from __future__ import annotations

from typing import Annotated, Any

import typer

from cli.client import ActivityApiClient
from cli.commands.common import (
    emit_dry_run,
    emit_success,
    handle_cli_error,
    model_payload,
    read_json_payload,
)
from cli.config import load_config
from cli.errors import CliError
from schemas.activity import ManualActivityCreateRequest

activity_app = typer.Typer(
    help=(
        "Activity resource commands.\n\n"
        "Activities are aggregated event windows. Use these commands to inspect or manually create them.\n\n"
        "Examples:\n"
        "  freetodo activity list --json\n"
        "  freetodo activity events --id 42 --json\n"
        "  freetodo activity create-manual --input activity.json --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)

SCHEMA_EXAMPLES: dict[str, dict[str, Any]] = {
    "create-manual": {"event_ids": [101, 102, 103]},
}


def create_activity_client() -> ActivityApiClient:
    """Build an Activity API client from environment configuration."""
    return ActivityApiClient(load_config())


@activity_app.command("schema")
def activity_schema(
    kind: Annotated[
        str,
        typer.Option("--kind", help="Schema kind to render. Currently: create-manual."),
    ] = "create-manual",
    include_example: Annotated[
        bool,
        typer.Option("--example/--no-example", help="Include an example payload."),
    ] = True,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Render JSON schema for activity command payloads."""
    normalized_kind = kind.lower()
    if normalized_kind != "create-manual":
        raise typer.BadParameter("kind must be: create-manual")

    data: dict[str, Any] = {
        "kind": normalized_kind,
        "schema": ManualActivityCreateRequest.model_json_schema(),
    }
    if include_example:
        data["example"] = SCHEMA_EXAMPLES[normalized_kind]

    emit_success(
        resource="activity",
        action="schema",
        data=data,
        request_id="local-schema",
        json_output=json_output,
    )


@activity_app.command("list")
def list_activities(
    limit: Annotated[
        int,
        typer.Option("--limit", min=1, max=200, help="Maximum number of activities to return."),
    ] = 50,
    offset: Annotated[
        int,
        typer.Option("--offset", min=0, help="Zero-based offset for pagination."),
    ] = 0,
    start_date: Annotated[
        str | None,
        typer.Option("--start-date", help="Optional ISO datetime lower bound."),
    ] = None,
    end_date: Annotated[
        str | None,
        typer.Option("--end-date", help="Optional ISO datetime upper bound."),
    ] = None,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """List activities."""
    client = create_activity_client()
    try:
        data, request_id = client.list_activities(
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date,
        )
        emit_success(
            resource="activity",
            action="list",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="activity", action="list", error=exc, json_output=json_output)
    finally:
        client.close()


@activity_app.command("events")
def get_activity_events(
    activity_id: Annotated[int, typer.Option("--id", help="Activity ID to inspect.")],
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get event IDs linked to an activity."""
    client = create_activity_client()
    try:
        data, request_id = client.get_activity_events(activity_id)
        emit_success(
            resource="activity",
            action="events",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="activity", action="events", error=exc, json_output=json_output)
    finally:
        client.close()


@activity_app.command("create-manual")
def create_activity_manual(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching ManualActivityCreateRequest schema.",
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
    """Create an activity by manually grouping event IDs."""
    try:
        payload = model_payload(
            ManualActivityCreateRequest,
            read_json_payload(input_path=input_path, use_stdin=use_stdin),
        )
        if dry_run:
            emit_dry_run(
                resource="activity",
                action="create-manual",
                payload=payload,
                json_output=json_output,
            )
            return
        client = create_activity_client()
        try:
            data, request_id = client.create_activity_manual(payload)
            emit_success(
                resource="activity",
                action="create-manual",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(
            resource="activity",
            action="create-manual",
            error=exc,
            json_output=json_output,
        )
