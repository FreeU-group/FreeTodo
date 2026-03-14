"""Health CLI commands."""

from __future__ import annotations

from typing import Annotated

import typer

from freetodo_cli.client import HealthApiClient
from freetodo_cli.commands.common import emit_success, handle_cli_error
from freetodo_cli.config import load_config
from freetodo_cli.errors import CliError

health_app = typer.Typer(
    help=(
        "Health resource commands.\n\n"
        "Use these commands to check backend health and LLM availability.\n\n"
        "Examples:\n"
        "  freetodo health root --json\n"
        "  freetodo health status --json\n"
        "  freetodo health llm --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)


def create_health_client() -> HealthApiClient:
    """Build a Health API client from environment configuration."""
    return HealthApiClient(load_config())


@health_app.command("root")
def root_status(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Fetch the root status."""
    client = create_health_client()
    try:
        data, request_id = client.get_root()
        emit_success(
            resource="health",
            action="root",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="health", action="root", error=exc, json_output=json_output)
    finally:
        client.close()


@health_app.command("status")
def health_status(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Fetch the health status."""
    client = create_health_client()
    try:
        data, request_id = client.get_health()
        emit_success(
            resource="health",
            action="status",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="health", action="status", error=exc, json_output=json_output)
    finally:
        client.close()


@health_app.command("llm")
def health_llm(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Fetch the LLM health status."""
    client = create_health_client()
    try:
        data, request_id = client.get_llm_health()
        emit_success(
            resource="health",
            action="llm",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="health", action="llm", error=exc, json_output=json_output)
    finally:
        client.close()
