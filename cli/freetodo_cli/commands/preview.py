"""Preview CLI commands."""

from __future__ import annotations

from typing import Annotated

import typer

from freetodo_cli.client import PreviewApiClient
from freetodo_cli.commands.common import emit_success, handle_cli_error
from freetodo_cli.config import load_config
from freetodo_cli.errors import CliError

preview_app = typer.Typer(
    help=(
        "Preview resource commands.\n\n"
        "Use these commands to preview local files through the backend preview endpoint.\n\n"
        "Examples:\n"
        "  freetodo preview file --path /abs/path/file.txt --mode text --json\n"
        "  freetodo preview file --path /abs/path/file.bin --mode binary --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)


def create_preview_client() -> PreviewApiClient:
    """Build a Preview API client from environment configuration."""
    return PreviewApiClient(load_config())


@preview_app.command("file")
def preview_file(
    path: Annotated[
        str,
        typer.Option("--path", help="Absolute file path on the server host."),
    ],
    mode: Annotated[
        str,
        typer.Option("--mode", help="Preview mode: text or binary."),
    ] = "binary",
    max_bytes: Annotated[
        int | None,
        typer.Option("--max-bytes", min=1, help="Optional size limit override."),
    ] = None,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Preview a local file via the backend preview endpoint."""
    client = create_preview_client()
    try:
        data, request_id = client.get_preview(path=path, mode=mode, max_bytes=max_bytes)
        emit_success(
            resource="preview",
            action="file",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="preview", action="file", error=exc, json_output=json_output)
    finally:
        client.close()
