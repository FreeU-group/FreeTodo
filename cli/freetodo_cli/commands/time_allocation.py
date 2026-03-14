"""Time allocation CLI commands."""

from __future__ import annotations

from typing import Annotated

import typer

from freetodo_cli.client import TimeAllocationApiClient
from freetodo_cli.commands.common import emit_success, handle_cli_error
from freetodo_cli.config import load_config
from freetodo_cli.errors import CliError

time_allocation_app = typer.Typer(
    help=(
        "Time allocation resource commands.\n\n"
        "Use these commands to fetch aggregated app usage statistics.\n\n"
        "Examples:\n"
        "  freetodo time-allocation get --days 7 --json\n"
        "  freetodo time-allocation get --start-date 2026-03-01 --end-date 2026-03-07 --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)


def create_time_allocation_client() -> TimeAllocationApiClient:
    """Build a TimeAllocation API client from environment configuration."""
    return TimeAllocationApiClient(load_config())


@time_allocation_app.command("get")
def get_time_allocation(
    start_date: Annotated[
        str | None,
        typer.Option("--start-date", help="Start date (YYYY-MM-DD)."),
    ] = None,
    end_date: Annotated[
        str | None,
        typer.Option("--end-date", help="End date (YYYY-MM-DD)."),
    ] = None,
    days: Annotated[
        int | None,
        typer.Option("--days", min=1, max=365, help="Number of days to summarize."),
    ] = None,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Fetch time allocation summary."""
    client = create_time_allocation_client()
    try:
        data, request_id = client.get_time_allocation(
            start_date=start_date, end_date=end_date, days=days
        )
        emit_success(
            resource="time-allocation",
            action="get",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="time-allocation", action="get", error=exc, json_output=json_output
        )
    finally:
        client.close()
