"""Event CLI commands."""

from __future__ import annotations

from typing import Annotated

import typer

from freetodo_cli.client import EventApiClient
from freetodo_cli.commands.common import emit_success, handle_cli_error
from freetodo_cli.config import load_config
from freetodo_cli.errors import CliError

event_app = typer.Typer(
    help=(
        "Event resource commands.\n\n"
        "Events represent foreground app usage windows. Use these commands to inspect detailed context.\n\n"
        "Examples:\n"
        "  freetodo event list --json\n"
        "  freetodo event get --id 42 --json\n"
        "  freetodo event context --id 42 --json\n"
        "  freetodo event generate-summary --id 42 --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)


def create_event_client() -> EventApiClient:
    """Build an Event API client from environment configuration."""
    return EventApiClient(load_config())


@event_app.command("list")
def list_events(
    limit: Annotated[
        int,
        typer.Option("--limit", min=1, max=200, help="Maximum number of events to return."),
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
    app_name: Annotated[
        str | None,
        typer.Option("--app-name", help="Optional app name filter."),
    ] = None,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """List events."""
    client = create_event_client()
    try:
        data, request_id = client.list_events(
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date,
            app_name=app_name,
        )
        emit_success(
            resource="event",
            action="list",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="event", action="list", error=exc, json_output=json_output)
    finally:
        client.close()


@event_app.command("count")
def count_events(
    start_date: Annotated[
        str | None,
        typer.Option("--start-date", help="Optional ISO datetime lower bound."),
    ] = None,
    end_date: Annotated[
        str | None,
        typer.Option("--end-date", help="Optional ISO datetime upper bound."),
    ] = None,
    app_name: Annotated[
        str | None,
        typer.Option("--app-name", help="Optional app name filter."),
    ] = None,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Count events."""
    client = create_event_client()
    try:
        data, request_id = client.count_events(
            start_date=start_date,
            end_date=end_date,
            app_name=app_name,
        )
        emit_success(
            resource="event",
            action="count",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="event", action="count", error=exc, json_output=json_output)
    finally:
        client.close()


@event_app.command("get")
def get_event(
    event_id: Annotated[int, typer.Option("--id", help="Event ID to fetch.")],
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get a single event."""
    client = create_event_client()
    try:
        data, request_id = client.get_event(event_id)
        emit_success(
            resource="event",
            action="get",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="event", action="get", error=exc, json_output=json_output)
    finally:
        client.close()


@event_app.command("context")
def get_event_context(
    event_id: Annotated[int, typer.Option("--id", help="Event ID to inspect.")],
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get OCR/text context for an event."""
    client = create_event_client()
    try:
        data, request_id = client.get_event_context(event_id)
        emit_success(
            resource="event",
            action="context",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="event", action="context", error=exc, json_output=json_output)
    finally:
        client.close()


@event_app.command("generate-summary")
def generate_event_summary(
    event_id: Annotated[int, typer.Option("--id", help="Event ID to summarize.")],
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Trigger summary generation for an event."""
    client = create_event_client()
    try:
        data, request_id = client.generate_event_summary(event_id)
        emit_success(
            resource="event",
            action="generate-summary",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="event",
            action="generate-summary",
            error=exc,
            json_output=json_output,
        )
    finally:
        client.close()
