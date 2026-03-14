"""Scheduler CLI commands."""

from __future__ import annotations

from typing import Annotated, Any

import typer
from pydantic import BaseModel, Field, model_validator

from freetodo_cli.client import SchedulerApiClient
from freetodo_cli.commands.common import (
    emit_dry_run,
    emit_success,
    handle_cli_error,
    model_payload,
    read_json_payload,
)
from freetodo_cli.config import load_config
from freetodo_cli.errors import CliError


class JobIntervalUpdateModel(BaseModel):
    """CLI validation model for scheduler interval updates."""

    seconds: int | None = Field(default=None, ge=1)
    minutes: int | None = Field(default=None, ge=1)
    hours: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def validate_any_field(self) -> JobIntervalUpdateModel:
        """Require at least one interval field."""
        if self.seconds is None and self.minutes is None and self.hours is None:
            raise ValueError("At least one of seconds, minutes, or hours must be provided")
        return self


scheduler_app = typer.Typer(
    help=(
        "Scheduler resource commands.\n\n"
        "Use these commands to inspect and control backend scheduled jobs.\n\n"
        "Examples:\n"
        "  freetodo scheduler list --json\n"
        "  freetodo scheduler status --json\n"
        "  freetodo scheduler pause --id clean_data_job --json\n"
        "  freetodo scheduler update-interval --id clean_data_job --input interval.json --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)

SCHEMA_EXAMPLES: dict[str, dict[str, Any]] = {
    "update-interval": {
        "minutes": 30,
    }
}


def create_scheduler_client() -> SchedulerApiClient:
    """Build a Scheduler API client from environment configuration."""
    return SchedulerApiClient(load_config())


@scheduler_app.command("schema")
def scheduler_schema(
    kind: Annotated[
        str,
        typer.Option(
            "--kind",
            help="Schema kind to render. Currently: update-interval.",
            case_sensitive=False,
        ),
    ] = "update-interval",
    include_example: Annotated[
        bool,
        typer.Option("--example/--no-example", help="Include an example payload."),
    ] = True,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Render JSON schema for scheduler payloads."""
    normalized_kind = kind.lower()
    if normalized_kind != "update-interval":
        raise typer.BadParameter("kind must be: update-interval")

    data: dict[str, Any] = {
        "kind": normalized_kind,
        "schema": JobIntervalUpdateModel.model_json_schema(),
    }
    if include_example:
        data["example"] = SCHEMA_EXAMPLES[normalized_kind]

    emit_success(
        resource="scheduler",
        action="schema",
        data=data,
        request_id="local-schema",
        json_output=json_output,
    )


@scheduler_app.command("list")
def list_jobs(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """List scheduler jobs."""
    client = create_scheduler_client()
    try:
        data, request_id = client.list_jobs()
        emit_success(
            resource="scheduler",
            action="list",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="scheduler", action="list", error=exc, json_output=json_output)
    finally:
        client.close()


@scheduler_app.command("get")
def get_job(
    job_id: Annotated[str, typer.Option("--id", help="Job ID to fetch.")],
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get a single scheduler job."""
    client = create_scheduler_client()
    try:
        data, request_id = client.get_job(job_id)
        emit_success(
            resource="scheduler",
            action="get",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="scheduler", action="get", error=exc, json_output=json_output)
    finally:
        client.close()


@scheduler_app.command("status")
def get_scheduler_status(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Get scheduler status."""
    client = create_scheduler_client()
    try:
        data, request_id = client.get_status()
        emit_success(
            resource="scheduler",
            action="status",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="scheduler", action="status", error=exc, json_output=json_output)
    finally:
        client.close()


def _job_action(
    *,
    action: str,
    job_id: str | None,
    payload: dict[str, Any] | None,
    dry_run: bool,
    json_output: bool,
) -> None:
    dry_payload = {}
    if job_id is not None:
        dry_payload["job_id"] = job_id
    if payload:
        dry_payload["payload"] = payload
    if dry_run:
        emit_dry_run(
            resource="scheduler", action=action, payload=dry_payload, json_output=json_output
        )
        return
    client = create_scheduler_client()
    try:
        if action == "pause":
            data, request_id = client.pause_job(job_id)
        elif action == "resume":
            data, request_id = client.resume_job(job_id)
        elif action == "delete":
            data, request_id = client.delete_job(job_id)
        elif action == "pause-all":
            data, request_id = client.pause_all_jobs()
        elif action == "resume-all":
            data, request_id = client.resume_all_jobs()
        elif action == "update-interval":
            data, request_id = client.update_job_interval(job_id, payload)
        else:
            raise CliError(
                code="INVALID_ACTION", message=f"Unsupported action: {action}", exit_code=2
            )
        emit_success(
            resource="scheduler",
            action=action,
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    finally:
        client.close()


@scheduler_app.command("pause")
def pause_job(
    job_id: Annotated[str, typer.Option("--id", help="Job ID to pause.")],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the pause request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Pause a scheduler job."""
    try:
        _job_action(
            action="pause", job_id=job_id, payload=None, dry_run=dry_run, json_output=json_output
        )
    except CliError as exc:
        handle_cli_error(resource="scheduler", action="pause", error=exc, json_output=json_output)


@scheduler_app.command("resume")
def resume_job(
    job_id: Annotated[str, typer.Option("--id", help="Job ID to resume.")],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the resume request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Resume a scheduler job."""
    try:
        _job_action(
            action="resume", job_id=job_id, payload=None, dry_run=dry_run, json_output=json_output
        )
    except CliError as exc:
        handle_cli_error(resource="scheduler", action="resume", error=exc, json_output=json_output)


@scheduler_app.command("delete")
def delete_job(
    job_id: Annotated[str, typer.Option("--id", help="Job ID to delete.")],
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the delete request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Delete a scheduler job."""
    try:
        _job_action(
            action="delete", job_id=job_id, payload=None, dry_run=dry_run, json_output=json_output
        )
    except CliError as exc:
        handle_cli_error(resource="scheduler", action="delete", error=exc, json_output=json_output)


@scheduler_app.command("pause-all")
def pause_all_jobs(
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the pause-all request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Pause all scheduler jobs."""
    try:
        _job_action(
            action="pause-all", job_id=None, payload=None, dry_run=dry_run, json_output=json_output
        )
    except CliError as exc:
        handle_cli_error(
            resource="scheduler", action="pause-all", error=exc, json_output=json_output
        )


@scheduler_app.command("resume-all")
def resume_all_jobs(
    dry_run: Annotated[
        bool,
        typer.Option("--dry-run", help="Preview the resume-all request without sending it."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Resume all scheduler jobs."""
    try:
        _job_action(
            action="resume-all",
            job_id=None,
            payload=None,
            dry_run=dry_run,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="scheduler", action="resume-all", error=exc, json_output=json_output
        )


@scheduler_app.command("update-interval")
def update_interval(
    job_id: Annotated[str, typer.Option("--id", help="Job ID to update.")],
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching the interval update schema.",
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
    """Update a scheduler job interval."""
    try:
        payload = model_payload(
            JobIntervalUpdateModel,
            read_json_payload(input_path=input_path, use_stdin=use_stdin),
        )
        _job_action(
            action="update-interval",
            job_id=job_id,
            payload=payload,
            dry_run=dry_run,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="scheduler",
            action="update-interval",
            error=exc,
            json_output=json_output,
        )
