"""Plugins CLI commands."""

from __future__ import annotations

from typing import Annotated

import typer

from cli.client import PluginsApiClient
from cli.commands.common import emit_dry_run, emit_success, handle_cli_error
from cli.config import load_config
from cli.errors import CliError

plugins_app = typer.Typer(
    help=(
        "Plugins resource commands.\n\n"
        "Use these commands to inspect plugin status and manage plugin installation.\n\n"
        "Examples:\n"
        "  freetodo plugins list --json\n"
        "  freetodo plugins media-crawler status --json\n"
        "  freetodo plugins media-crawler install --version 1.2.3 --dry-run --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)

media_crawler_app = typer.Typer(
    help=(
        "MediaCrawler plugin commands.\n\n"
        "Use these commands to install, uninstall, and check MediaCrawler plugin status."
    ),
    no_args_is_help=True,
    add_completion=False,
)


def create_plugins_client() -> PluginsApiClient:
    """Build a Plugins API client from environment configuration."""
    return PluginsApiClient(load_config())


@plugins_app.command("list")
def list_plugins(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """List available plugins."""
    client = create_plugins_client()
    try:
        data, request_id = client.list_plugins()
        emit_success(
            resource="plugins",
            action="list",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="plugins", action="list", error=exc, json_output=json_output)
    finally:
        client.close()


@media_crawler_app.command("status")
def media_crawler_status(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get MediaCrawler plugin status."""
    client = create_plugins_client()
    try:
        data, request_id = client.get_media_crawler_status()
        emit_success(
            resource="plugins",
            action="media-crawler-status",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="plugins", action="media-crawler-status", error=exc, json_output=json_output
        )
    finally:
        client.close()


@media_crawler_app.command("install")
def install_media_crawler(
    version: Annotated[
        str | None,
        typer.Option("--version", help="Optional version to install."),
    ] = None,
    download_url: Annotated[
        str | None,
        typer.Option("--download-url", help="Optional download URL override."),
    ] = None,
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the install request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Install the MediaCrawler plugin."""
    if dry_run:
        emit_dry_run(
            resource="plugins",
            action="media-crawler-install",
            payload={"version": version, "download_url": download_url},
            json_output=json_output,
        )
        return
    client = create_plugins_client()
    try:
        data, request_id = client.install_media_crawler(version=version, download_url=download_url)
        emit_success(
            resource="plugins",
            action="media-crawler-install",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="plugins", action="media-crawler-install", error=exc, json_output=json_output
        )
    finally:
        client.close()


@media_crawler_app.command("uninstall")
def uninstall_media_crawler(
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the uninstall request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Uninstall the MediaCrawler plugin."""
    if dry_run:
        emit_dry_run(
            resource="plugins",
            action="media-crawler-uninstall",
            payload={"uninstall": True},
            json_output=json_output,
        )
        return
    client = create_plugins_client()
    try:
        data, request_id = client.uninstall_media_crawler()
        emit_success(
            resource="plugins",
            action="media-crawler-uninstall",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="plugins", action="media-crawler-uninstall", error=exc, json_output=json_output
        )
    finally:
        client.close()


plugins_app.add_typer(media_crawler_app, name="media-crawler")
