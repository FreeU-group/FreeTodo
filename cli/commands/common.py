"""Shared helpers for CLI resource commands."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import typer
from pydantic import ValidationError

from cli.errors import CliError
from cli.output import build_envelope, emit_json


def read_json_payload(
    *,
    input_path: str | None,
    use_stdin: bool,
) -> dict[str, Any]:
    """Read a JSON object from a file or stdin."""
    if input_path and use_stdin:
        raise CliError(
            code="INVALID_INPUT_MODE",
            message="Use either --input or --stdin, not both",
            exit_code=2,
        )
    if input_path:
        try:
            payload = json.loads(Path(input_path).read_text(encoding="utf-8"))
        except OSError as exc:
            raise CliError(
                code="INPUT_READ_FAILED",
                message=f"Failed to read input file: {exc}",
                exit_code=2,
            ) from exc
        except json.JSONDecodeError as exc:
            raise CliError(
                code="INVALID_JSON",
                message=f"Input file does not contain valid JSON: {exc}",
                exit_code=2,
            ) from exc
    elif use_stdin:
        raw = sys.stdin.read()
        if not raw.strip():
            raise CliError(
                code="EMPTY_STDIN",
                message="Expected JSON payload on stdin",
                exit_code=2,
            )
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise CliError(
                code="INVALID_JSON",
                message=f"stdin does not contain valid JSON: {exc}",
                exit_code=2,
            ) from exc
    else:
        raise CliError(
            code="MISSING_INPUT",
            message="Provide JSON via --input or --stdin",
            exit_code=2,
        )

    if not isinstance(payload, dict):
        raise CliError(
            code="INVALID_JSON_OBJECT",
            message="Expected a top-level JSON object",
            exit_code=2,
        )
    return payload


def model_payload(model_cls: type[Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Validate a JSON object against a Pydantic model."""
    try:
        model = model_cls.model_validate(payload)
    except ValidationError as exc:
        raise CliError(
            code="VALIDATION_ERROR",
            message="Payload validation failed",
            exit_code=2,
            details={"errors": exc.errors()},
        ) from exc
    return model.model_dump(mode="json", exclude_unset=True)


def emit_success(
    *,
    resource: str,
    action: str,
    data: Any,
    request_id: str | None,
    json_output: bool,
    dry_run: bool = False,
) -> None:
    """Emit a successful CLI envelope."""
    payload = build_envelope(
        ok=True,
        resource=resource,
        action=action,
        data=data,
        request_id=request_id,
        dry_run=dry_run,
    )
    if json_output:
        emit_json(payload)
        return
    typer.echo(json.dumps(payload, ensure_ascii=False, indent=2))


def handle_cli_error(*, resource: str, action: str, error: CliError, json_output: bool) -> None:
    """Emit a structured error envelope and exit."""
    payload = build_envelope(
        ok=False,
        resource=resource,
        action=action,
        data=None,
        error={
            "code": error.code,
            "message": error.message,
            "details": error.details or {},
        },
    )
    if json_output:
        emit_json(payload, stream="stderr")
    else:
        typer.echo(json.dumps(payload, ensure_ascii=False, indent=2), err=True)
    raise typer.Exit(code=error.exit_code)


def emit_dry_run(
    *,
    resource: str,
    action: str,
    payload: Any,
    json_output: bool,
    extra: dict[str, Any] | None = None,
) -> None:
    """Emit a dry-run preview envelope."""
    dry_run_data = {"payload": payload}
    if extra:
        dry_run_data.update(extra)
    emit_success(
        resource=resource,
        action=action,
        data=dry_run_data,
        request_id="dry-run",
        json_output=json_output,
        dry_run=True,
    )


def read_existing_file(path: str) -> Path:
    """Validate that a local file exists before using it."""
    file_path = Path(path)
    if not file_path.exists() or not file_path.is_file():
        raise CliError(
            code="FILE_NOT_FOUND",
            message=f"File does not exist: {path}",
            exit_code=2,
        )
    return file_path
