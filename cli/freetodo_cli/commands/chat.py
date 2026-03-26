"""Chat CLI commands for streaming requests."""

from __future__ import annotations

from typing import Annotated

import typer

from freetodo_cli.client import ChatApiClient
from freetodo_cli.commands.common import (
    emit_dry_run,
    emit_success,
    handle_cli_error,
    read_existing_file,
)
from freetodo_cli.config import load_config
from freetodo_cli.errors import CliError

chat_app = typer.Typer(
    help=(
        "Chat streaming commands.\n\n"
        "Use this for debugging chat payloads and attachment uploads.\n\n"
        "Examples:\n"
        '  freetodo chat send --message "Read this image" --attachment ./shot.png\n'
        '  freetodo chat send --message "hello" --mode agno --json\n'
    ),
    no_args_is_help=True,
    add_completion=False,
)


def create_chat_client() -> ChatApiClient:
    return ChatApiClient(load_config())


@chat_app.command("send")
def chat_send(  # noqa: PLR0913
    message: Annotated[
        str,
        typer.Option(
            "--message",
            "-m",
            help="User message to send.",
        ),
    ],
    attachment: Annotated[
        list[str] | None,
        typer.Option(
            "--attachment",
            "-a",
            help="Local file paths to upload as attachments.",
        ),
    ] = None,
    mode: Annotated[
        str,
        typer.Option("--mode", help="Chat mode. Default: agno."),
    ] = "agno",
    selected_tool: Annotated[
        list[str] | None,
        typer.Option("--tool", help="Selected tool names (repeatable)."),
    ] = None,
    external_tool: Annotated[
        list[str] | None,
        typer.Option("--external-tool", help="External tool names (repeatable)."),
    ] = None,
    conversation_id: Annotated[
        str | None,
        typer.Option("--conversation-id", help="Attach to an existing conversation."),
    ] = None,
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview payload without sending."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json", help="Emit JSON envelope."),
    ] = False,
) -> None:
    try:
        attachment = attachment or []
        selected_tool = selected_tool or []
        external_tool = external_tool or []
        resolved_files = [str(read_existing_file(path)) for path in attachment]
        payload_preview = {
            "message": message,
            "mode": mode,
            "attachments": resolved_files,
            "selected_tools": selected_tool,
            "external_tools": external_tool,
            "conversation_id": conversation_id,
        }
        if dry_run:
            emit_dry_run(
                resource="chat",
                action="send",
                payload=payload_preview,
                json_output=json_output,
            )
            return

        client = create_chat_client()
        try:
            chunks: list[str] = []

            def _on_chunk(chunk: str) -> None:
                if json_output:
                    chunks.append(chunk)
                    return
                typer.echo(chunk, nl=False)

            data, request_id = client.stream_chat(
                message=message,
                user_input=message,
                mode=mode,
                attachments=resolved_files or None,
                selected_tools=selected_tool or None,
                external_tools=external_tool or None,
                context=None,
                system_prompt=None,
                conversation_id=conversation_id,
                use_rag=False,
                on_chunk=_on_chunk,
            )

            if json_output:
                data["response"] = "".join(chunks)
                emit_success(
                    resource="chat",
                    action="send",
                    data=data,
                    request_id=request_id,
                    json_output=True,
                )
            else:
                typer.echo("")
                emit_success(
                    resource="chat",
                    action="send",
                    data=data,
                    request_id=request_id,
                    json_output=False,
                )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(resource="chat", action="send", error=exc, json_output=json_output)
