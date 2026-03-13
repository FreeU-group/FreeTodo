"""Vector CLI commands."""

from __future__ import annotations

from typing import Annotated, Any

import typer

from cli.client import VectorApiClient
from cli.commands.common import (
    emit_dry_run,
    emit_success,
    handle_cli_error,
    read_json_payload,
)
from cli.config import load_config
from cli.errors import CliError
from schemas.vector import SemanticSearchRequest

vector_app = typer.Typer(
    help=(
        "Vector resource commands.\n\n"
        "Use these commands to run semantic search and manage the backend vector index.\n\n"
        "Examples:\n"
        "  freetodo vector semantic-search --input semantic.json --json\n"
        "  freetodo vector stats --json\n"
        "  freetodo vector sync --limit 100 --dry-run --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)

SCHEMA_EXAMPLES: dict[str, dict[str, Any]] = {
    "semantic-search": {
        "query": "standup notes about CLI rollout",
        "top_k": 5,
        "use_rerank": True,
        "filters": {"app_name": "Cursor"},
    }
}


def create_vector_client() -> VectorApiClient:
    """Build a Vector API client from environment configuration."""
    return VectorApiClient(load_config())


@vector_app.command("schema")
def vector_schema(
    kind: Annotated[
        str,
        typer.Option(
            "--kind",
            help="Schema kind to render. Currently: semantic-search.",
            case_sensitive=False,
        ),
    ] = "semantic-search",
    include_example: Annotated[
        bool,
        typer.Option("--example/--no-example", help="Include an example payload."),
    ] = True,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Render the semantic-search request schema."""
    normalized_kind = kind.lower()
    if normalized_kind != "semantic-search":
        raise typer.BadParameter("kind must be: semantic-search")

    data: dict[str, Any] = {
        "kind": normalized_kind,
        "schema": SemanticSearchRequest.model_json_schema(),
    }
    if include_example:
        data["example"] = SCHEMA_EXAMPLES[normalized_kind]

    emit_success(
        resource="vector",
        action="schema",
        data=data,
        request_id="local-schema",
        json_output=json_output,
    )


def _read_vector_payload(input_path: str | None, use_stdin: bool) -> dict[str, Any]:
    return read_json_payload(input_path=input_path, use_stdin=use_stdin)


@vector_app.command("semantic-search")
def semantic_search(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching the semantic-search schema.",
        ),
    ] = None,
    use_stdin: Annotated[
        bool,
        typer.Option("--stdin", help="Read a semantic-search JSON payload from stdin."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Run semantic OCR search."""
    client = create_vector_client()
    try:
        payload = _read_vector_payload(input_path, use_stdin)
        data, request_id = client.semantic_search(payload)
        emit_success(
            resource="vector",
            action="semantic-search",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="vector", action="semantic-search", error=exc, json_output=json_output
        )
    finally:
        client.close()


@vector_app.command("event-semantic-search")
def event_semantic_search(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching the semantic-search schema.",
        ),
    ] = None,
    use_stdin: Annotated[
        bool,
        typer.Option("--stdin", help="Read a semantic-search JSON payload from stdin."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Run semantic event search."""
    client = create_vector_client()
    try:
        payload = _read_vector_payload(input_path, use_stdin)
        data, request_id = client.event_semantic_search(payload)
        emit_success(
            resource="vector",
            action="event-semantic-search",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="vector",
            action="event-semantic-search",
            error=exc,
            json_output=json_output,
        )
    finally:
        client.close()


@vector_app.command("stats")
def get_vector_stats(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get vector index statistics."""
    client = create_vector_client()
    try:
        data, request_id = client.get_vector_stats()
        emit_success(
            resource="vector",
            action="stats",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="vector", action="stats", error=exc, json_output=json_output)
    finally:
        client.close()


@vector_app.command("sync")
def sync_vector_database(
    limit: Annotated[
        int | None,
        typer.Option("--limit", min=1, help="Optional max number of records to sync."),
    ] = None,
    force_reset: Annotated[
        bool,
        typer.Option("--force-reset", help="Reset the vector store before syncing."),
    ] = False,
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the sync request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Sync SQLite data into the vector database."""
    if dry_run:
        emit_dry_run(
            resource="vector",
            action="sync",
            payload={"limit": limit, "force_reset": force_reset},
            json_output=json_output,
        )
        return
    client = create_vector_client()
    try:
        data, request_id = client.sync_vector_database(limit=limit, force_reset=force_reset)
        emit_success(
            resource="vector",
            action="sync",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="vector", action="sync", error=exc, json_output=json_output)
    finally:
        client.close()


@vector_app.command("reset")
def reset_vector_database(
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the reset request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Reset the vector database."""
    if dry_run:
        emit_dry_run(
            resource="vector",
            action="reset",
            payload={"reset": True},
            json_output=json_output,
        )
        return
    client = create_vector_client()
    try:
        data, request_id = client.reset_vector_database()
        emit_success(
            resource="vector",
            action="reset",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="vector", action="reset", error=exc, json_output=json_output)
    finally:
        client.close()
