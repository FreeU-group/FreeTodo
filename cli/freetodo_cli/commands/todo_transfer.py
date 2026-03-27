"""Attachment and ICS transfer commands for todo CLI."""

from __future__ import annotations

from typing import TYPE_CHECKING

import typer

from freetodo_cli.commands.common import (
    emit_dry_run,
    emit_success,
    handle_cli_error,
    read_existing_file,
)
from freetodo_cli.commands.todo_helpers import create_todo_client
from freetodo_cli.errors import CliError

if TYPE_CHECKING:
    from typer import Typer


def register_transfer_routes(todo_app: Typer) -> None:  # noqa: C901, PLR0915
    @todo_app.command("attach")
    def upload_attachments(
        todo_id: int = typer.Option(..., "--id", help="Todo ID to attach files to."),
        files: list[str] = typer.Option(
            ..., "--file", help="Attachment file path. Repeat for multiple files."
        ),
        dry_run: bool = typer.Option(
            False,
            "--dry-run",
            help="Validate and preview the attachment upload without sending it.",
        ),
        json_output: bool = typer.Option(
            True, "--json/--no-json", help="Emit structured JSON output."
        ),
    ) -> None:
        """Upload one or more attachments to a todo."""
        try:
            resolved_files = [str(read_existing_file(path)) for path in files]
            if dry_run:
                emit_dry_run(
                    resource="todo",
                    action="attach",
                    payload={"todo_id": todo_id, "files": resolved_files},
                    json_output=json_output,
                )
                return
            client = create_todo_client()
            try:
                data, request_id = client.upload_attachments(todo_id, resolved_files)
                emit_success(
                    resource="todo",
                    action="attach",
                    data=data,
                    request_id=request_id,
                    json_output=json_output,
                )
            finally:
                client.close()
        except CliError as exc:
            handle_cli_error(resource="todo", action="attach", error=exc, json_output=json_output)

    @todo_app.command("detach")
    def detach_attachment(
        todo_id: int = typer.Option(..., "--id", help="Todo ID that owns the attachment."),
        attachment_id: int = typer.Option(..., "--attachment-id", help="Attachment ID to unbind."),
        dry_run: bool = typer.Option(
            False, "--dry-run", help="Preview the detach request without sending it."
        ),
        json_output: bool = typer.Option(
            True, "--json/--no-json", help="Emit structured JSON output."
        ),
    ) -> None:
        """Detach an attachment from a todo."""
        try:
            if dry_run:
                emit_dry_run(
                    resource="todo",
                    action="detach",
                    payload={"todo_id": todo_id, "attachment_id": attachment_id},
                    json_output=json_output,
                )
                return
            client = create_todo_client()
            try:
                _, request_id = client.delete_attachment(todo_id, attachment_id)
                emit_success(
                    resource="todo",
                    action="detach",
                    data={"detached": True, "todo_id": todo_id, "attachment_id": attachment_id},
                    request_id=request_id,
                    json_output=json_output,
                )
            finally:
                client.close()
        except CliError as exc:
            handle_cli_error(resource="todo", action="detach", error=exc, json_output=json_output)

    @todo_app.command("download-attachment")
    def download_attachment(
        attachment_id: int = typer.Option(
            ..., "--attachment-id", help="Attachment ID to download."
        ),
        output_path: str = typer.Option(
            ..., "--output", help="Path to save the downloaded attachment."
        ),
        json_output: bool = typer.Option(
            True, "--json/--no-json", help="Emit structured JSON output."
        ),
    ) -> None:
        """Download an attachment file by attachment ID."""
        client = create_todo_client()
        try:
            data, request_id = client.download_attachment(attachment_id, output_path)
            emit_success(
                resource="todo",
                action="download-attachment",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        except CliError as exc:
            handle_cli_error(
                resource="todo", action="download-attachment", error=exc, json_output=json_output
            )
        finally:
            client.close()

    @todo_app.command("export-ics")
    def export_ics(
        output_path: str = typer.Option(
            ..., "--output", help="Path to save the exported ICS file."
        ),
        limit: int = typer.Option(
            2000, "--limit", min=1, max=2000, help="Maximum todos to export."
        ),
        offset: int = typer.Option(0, "--offset", min=0, help="Zero-based offset for export."),
        status: str | None = typer.Option(
            None, "--status", help="Optional status filter for export."
        ),
        json_output: bool = typer.Option(
            True, "--json/--no-json", help="Emit structured JSON output."
        ),
    ) -> None:
        """Export todos as an ICS file."""
        client = create_todo_client()
        try:
            data, request_id = client.export_ics(
                output_path=output_path, limit=limit, offset=offset, status=status
            )
            emit_success(
                resource="todo",
                action="export-ics",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        except CliError as exc:
            handle_cli_error(
                resource="todo", action="export-ics", error=exc, json_output=json_output
            )
        finally:
            client.close()

    @todo_app.command("import-ics")
    def import_ics(
        input_path: str = typer.Option(
            ..., "--input", exists=True, dir_okay=False, help="Path to an ICS file."
        ),
        dry_run: bool = typer.Option(
            False, "--dry-run", help="Preview the ICS import request without sending it."
        ),
        json_output: bool = typer.Option(
            True, "--json/--no-json", help="Emit structured JSON output."
        ),
    ) -> None:
        """Import todos from an ICS file."""
        try:
            file_path = str(read_existing_file(input_path))
            if dry_run:
                emit_dry_run(
                    resource="todo",
                    action="import-ics",
                    payload={"file": file_path},
                    json_output=json_output,
                )
                return
            client = create_todo_client()
            try:
                data, request_id = client.import_ics(file_path)
                emit_success(
                    resource="todo",
                    action="import-ics",
                    data=data,
                    request_id=request_id,
                    json_output=json_output,
                )
            finally:
                client.close()
        except CliError as exc:
            handle_cli_error(
                resource="todo", action="import-ics", error=exc, json_output=json_output
            )
