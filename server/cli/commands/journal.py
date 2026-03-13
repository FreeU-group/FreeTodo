"""Journal CLI commands."""

from __future__ import annotations

from typing import Annotated, Any

import typer

from cli.client import JournalApiClient
from cli.commands.common import (
    emit_dry_run,
    emit_success,
    handle_cli_error,
    model_payload,
    read_json_payload,
)
from cli.config import load_config
from cli.errors import CliError
from schemas.journal import (
    JournalAutoLinkRequest,
    JournalCreate,
    JournalGenerateRequest,
    JournalUpdate,
)

journal_app = typer.Typer(
    help=(
        "Journal resource commands.\n\n"
        "Use JSON-first commands for journaling workflows and agent automation.\n"
        "Read commands fetch journals; write commands modify journal records through HTTP APIs.\n\n"
        "Examples:\n"
        "  freetodo journal list --json\n"
        "  freetodo journal create --input journal.json --json\n"
        "  freetodo journal auto-link --input link.json --json\n"
        "  freetodo journal generate-ai --input draft.json --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)

SCHEMA_EXAMPLES: dict[str, dict[str, Any]] = {
    "create": {
        "name": "Daily reflection",
        "user_notes": "Today I finished the CLI milestone.",
        "date": "2026-03-13T20:00:00+08:00",
        "content_format": "markdown",
        "tags": ["work", "shipping"],
        "related_todo_ids": [1],
    },
    "update": {
        "mood": "focused",
        "energy": 8,
        "content_ai": "The day showed strong execution and follow-through.",
    },
    "auto-link": {
        "title": "Daily reflection",
        "content_original": "Worked on CLI and closed several tasks.",
        "date": "2026-03-13T20:00:00+08:00",
        "max_items": 3,
    },
    "generate": {
        "title": "Daily reflection",
        "content_original": "Worked on CLI and closed several tasks.",
        "date": "2026-03-13T20:00:00+08:00",
        "language": "en",
    },
}


def create_journal_client() -> JournalApiClient:
    """Build a Journal API client from environment configuration."""
    return JournalApiClient(load_config())


@journal_app.command("schema")
def journal_schema(
    kind: Annotated[
        str,
        typer.Option(
            "--kind",
            help="Schema kind to render: create, update, auto-link, or generate.",
            case_sensitive=False,
        ),
    ] = "create",
    include_example: Annotated[
        bool,
        typer.Option("--example/--no-example", help="Include an example payload."),
    ] = True,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Render JSON schema for journal command payloads."""
    schema_map = {
        "create": JournalCreate,
        "update": JournalUpdate,
        "auto-link": JournalAutoLinkRequest,
        "generate": JournalGenerateRequest,
    }
    normalized_kind = kind.lower()
    if normalized_kind not in schema_map:
        raise typer.BadParameter("kind must be one of: create, update, auto-link, generate")

    data: dict[str, Any] = {
        "kind": normalized_kind,
        "schema": schema_map[normalized_kind].model_json_schema(),
    }
    if include_example:
        data["example"] = SCHEMA_EXAMPLES[normalized_kind]

    emit_success(
        resource="journal",
        action="schema",
        data=data,
        request_id="local-schema",
        json_output=json_output,
    )


@journal_app.command("list")
def list_journals(
    limit: Annotated[
        int,
        typer.Option("--limit", min=1, max=1000, help="Maximum number of journals to return."),
    ] = 100,
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
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """List journals."""
    client = create_journal_client()
    try:
        data, request_id = client.list_journals(
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date,
        )
        emit_success(
            resource="journal",
            action="list",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="journal", action="list", error=exc, json_output=json_output)
    finally:
        client.close()


@journal_app.command("get")
def get_journal(
    journal_id: Annotated[int, typer.Option("--id", help="Journal ID to fetch.")],
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get a single journal."""
    client = create_journal_client()
    try:
        data, request_id = client.get_journal(journal_id)
        emit_success(
            resource="journal",
            action="get",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="journal", action="get", error=exc, json_output=json_output)
    finally:
        client.close()


@journal_app.command("create")
def create_journal(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching JournalCreate schema.",
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
    """Create a journal from JSON input."""
    try:
        payload = model_payload(
            JournalCreate,
            read_json_payload(input_path=input_path, use_stdin=use_stdin),
        )
        if dry_run:
            emit_dry_run(
                resource="journal",
                action="create",
                payload=payload,
                json_output=json_output,
            )
            return
        client = create_journal_client()
        try:
            data, request_id = client.create_journal(payload)
            emit_success(
                resource="journal",
                action="create",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(resource="journal", action="create", error=exc, json_output=json_output)


@journal_app.command("update")
def update_journal(
    journal_id: Annotated[int, typer.Option("--id", help="Journal ID to update.")],
    input_path: Annotated[
        str | None,
        typer.Option(
            "--patch",
            exists=True,
            dir_okay=False,
            help="Path to a partial JSON payload matching JournalUpdate schema.",
        ),
    ] = None,
    use_stdin: Annotated[
        bool,
        typer.Option("--stdin", help="Read patch JSON from stdin."),
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
    """Update a journal with a partial JSON payload."""
    try:
        payload = model_payload(
            JournalUpdate,
            read_json_payload(input_path=input_path, use_stdin=use_stdin),
        )
        if not payload:
            raise CliError(
                code="EMPTY_PATCH",
                message="Update payload must include at least one field",
                exit_code=2,
            )
        if dry_run:
            emit_dry_run(
                resource="journal",
                action="update",
                payload=payload,
                json_output=json_output,
                extra={"journal_id": journal_id},
            )
            return
        client = create_journal_client()
        try:
            data, request_id = client.update_journal(journal_id, payload)
            emit_success(
                resource="journal",
                action="update",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(resource="journal", action="update", error=exc, json_output=json_output)


@journal_app.command("delete")
def delete_journal(
    journal_id: Annotated[int, typer.Option("--id", help="Journal ID to delete.")],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the delete request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Delete a journal."""
    if dry_run:
        emit_dry_run(
            resource="journal",
            action="delete",
            payload={"id": journal_id},
            json_output=json_output,
        )
        return
    client = create_journal_client()
    try:
        _, request_id = client.delete_journal(journal_id)
        emit_success(
            resource="journal",
            action="delete",
            data={"deleted": True, "id": journal_id},
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="journal", action="delete", error=exc, json_output=json_output)
    finally:
        client.close()


def _run_journal_json_action(
    *,
    action: str,
    input_path: str | None,
    use_stdin: bool,
    dry_run: bool,
    json_output: bool,
    model_cls: type[Any],
    request_fn: str,
) -> None:
    payload = model_payload(
        model_cls, read_json_payload(input_path=input_path, use_stdin=use_stdin)
    )
    if dry_run:
        emit_dry_run(
            resource="journal",
            action=action,
            payload=payload,
            json_output=json_output,
        )
        return
    client = create_journal_client()
    try:
        data, request_id = getattr(client, request_fn)(payload)
        emit_success(
            resource="journal",
            action=action,
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    finally:
        client.close()


@journal_app.command("auto-link")
def auto_link_journal(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching JournalAutoLinkRequest schema.",
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
    """Suggest todo and activity links for a journal."""
    try:
        _run_journal_json_action(
            action="auto-link",
            input_path=input_path,
            use_stdin=use_stdin,
            dry_run=dry_run,
            json_output=json_output,
            model_cls=JournalAutoLinkRequest,
            request_fn="auto_link_journal",
        )
    except CliError as exc:
        handle_cli_error(resource="journal", action="auto-link", error=exc, json_output=json_output)


@journal_app.command("generate-objective")
def generate_objective_journal(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching JournalGenerateRequest schema.",
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
    """Generate objective journal content."""
    try:
        _run_journal_json_action(
            action="generate-objective",
            input_path=input_path,
            use_stdin=use_stdin,
            dry_run=dry_run,
            json_output=json_output,
            model_cls=JournalGenerateRequest,
            request_fn="generate_objective_journal",
        )
    except CliError as exc:
        handle_cli_error(
            resource="journal",
            action="generate-objective",
            error=exc,
            json_output=json_output,
        )


@journal_app.command("generate-ai")
def generate_ai_journal(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching JournalGenerateRequest schema.",
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
    """Generate AI-view journal content."""
    try:
        _run_journal_json_action(
            action="generate-ai",
            input_path=input_path,
            use_stdin=use_stdin,
            dry_run=dry_run,
            json_output=json_output,
            model_cls=JournalGenerateRequest,
            request_fn="generate_ai_journal",
        )
    except CliError as exc:
        handle_cli_error(
            resource="journal",
            action="generate-ai",
            error=exc,
            json_output=json_output,
        )
