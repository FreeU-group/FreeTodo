"""Notification CLI commands."""

from __future__ import annotations

from typing import Annotated

import typer

from freetodo_cli.client import NotificationApiClient
from freetodo_cli.commands.common import emit_dry_run, emit_success, handle_cli_error
from freetodo_cli.config import load_config
from freetodo_cli.errors import CliError

notification_app = typer.Typer(
    help=(
        "Notification resource commands.\n\n"
        "Use these commands to inspect backend notifications and clear handled items.\n\n"
        "Examples:\n"
        "  freetodo notification list --json\n"
        "  freetodo notification delete --id notif-123 --dry-run --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)


def create_notification_client() -> NotificationApiClient:
    """Build a Notification API client from environment configuration."""
    return NotificationApiClient(load_config())


@notification_app.command("list")
def list_notifications(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """List notifications."""
    client = create_notification_client()
    try:
        data, request_id = client.list_notifications()
        emit_success(
            resource="notification",
            action="list",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="notification", action="list", error=exc, json_output=json_output)
    finally:
        client.close()


@notification_app.command("delete")
def delete_notification(
    notification_id: Annotated[str, typer.Option("--id", help="Notification ID to delete.")],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the delete request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Delete a notification."""
    if dry_run:
        emit_dry_run(
            resource="notification",
            action="delete",
            payload={"id": notification_id},
            json_output=json_output,
        )
        return
    client = create_notification_client()
    try:
        data, request_id = client.delete_notification(notification_id)
        emit_success(
            resource="notification",
            action="delete",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="notification", action="delete", error=exc, json_output=json_output
        )
    finally:
        client.close()
