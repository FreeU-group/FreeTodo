"""Screenshot CLI commands."""

from __future__ import annotations

from typing import Annotated

import typer

from freetodo_cli.client import ScreenshotApiClient
from freetodo_cli.commands.common import emit_success, handle_cli_error
from freetodo_cli.config import load_config
from freetodo_cli.errors import CliError

screenshot_app = typer.Typer(
    help=(
        "Screenshot resource commands.\n\n"
        "Use these commands to inspect screenshot metadata, OCR-enriched detail, file paths, and image downloads.\n\n"
        "Examples:\n"
        "  freetodo screenshot list --json\n"
        "  freetodo screenshot get --id 42 --json\n"
        "  freetodo screenshot path --id 42 --json\n"
        "  freetodo screenshot download --id 42 --output shot.png --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)


def create_screenshot_client() -> ScreenshotApiClient:
    """Build a Screenshot API client from environment configuration."""
    return ScreenshotApiClient(load_config())


@screenshot_app.command("list")
def list_screenshots(
    limit: Annotated[
        int,
        typer.Option("--limit", min=1, max=200, help="Maximum number of screenshots to return."),
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
    """List screenshots."""
    client = create_screenshot_client()
    try:
        data, request_id = client.list_screenshots(
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date,
            app_name=app_name,
        )
        emit_success(
            resource="screenshot",
            action="list",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="screenshot", action="list", error=exc, json_output=json_output)
    finally:
        client.close()


@screenshot_app.command("get")
def get_screenshot(
    screenshot_id: Annotated[int, typer.Option("--id", help="Screenshot ID to fetch.")],
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get screenshot detail with OCR metadata."""
    client = create_screenshot_client()
    try:
        data, request_id = client.get_screenshot(screenshot_id)
        emit_success(
            resource="screenshot",
            action="get",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="screenshot", action="get", error=exc, json_output=json_output)
    finally:
        client.close()


@screenshot_app.command("path")
def get_screenshot_path(
    screenshot_id: Annotated[int, typer.Option("--id", help="Screenshot ID to inspect.")],
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get the local file path for a screenshot."""
    client = create_screenshot_client()
    try:
        data, request_id = client.get_screenshot_path(screenshot_id)
        emit_success(
            resource="screenshot",
            action="path",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="screenshot", action="path", error=exc, json_output=json_output)
    finally:
        client.close()


@screenshot_app.command("download")
def download_screenshot(
    screenshot_id: Annotated[int, typer.Option("--id", help="Screenshot ID to download.")],
    output_path: Annotated[
        str,
        typer.Option("--output", help="Path to save the downloaded screenshot image."),
    ],
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Download a screenshot image file."""
    client = create_screenshot_client()
    try:
        data, request_id = client.download_screenshot_image(screenshot_id, output_path)
        emit_success(
            resource="screenshot",
            action="download",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="screenshot", action="download", error=exc, json_output=json_output
        )
    finally:
        client.close()
