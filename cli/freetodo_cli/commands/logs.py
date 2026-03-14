"""Logs CLI commands."""

from __future__ import annotations

from typing import Annotated

import typer

from freetodo_cli.client import LogsApiClient
from freetodo_cli.commands.common import emit_success, handle_cli_error
from freetodo_cli.config import load_config
from freetodo_cli.errors import CliError

logs_app = typer.Typer(
    help=(
        "Logs resource commands.\n\n"
        "Use these commands to inspect backend log files and read recent log content.\n\n"
        "Examples:\n"
        "  freetodo logs files --json\n"
        "  freetodo logs content --file server/app.log --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)


def create_logs_client() -> LogsApiClient:
    """Build a Logs API client from environment configuration."""
    return LogsApiClient(load_config())


@logs_app.command("files")
def list_log_files(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """List available log files."""
    client = create_logs_client()
    try:
        data, request_id = client.list_log_files()
        emit_success(
            resource="logs",
            action="files",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="logs", action="files", error=exc, json_output=json_output)
    finally:
        client.close()


@logs_app.command("content")
def get_log_content(
    file_path: Annotated[
        str,
        typer.Option("--file", help="Relative log file path, such as server/app.log."),
    ],
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Read recent content from a log file."""
    client = create_logs_client()
    try:
        data, request_id = client.get_log_content(file_path)
        emit_success(
            resource="logs",
            action="content",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="logs", action="content", error=exc, json_output=json_output)
    finally:
        client.close()
