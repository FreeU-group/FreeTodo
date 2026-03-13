"""Audio CLI commands."""

from __future__ import annotations

from typing import Annotated, Any

import typer
from pydantic import BaseModel, Field

from cli.client import AudioApiClient
from cli.commands.common import (
    emit_dry_run,
    emit_success,
    handle_cli_error,
    model_payload,
    read_json_payload,
)
from cli.config import load_config
from cli.errors import CliError


class AudioLinkItemModel(BaseModel):
    """CLI validation model for extracted audio link items."""

    kind: str = Field(..., min_length=1)
    item_id: str = Field(..., min_length=1)
    todo_id: int


class AudioLinkRequestModel(BaseModel):
    """CLI validation model for audio link requests."""

    links: list[AudioLinkItemModel] = Field(..., min_length=1)


audio_app = typer.Typer(
    help=(
        "Audio resource commands.\n\n"
        "Use these commands to inspect recordings and transcriptions, download audio files, "
        "and operate extracted todo links.\n\n"
        "Examples:\n"
        "  freetodo audio recordings --date 2026-03-13 --json\n"
        "  freetodo audio transcription --id 12 --json\n"
        "  freetodo audio extract --id 12 --json\n"
        "  freetodo audio download-recording --id 12 --output clip.wav --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)

SCHEMA_EXAMPLES: dict[str, dict[str, Any]] = {
    "link": {
        "links": [
            {
                "kind": "todo",
                "item_id": "todo-1",
                "todo_id": 42,
            }
        ]
    }
}


def create_audio_client() -> AudioApiClient:
    """Build an Audio API client from environment configuration."""
    return AudioApiClient(load_config())


@audio_app.command("schema")
def audio_schema(
    kind: Annotated[
        str,
        typer.Option(
            "--kind", help="Schema kind to render. Currently: link.", case_sensitive=False
        ),
    ] = "link",
    include_example: Annotated[
        bool,
        typer.Option("--example/--no-example", help="Include an example payload."),
    ] = True,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Render JSON schema for audio command payloads."""
    normalized_kind = kind.lower()
    if normalized_kind != "link":
        raise typer.BadParameter("kind must be: link")

    data: dict[str, Any] = {
        "kind": normalized_kind,
        "schema": AudioLinkRequestModel.model_json_schema(),
    }
    if include_example:
        data["example"] = SCHEMA_EXAMPLES[normalized_kind]

    emit_success(
        resource="audio",
        action="schema",
        data=data,
        request_id="local-schema",
        json_output=json_output,
    )


@audio_app.command("recordings")
def get_recordings(
    date: Annotated[
        str | None,
        typer.Option("--date", help="Optional date such as 2026-03-13."),
    ] = None,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """List audio recordings."""
    client = create_audio_client()
    try:
        data, request_id = client.get_recordings(date=date)
        emit_success(
            resource="audio",
            action="recordings",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="audio", action="recordings", error=exc, json_output=json_output)
    finally:
        client.close()


@audio_app.command("timeline")
def get_timeline(
    date: Annotated[
        str | None,
        typer.Option("--date", help="Optional date such as 2026-03-13."),
    ] = None,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get the recording timeline for a date."""
    client = create_audio_client()
    try:
        data, request_id = client.get_timeline(date=date)
        emit_success(
            resource="audio",
            action="timeline",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="audio", action="timeline", error=exc, json_output=json_output)
    finally:
        client.close()


@audio_app.command("transcription")
def get_transcription(
    recording_id: Annotated[int, typer.Option("--id", help="Recording ID to inspect.")],
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get transcription text and extracted todos for a recording."""
    client = create_audio_client()
    try:
        data, request_id = client.get_transcription(recording_id)
        emit_success(
            resource="audio",
            action="transcription",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="audio", action="transcription", error=exc, json_output=json_output
        )
    finally:
        client.close()


@audio_app.command("extract")
def extract_todos(
    recording_id: Annotated[int, typer.Option("--id", help="Recording ID to process.")],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the extract request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Extract todos from a recording transcription."""
    if dry_run:
        emit_dry_run(
            resource="audio",
            action="extract",
            payload={"recording_id": recording_id},
            json_output=json_output,
        )
        return
    client = create_audio_client()
    try:
        data, request_id = client.extract_todos(recording_id)
        emit_success(
            resource="audio",
            action="extract",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="audio", action="extract", error=exc, json_output=json_output)
    finally:
        client.close()


@audio_app.command("link")
def link_extracted_items(
    recording_id: Annotated[int, typer.Option("--id", help="Recording ID to update.")],
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching the audio link schema.",
        ),
    ] = None,
    use_stdin: Annotated[
        bool,
        typer.Option("--stdin", help="Read JSON payload from stdin."),
    ] = False,
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Validate and preview the request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Mark extracted audio items as linked to todos."""
    try:
        payload = model_payload(
            AudioLinkRequestModel,
            read_json_payload(input_path=input_path, use_stdin=use_stdin),
        )
        if dry_run:
            emit_dry_run(
                resource="audio",
                action="link",
                payload=payload,
                json_output=json_output,
                extra={"recording_id": recording_id},
            )
            return
        client = create_audio_client()
        try:
            data, request_id = client.link_extracted_items(recording_id, payload)
            emit_success(
                resource="audio",
                action="link",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(resource="audio", action="link", error=exc, json_output=json_output)


@audio_app.command("download-recording")
def download_recording(
    recording_id: Annotated[int, typer.Option("--id", help="Recording ID to download.")],
    output_path: Annotated[
        str,
        typer.Option("--output", help="Path to save the downloaded recording."),
    ],
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Download an audio recording file."""
    client = create_audio_client()
    try:
        data, request_id = client.download_recording(recording_id, output_path)
        emit_success(
            resource="audio",
            action="download-recording",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="audio",
            action="download-recording",
            error=exc,
            json_output=json_output,
        )
    finally:
        client.close()
