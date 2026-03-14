"""Search CLI commands."""

from __future__ import annotations

from typing import Annotated, Any

import typer

from freetodo_cli.client import SearchApiClient
from freetodo_cli.commands.common import emit_success, handle_cli_error, read_json_payload
from freetodo_cli.config import load_config
from freetodo_cli.errors import CliError

search_app = typer.Typer(
    help=(
        "Search resource commands.\n\n"
        "Use these commands to search screenshots and events through backend OCR indexes.\n\n"
        "Examples:\n"
        "  freetodo search screenshots --query meeting notes --json\n"
        "  freetodo search events --input search.json --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)


def create_search_client() -> SearchApiClient:
    """Build a Search API client from environment configuration."""
    return SearchApiClient(load_config())


def _search_payload(
    *,
    query: str | None,
    start_date: str | None,
    end_date: str | None,
    app_name: str | None,
    limit: int,
    input_path: str | None,
) -> dict[str, Any]:
    if input_path:
        return read_json_payload(input_path=input_path, use_stdin=False)

    payload: dict[str, Any] = {"limit": limit}
    if query is not None:
        payload["query"] = query
    if start_date is not None:
        payload["start_date"] = start_date
    if end_date is not None:
        payload["end_date"] = end_date
    if app_name is not None:
        payload["app_name"] = app_name
    return payload


@search_app.command("screenshots")
def search_screenshots(
    query: Annotated[
        str | None,
        typer.Option("--query", help="Search text to match against screenshot OCR."),
    ] = None,
    start_date: Annotated[
        str | None,
        typer.Option("--start-date", help="Optional start timestamp filter."),
    ] = None,
    end_date: Annotated[
        str | None,
        typer.Option("--end-date", help="Optional end timestamp filter."),
    ] = None,
    app_name: Annotated[
        str | None,
        typer.Option("--app-name", help="Optional app name filter."),
    ] = None,
    limit: Annotated[
        int,
        typer.Option("--limit", min=1, max=500, help="Maximum number of matches to return."),
    ] = 50,
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Optional JSON file matching the backend search request shape.",
        ),
    ] = None,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Search screenshot OCR results."""
    client = create_search_client()
    try:
        payload = _search_payload(
            query=query,
            start_date=start_date,
            end_date=end_date,
            app_name=app_name,
            limit=limit,
            input_path=input_path,
        )
        data, request_id = client.search_screenshots(payload)
        emit_success(
            resource="search",
            action="screenshots",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="search", action="screenshots", error=exc, json_output=json_output
        )
    finally:
        client.close()


@search_app.command("events")
def search_events(
    query: Annotated[
        str | None,
        typer.Option("--query", help="Search text to match against event OCR groupings."),
    ] = None,
    start_date: Annotated[
        str | None,
        typer.Option("--start-date", help="Optional start timestamp filter."),
    ] = None,
    end_date: Annotated[
        str | None,
        typer.Option("--end-date", help="Optional end timestamp filter."),
    ] = None,
    app_name: Annotated[
        str | None,
        typer.Option("--app-name", help="Optional app name filter."),
    ] = None,
    limit: Annotated[
        int,
        typer.Option("--limit", min=1, max=500, help="Maximum number of matches to return."),
    ] = 50,
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Optional JSON file matching the backend search request shape.",
        ),
    ] = None,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Search event OCR summaries."""
    client = create_search_client()
    try:
        payload = _search_payload(
            query=query,
            start_date=start_date,
            end_date=end_date,
            app_name=app_name,
            limit=limit,
            input_path=input_path,
        )
        data, request_id = client.search_events(payload)
        emit_success(
            resource="search",
            action="events",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="search", action="events", error=exc, json_output=json_output)
    finally:
        client.close()
