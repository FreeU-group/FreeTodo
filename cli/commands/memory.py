"""Memory CLI commands."""

from __future__ import annotations

from typing import Annotated

import typer

from cli.client import MemoryApiClient
from cli.commands.common import emit_dry_run, emit_success, handle_cli_error
from cli.config import load_config
from cli.errors import CliError

memory_app = typer.Typer(
    help=(
        "Memory resource commands.\n\n"
        "Use these commands to inspect daily memory, search historical notes, and trigger memory maintenance flows.\n\n"
        "Examples:\n"
        "  freetodo memory today --json\n"
        "  freetodo memory search --keyword cli --json\n"
        "  freetodo memory compress --date 2026-03-13 --json\n"
        "  freetodo memory profile --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)


def create_memory_client() -> MemoryApiClient:
    """Build a Memory API client from environment configuration."""
    return MemoryApiClient(load_config())


@memory_app.command("today")
def get_today_memory(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get today's memory content."""
    client = create_memory_client()
    try:
        data, request_id = client.get_today_memory()
        emit_success(
            resource="memory",
            action="today",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="memory", action="today", error=exc, json_output=json_output)
    finally:
        client.close()


@memory_app.command("date")
def get_memory_by_date(
    date_str: Annotated[str, typer.Option("--date", help="Date string such as 2026-03-13.")],
    raw: Annotated[
        bool,
        typer.Option("--raw", help="Read raw content instead of rendered memory."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get memory content for a specific date."""
    client = create_memory_client()
    action = "raw" if raw else "date"
    try:
        data, request_id = (
            client.get_raw_memory(date_str) if raw else client.get_memory_by_date(date_str)
        )
        emit_success(
            resource="memory",
            action=action,
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="memory", action=action, error=exc, json_output=json_output)
    finally:
        client.close()


@memory_app.command("search")
def search_memory(
    keyword: Annotated[str, typer.Option("--keyword", help="Keyword to search for.")],
    days: Annotated[
        int,
        typer.Option("--days", min=1, max=365, help="Number of recent days to search."),
    ] = 7,
    max_results: Annotated[
        int,
        typer.Option("--max-results", min=1, max=50, help="Maximum number of results to return."),
    ] = 10,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Search memory by keyword."""
    client = create_memory_client()
    try:
        data, request_id = client.search_memory(keyword=keyword, days=days, max_results=max_results)
        emit_success(
            resource="memory",
            action="search",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="memory", action="search", error=exc, json_output=json_output)
    finally:
        client.close()


@memory_app.command("dates")
def list_memory_dates(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """List available memory dates."""
    client = create_memory_client()
    try:
        data, request_id = client.list_memory_dates()
        emit_success(
            resource="memory",
            action="dates",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="memory", action="dates", error=exc, json_output=json_output)
    finally:
        client.close()


@memory_app.command("status")
def get_memory_status(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get memory subsystem status."""
    client = create_memory_client()
    try:
        data, request_id = client.get_memory_status()
        emit_success(
            resource="memory",
            action="status",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="memory", action="status", error=exc, json_output=json_output)
    finally:
        client.close()


def _memory_trigger_action(
    *,
    action: str,
    date_str: str | None,
    dry_run: bool,
    json_output: bool,
) -> None:
    payload = {"date": date_str} if date_str is not None else {}
    if dry_run:
        emit_dry_run(resource="memory", action=action, payload=payload, json_output=json_output)
        return
    client = create_memory_client()
    try:
        if action == "compress":
            data, request_id = client.trigger_compress(date_str)
        elif action == "link":
            data, request_id = client.trigger_task_link(date_str)
        elif action == "compress-and-link":
            data, request_id = client.trigger_compress_and_link(date_str)
        elif action == "profile-update":
            data, request_id = client.trigger_profile_update()
        elif action == "profile-consolidate":
            data, request_id = client.trigger_profile_consolidate()
        else:
            raise CliError(
                code="INVALID_ACTION", message=f"Unsupported action: {action}", exit_code=2
            )
        emit_success(
            resource="memory",
            action=action,
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    finally:
        client.close()


@memory_app.command("compress")
def trigger_compress(
    date_str: Annotated[str, typer.Option("--date", help="Date string such as 2026-03-13.")],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the compress request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Trigger memory compression for a date."""
    try:
        _memory_trigger_action(
            action="compress",
            date_str=date_str,
            dry_run=dry_run,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="memory", action="compress", error=exc, json_output=json_output)


@memory_app.command("link")
def trigger_task_link(
    date_str: Annotated[str, typer.Option("--date", help="Date string such as 2026-03-13.")],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the link request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Trigger task linking for a date."""
    try:
        _memory_trigger_action(
            action="link",
            date_str=date_str,
            dry_run=dry_run,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="memory", action="link", error=exc, json_output=json_output)


@memory_app.command("compress-and-link")
def trigger_compress_and_link(
    date_str: Annotated[str, typer.Option("--date", help="Date string such as 2026-03-13.")],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the combined request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Trigger compression and task linking in sequence."""
    try:
        _memory_trigger_action(
            action="compress-and-link",
            date_str=date_str,
            dry_run=dry_run,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="memory",
            action="compress-and-link",
            error=exc,
            json_output=json_output,
        )


@memory_app.command("dedup-stats")
def get_dedup_stats(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get deduplication statistics."""
    client = create_memory_client()
    try:
        data, request_id = client.get_dedup_stats()
        emit_success(
            resource="memory",
            action="dedup-stats",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="memory",
            action="dedup-stats",
            error=exc,
            json_output=json_output,
        )
    finally:
        client.close()


@memory_app.command("task-linker-stats")
def get_task_linker_stats(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get task linker statistics."""
    client = create_memory_client()
    try:
        data, request_id = client.get_task_linker_stats()
        emit_success(
            resource="memory",
            action="task-linker-stats",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="memory",
            action="task-linker-stats",
            error=exc,
            json_output=json_output,
        )
    finally:
        client.close()


@memory_app.command("profile")
def get_profile(
    stats: Annotated[
        bool,
        typer.Option("--stats", help="Read profile stats instead of profile content."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Read the current memory profile or its stats."""
    client = create_memory_client()
    action = "profile-stats" if stats else "profile"
    try:
        data, request_id = client.get_profile_stats() if stats else client.get_profile()
        emit_success(
            resource="memory",
            action=action,
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="memory", action=action, error=exc, json_output=json_output)
    finally:
        client.close()


@memory_app.command("profile-update")
def trigger_profile_update(
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the profile update request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Trigger a profile update cycle."""
    try:
        _memory_trigger_action(
            action="profile-update",
            date_str=None,
            dry_run=dry_run,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="memory",
            action="profile-update",
            error=exc,
            json_output=json_output,
        )


@memory_app.command("profile-consolidate")
def trigger_profile_consolidate(
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the consolidate request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Force profile consolidation."""
    try:
        _memory_trigger_action(
            action="profile-consolidate",
            date_str=None,
            dry_run=dry_run,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="memory",
            action="profile-consolidate",
            error=exc,
            json_output=json_output,
        )
