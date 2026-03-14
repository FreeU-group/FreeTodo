"""Cost tracking CLI commands."""

from __future__ import annotations

from typing import Annotated

import typer

from freetodo_cli.client import CostTrackingApiClient
from freetodo_cli.commands.common import emit_success, handle_cli_error
from freetodo_cli.config import load_config
from freetodo_cli.errors import CliError

cost_tracking_app = typer.Typer(
    help=(
        "Cost tracking resource commands.\n\n"
        "Use these commands to inspect token usage and cost statistics.\n\n"
        "Examples:\n"
        "  freetodo cost-tracking stats --days 30 --json\n"
        "  freetodo cost-tracking config --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)


def create_cost_tracking_client() -> CostTrackingApiClient:
    """Build a CostTracking API client from environment configuration."""
    return CostTrackingApiClient(load_config())


@cost_tracking_app.command("stats")
def get_cost_stats(
    days: Annotated[
        int,
        typer.Option("--days", min=1, max=365, help="Number of days to summarize."),
    ] = 30,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get token usage cost stats."""
    client = create_cost_tracking_client()
    try:
        data, request_id = client.get_cost_stats(days=days)
        emit_success(
            resource="cost-tracking",
            action="stats",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="cost-tracking", action="stats", error=exc, json_output=json_output
        )
    finally:
        client.close()


@cost_tracking_app.command("config")
def get_cost_config(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get the cost tracking configuration."""
    client = create_cost_tracking_client()
    try:
        data, request_id = client.get_cost_config()
        emit_success(
            resource="cost-tracking",
            action="config",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="cost-tracking", action="config", error=exc, json_output=json_output
        )
    finally:
        client.close()
