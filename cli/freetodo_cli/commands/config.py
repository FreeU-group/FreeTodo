"""Config CLI commands."""

from __future__ import annotations

from typing import Annotated

import typer

from freetodo_cli.client import ConfigApiClient
from freetodo_cli.commands.common import (
    emit_dry_run,
    emit_success,
    handle_cli_error,
    read_json_payload,
)
from freetodo_cli.config import load_config
from freetodo_cli.errors import CliError

config_app = typer.Typer(
    help=(
        "Config resource commands.\n\n"
        "Use these commands to inspect and update backend configuration.\n\n"
        "Examples:\n"
        "  freetodo config get --json\n"
        "  freetodo config llm-status --json\n"
        "  freetodo config test-llm --input llm.json --json\n"
        "  freetodo config save --input config.json --dry-run --json"
    ),
    no_args_is_help=True,
    add_completion=False,
)


def create_config_client() -> ConfigApiClient:
    """Build a Config API client from environment configuration."""
    return ConfigApiClient(load_config())


@config_app.command("get")
def get_config(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Fetch the current backend configuration."""
    client = create_config_client()
    try:
        data, request_id = client.get_config()
        emit_success(
            resource="config",
            action="get",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="config", action="get", error=exc, json_output=json_output)
    finally:
        client.close()


@config_app.command("llm-status")
def get_llm_status(
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Check whether LLM configuration is present and validated."""
    client = create_config_client()
    try:
        data, request_id = client.get_llm_status()
        emit_success(
            resource="config",
            action="llm-status",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="config", action="llm-status", error=exc, json_output=json_output)
    finally:
        client.close()


def _load_payload(input_path: str | None, use_stdin: bool) -> dict:
    return read_json_payload(input_path=input_path, use_stdin=use_stdin)


@config_app.command("test-llm")
def test_llm_config(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching the LLM config payload.",
        ),
    ] = None,
    use_stdin: Annotated[
        bool,
        typer.Option("--stdin", help="Read a JSON payload from stdin."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Test LLM configuration."""
    client = create_config_client()
    try:
        payload = _load_payload(input_path, use_stdin)
        data, request_id = client.test_llm_config(payload)
        emit_success(
            resource="config",
            action="test-llm",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="config", action="test-llm", error=exc, json_output=json_output)
    finally:
        client.close()


@config_app.command("test-tavily")
def test_tavily_config(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching the Tavily config payload.",
        ),
    ] = None,
    use_stdin: Annotated[
        bool,
        typer.Option("--stdin", help="Read a JSON payload from stdin."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Test Tavily configuration."""
    client = create_config_client()
    try:
        payload = _load_payload(input_path, use_stdin)
        data, request_id = client.test_tavily_config(payload)
        emit_success(
            resource="config",
            action="test-tavily",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(
            resource="config", action="test-tavily", error=exc, json_output=json_output
        )
    finally:
        client.close()


@config_app.command("test-asr")
def test_asr_config(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file matching the ASR config payload.",
        ),
    ] = None,
    use_stdin: Annotated[
        bool,
        typer.Option("--stdin", help="Read a JSON payload from stdin."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json/--no-json", help="Emit structured JSON output."),
    ] = True,
) -> None:
    """Test ASR configuration."""
    client = create_config_client()
    try:
        payload = _load_payload(input_path, use_stdin)
        data, request_id = client.test_asr_config(payload)
        emit_success(
            resource="config",
            action="test-asr",
            data=data,
            request_id=request_id,
            json_output=json_output,
        )
    except CliError as exc:
        handle_cli_error(resource="config", action="test-asr", error=exc, json_output=json_output)
    finally:
        client.close()


@config_app.command("save")
def save_config(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file containing config updates.",
        ),
    ] = None,
    use_stdin: Annotated[
        bool,
        typer.Option("--stdin", help="Read a JSON payload from stdin."),
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
    """Save backend configuration."""
    try:
        payload = _load_payload(input_path, use_stdin)
        if dry_run:
            emit_dry_run(
                resource="config",
                action="save",
                payload=payload,
                json_output=json_output,
            )
            return
        client = create_config_client()
        try:
            data, request_id = client.save_config(payload)
            emit_success(
                resource="config",
                action="save",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(resource="config", action="save", error=exc, json_output=json_output)


@config_app.command("save-and-init-llm")
def save_and_init_llm(
    input_path: Annotated[
        str | None,
        typer.Option(
            "--input",
            exists=True,
            dir_okay=False,
            help="Path to a JSON file containing LLM configuration.",
        ),
    ] = None,
    use_stdin: Annotated[
        bool,
        typer.Option("--stdin", help="Read a JSON payload from stdin."),
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
    """Save LLM config and reinitialize."""
    try:
        payload = _load_payload(input_path, use_stdin)
        if dry_run:
            emit_dry_run(
                resource="config",
                action="save-and-init-llm",
                payload=payload,
                json_output=json_output,
            )
            return
        client = create_config_client()
        try:
            data, request_id = client.save_and_init_llm(payload)
            emit_success(
                resource="config",
                action="save-and-init-llm",
                data=data,
                request_id=request_id,
                json_output=json_output,
            )
        finally:
            client.close()
    except CliError as exc:
        handle_cli_error(
            resource="config", action="save-and-init-llm", error=exc, json_output=json_output
        )
