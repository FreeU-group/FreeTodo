"""Location CLI commands."""

from __future__ import annotations

from typing import Annotated, Any

import typer
from pydantic import BaseModel, Field

from freetodo_cli.client import LocationApiClient
from freetodo_cli.commands.common import (
    emit_dry_run,
    emit_success,
    handle_cli_error,
    model_payload,
    read_json_payload,
)
from freetodo_cli.config import load_config
from freetodo_cli.errors import CliError


class LocationReportModel(BaseModel):
    """CLI validation model for location reports."""

    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    altitude: float | None = None
    accuracy: float | None = Field(default=None, ge=0)
    speed: float | None = None
    heading: float | None = None
    timestamp: str | None = None
    source: str = Field(default="mobile_gps", min_length=1)


location_app = typer.Typer(
    help=(
        "Location resource commands.\n\n"
        "Use these commands to report GPS fixes and inspect stored location history.\n\n"
        "Examples:\n"
        "  freetodo location latest --json\n"
        "  freetodo location history --limit 20 --json\n"
        "  freetodo location report --input location.json --dry-run --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)

SCHEMA_EXAMPLES: dict[str, dict[str, Any]] = {
    "report": {
        "latitude": 31.2304,
        "longitude": 121.4737,
        "accuracy": 15.0,
        "source": "mobile_gps",
    }
}


def create_location_client() -> LocationApiClient:
    """Build a Location API client from environment configuration."""
    return LocationApiClient(load_config())


@location_app.command("schema")
def location_schema(
    kind: Annotated[
        str,
        typer.Option(
            "--kind",
            help="Schema kind to render. Currently: report.",
            case_sensitive=False,
        ),
    ] = "report",
    include_example: Annotated[
        bool,
        typer.Option("--example/--no-example", help="Include an example payload."),
    ] = True,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Render JSON schema for location payloads."""
    normalized_kind = kind.lower()
    if normalized_kind != "report":
        raise typer.BadParameter("kind must be: report")

    data: dict[str, Any] = {
        "kind": normalized_kind,
        "schema": LocationReportModel.model_json_schema(),
    }
    if include_example:
        data["example"] = SCHEMA_EXAMPLES[normalized_kind]

    emit_success(
        resource="location",
        action="schema",
        data=data,
        request_id="local-schema",
        json_output=json_output,
    )


@location_app.command("report")
def report_location(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching the location report schema.",
        ),
    ] = None,
    use_stdin: Annotated[
        bool,
        typer.Option("--stdin", help="Read a location report JSON payload from stdin."),
    ] = False,
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Validate and preview the report without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Report a GPS location fix."""
    try:
        payload = model_payload(
            LocationReportModel,
            read_json_payload(input_path=input_path, use_stdin=use_stdin),
        )
        if dry_run:
            emit_dry_run(
                resource="location",
                action="report",
                payload=payload,
                json_output=json_output,
            )
            return
        client = create_location_client()
        try:
            data, request_id = client.report_location(payload)
            emit_success(
                resource="location",
                action="report",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(resource="location", action="report", error=exc, json_output=json_output)


@location_app.command("latest")
def get_latest_location(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get the latest stored location."""
    client = create_location_client()
    try:
        data, request_id = client.get_latest_location()
        emit_success(
            resource="location",
            action="latest",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="location", action="latest", error=exc, json_output=json_output)
    finally:
        client.close()


@location_app.command("history")
def get_location_history(
    start: Annotated[
        str | None,
        typer.Option("--start", help="Optional ISO 8601 start timestamp."),
    ] = None,
    end: Annotated[
        str | None,
        typer.Option("--end", help="Optional ISO 8601 end timestamp."),
    ] = None,
    limit: Annotated[
        int,
        typer.Option("--limit", min=1, max=1000, help="Maximum number of locations to return."),
    ] = 100,
    offset: Annotated[
        int,
        typer.Option("--offset", min=0, help="Zero-based offset for pagination."),
    ] = 0,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get location history."""
    client = create_location_client()
    try:
        data, request_id = client.get_location_history(
            start=start, end=end, limit=limit, offset=offset
        )
        emit_success(
            resource="location",
            action="history",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="location", action="history", error=exc, json_output=json_output)
    finally:
        client.close()
