"""Typer application assembly."""

from __future__ import annotations

import typer

from freetodo_cli.client import ApiClient
from freetodo_cli.commands.activity import activity_app
from freetodo_cli.commands.audio import audio_app
from freetodo_cli.commands.automation import automation_app
from freetodo_cli.commands.chat import chat_app
from freetodo_cli.commands.config import config_app
from freetodo_cli.commands.cost_tracking import cost_tracking_app
from freetodo_cli.commands.event import event_app
from freetodo_cli.commands.health import health_app
from freetodo_cli.commands.journal import journal_app
from freetodo_cli.commands.location import location_app
from freetodo_cli.commands.logs import logs_app
from freetodo_cli.commands.memory import memory_app
from freetodo_cli.commands.notification import notification_app
from freetodo_cli.commands.plugins import plugins_app
from freetodo_cli.commands.preview import preview_app
from freetodo_cli.commands.scheduler import scheduler_app
from freetodo_cli.commands.screenshot import screenshot_app
from freetodo_cli.commands.search import search_app
from freetodo_cli.commands.system import system_app
from freetodo_cli.commands.time_allocation import time_allocation_app
from freetodo_cli.commands.todo import todo_app
from freetodo_cli.commands.vector import vector_app
from freetodo_cli.config import load_config
from freetodo_cli.errors import CliError
from freetodo_cli.help_catalog import HELP_TEXTS, HelpLanguage, merge_help
from freetodo_cli.output import build_envelope, emit_json

app = typer.Typer(
    help=HELP_TEXTS["root"]["en"],
    no_args_is_help=True,
    add_completion=False,
)


def _doctor_payload() -> dict[str, str | float | bool | None]:
    config = load_config()
    return {
        "base_url": config.base_url,
        "has_api_token": bool(config.api_token),
        "timeout_sec": config.timeout_sec,
    }


@app.command("help")
def render_help(
    topic: str = typer.Argument(
        "root",
        help=(
            "Help topic to render, currently: root, todo, journal, activity, event, "
            "automation, memory, screenshot, audio, scheduler, logs, system, "
            "search, vector, notification, location, time-allocation, preview, "
            "cost-tracking, plugins, config, or health."
        ),
    ),
    lang: HelpLanguage = typer.Option(
        HelpLanguage.EN,
        "--lang",
        help="Language for rendered help: en, zh, or bilingual.",
        case_sensitive=False,
    ),
) -> None:
    """Render localized help text for a command group."""
    try:
        typer.echo(merge_help(topic, lang))
    except ValueError as exc:
        raise typer.BadParameter(str(exc)) from exc


@app.command("doctor")
def doctor(
    json_output: bool = typer.Option(True, "--json/--no-json", help="Emit structured JSON output."),
) -> None:
    """Check CLI configuration and backend health."""
    config = load_config()
    client = ApiClient(config)
    try:
        health, request_id = client.health_check()
        payload = build_envelope(
            ok=True,
            resource="system",
            action="doctor",
            data={
                "config": _doctor_payload(),
                "backend_health": health,
            },
            request_id=request_id,
        )
        if json_output:
            emit_json(payload)
        else:
            typer.echo(payload)
    except CliError as exc:
        payload = build_envelope(
            ok=False,
            resource="system",
            action="doctor",
            error={
                "code": exc.code,
                "message": exc.message,
                "details": {
                    "config": _doctor_payload(),
                    **(exc.details or {}),
                },
            },
        )
        if json_output:
            emit_json(payload, stream="stderr")
        else:
            typer.echo(payload, err=True)
        raise typer.Exit(exc.exit_code) from exc
    finally:
        client.close()


app.add_typer(todo_app, name="todo")
app.add_typer(journal_app, name="journal")
app.add_typer(activity_app, name="activity")
app.add_typer(event_app, name="event")
app.add_typer(automation_app, name="automation")
app.add_typer(chat_app, name="chat")
app.add_typer(config_app, name="config")
app.add_typer(memory_app, name="memory")
app.add_typer(notification_app, name="notification")
app.add_typer(location_app, name="location")
app.add_typer(time_allocation_app, name="time-allocation")
app.add_typer(preview_app, name="preview")
app.add_typer(cost_tracking_app, name="cost-tracking")
app.add_typer(plugins_app, name="plugins")
app.add_typer(health_app, name="health")
app.add_typer(screenshot_app, name="screenshot")
app.add_typer(audio_app, name="audio")
app.add_typer(scheduler_app, name="scheduler")
app.add_typer(logs_app, name="logs")
app.add_typer(system_app, name="system")
app.add_typer(search_app, name="search")
app.add_typer(vector_app, name="vector")
