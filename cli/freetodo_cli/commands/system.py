"""System CLI commands."""

from __future__ import annotations

from typing import Annotated

import typer

from freetodo_cli.client import SystemApiClient
from freetodo_cli.commands.common import emit_dry_run, emit_success, handle_cli_error
from freetodo_cli.config import load_config
from freetodo_cli.errors import CliError

system_app = typer.Typer(
    help=(
        "System resource commands.\n\n"
        "Use these commands to inspect backend capabilities and system state, and trigger cleanup operations.\n\n"
        "Examples:\n"
        "  freetodo system statistics --json\n"
        "  freetodo system resources --json\n"
        "  freetodo system capabilities --json\n"
        "  freetodo system cleanup --days 30 --dry-run --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)


def create_system_client() -> SystemApiClient:
    """Build a System API client from environment configuration."""
    return SystemApiClient(load_config())


@system_app.command("statistics")
def get_statistics(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get backend statistics."""
    client = create_system_client()
    try:
        data, request_id = client.get_statistics()
        emit_success(
            resource="system",
            action="statistics",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="system", action="statistics", error=exc, json_output=json_output)
    finally:
        client.close()


@system_app.command("resources")
def get_system_resources(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get system resource usage."""
    client = create_system_client()
    try:
        data, request_id = client.get_system_resources()
        emit_success(
            resource="system",
            action="resources",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="system", action="resources", error=exc, json_output=json_output)
    finally:
        client.close()


@system_app.command("capabilities")
def get_capabilities(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get backend module capabilities."""
    client = create_system_client()
    try:
        data, request_id = client.get_capabilities()
        emit_success(
            resource="system",
            action="capabilities",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="system", action="capabilities", error=exc, json_output=json_output
        )
    finally:
        client.close()


@system_app.command("cleanup")
def cleanup_old_data(
    days: Annotated[
        int,
        typer.Option("--days", min=1, help="Delete data older than this many days."),
    ] = 30,
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the cleanup request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Clean up old backend data."""
    if dry_run:
        emit_dry_run(
            resource="system",
            action="cleanup",
            payload={"days": days},
            json_output=json_output,
        )
        return
    client = create_system_client()
    try:
        data, request_id = client.cleanup_old_data(days=days)
        emit_success(
            resource="system",
            action="cleanup",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="system", action="cleanup", error=exc, json_output=json_output)
    finally:
        client.close()
