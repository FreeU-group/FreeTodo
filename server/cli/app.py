"""Typer application assembly."""

from __future__ import annotations

from enum import StrEnum

import typer

from cli.client import ApiClient
from cli.commands.activity import activity_app
from cli.commands.event import event_app
from cli.commands.journal import journal_app
from cli.commands.todo import todo_app
from cli.config import load_config
from cli.errors import CliError
from cli.output import build_envelope, emit_json


class HelpLanguage(StrEnum):
    EN = "en"
    ZH = "zh"
    BILINGUAL = "bilingual"


ROOT_HELP_TEXT = {
    "en": (
        "Agent-first CLI for Lifetrace/FreeTodo backend operations.\n\n"
        "Use this CLI to read and modify backend resources through the HTTP API.\n\n"
        "Quick start:\n"
        "  1. Start server: uv run --directory server python server.py\n"
        "  2. List todos:   uv run --directory server freetodo todo list --json\n"
        "  3. Create todo:  uv run --directory server freetodo todo create --input todo.json --json\n\n"
        "Environment variables:\n"
        "  FREETODO_BASE_URL     Backend base URL. Default: http://127.0.0.1:8001\n"
        "  FREETODO_API_TOKEN    Bearer token for authenticated deployments\n"
        "  FREETODO_TIMEOUT_SEC  HTTP timeout in seconds. Default: 30\n\n"
        "Agent recommendation:\n"
        "  Prefer --json and file/stdin input for stable automation."
    ),
    "zh": (
        "面向 Agent 的 Lifetrace/FreeTodo 后端命令行入口。\n\n"
        "这个 CLI 通过 HTTP API 读取和修改后端资源。\n\n"
        "快速开始：\n"
        "  1. 启动后端：uv run --directory server python server.py\n"
        "  2. 查看待办：uv run --directory server freetodo todo list --json\n"
        "  3. 创建待办：uv run --directory server freetodo todo create --input todo.json --json\n\n"
        "环境变量：\n"
        "  FREETODO_BASE_URL     后端基础地址，默认 http://127.0.0.1:8001\n"
        "  FREETODO_API_TOKEN    鉴权 token\n"
        "  FREETODO_TIMEOUT_SEC  HTTP 超时秒数，默认 30\n\n"
        "Agent 建议：\n"
        "  为了稳定自动化，请优先使用 --json，并通过文件或 stdin 传入输入。"
    ),
}

TODO_HELP_TEXT = {
    "en": (
        "Todo resource commands.\n\n"
        "Use JSON-first commands for reliable agent automation.\n"
        "Read commands return backend data; write commands modify backend todos through HTTP APIs.\n\n"
        "Examples:\n"
        "  freetodo todo list --status active --json\n"
        "  freetodo todo get --id 42 --json\n"
        "  freetodo todo create --input todo.json --json\n"
        "  freetodo todo update --id 42 --patch patch.json --json\n"
        "  freetodo todo delete --id 42 --json\n"
    ),
    "zh": (
        "Todo 资源命令。\n\n"
        "建议以 JSON 为中心来调用这些命令，便于 Agent 稳定自动化。\n"
        "读取命令返回后端数据；写入命令通过 HTTP API 修改后端待办。\n\n"
        "示例：\n"
        "  freetodo todo list --status active --json\n"
        "  freetodo todo get --id 42 --json\n"
        "  freetodo todo create --input todo.json --json\n"
        "  freetodo todo update --id 42 --patch patch.json --json\n"
        "  freetodo todo delete --id 42 --json\n"
    ),
}

JOURNAL_HELP_TEXT = {
    "en": (
        "Journal resource commands.\n\n"
        "Use JSON-first commands for journaling workflows and agent automation.\n"
        "Read commands fetch journals; write commands modify journal records through HTTP APIs.\n\n"
        "Examples:\n"
        "  freetodo journal list --json\n"
        "  freetodo journal create --input journal.json --json\n"
        "  freetodo journal auto-link --input link.json --json\n"
        "  freetodo journal generate-ai --input draft.json --json\n"
    ),
    "zh": (
        "Journal 资源命令。\n\n"
        "建议以 JSON 为中心来调用这些命令，便于日记流和 Agent 自动化。\n"
        "读取命令获取日记；写入命令通过 HTTP API 修改日记记录。\n\n"
        "示例：\n"
        "  freetodo journal list --json\n"
        "  freetodo journal create --input journal.json --json\n"
        "  freetodo journal auto-link --input link.json --json\n"
        "  freetodo journal generate-ai --input draft.json --json\n"
    ),
}

ACTIVITY_HELP_TEXT = {
    "en": (
        "Activity resource commands.\n\n"
        "Activities are aggregated event windows. Use these commands to inspect or manually create them.\n\n"
        "Examples:\n"
        "  freetodo activity list --json\n"
        "  freetodo activity events --id 42 --json\n"
        "  freetodo activity create-manual --input activity.json --json\n"
    ),
    "zh": (
        "Activity 资源命令。\n\n"
        "活动是聚合后的事件窗口。可以用这些命令查看活动，或手动创建活动。\n\n"
        "示例：\n"
        "  freetodo activity list --json\n"
        "  freetodo activity events --id 42 --json\n"
        "  freetodo activity create-manual --input activity.json --json\n"
    ),
}

EVENT_HELP_TEXT = {
    "en": (
        "Event resource commands.\n\n"
        "Events represent foreground app usage windows. Use these commands to inspect detailed context.\n\n"
        "Examples:\n"
        "  freetodo event list --json\n"
        "  freetodo event get --id 42 --json\n"
        "  freetodo event context --id 42 --json\n"
        "  freetodo event generate-summary --id 42 --json\n"
    ),
    "zh": (
        "Event 资源命令。\n\n"
        "事件表示前台应用使用窗口。可以用这些命令查看更细的上下文。\n\n"
        "示例：\n"
        "  freetodo event list --json\n"
        "  freetodo event get --id 42 --json\n"
        "  freetodo event context --id 42 --json\n"
        "  freetodo event generate-summary --id 42 --json\n"
    ),
}


def _merge_help(topic: str, language: HelpLanguage) -> str:
    help_map = {
        "root": ROOT_HELP_TEXT,
        "todo": TODO_HELP_TEXT,
        "journal": JOURNAL_HELP_TEXT,
        "activity": ACTIVITY_HELP_TEXT,
        "event": EVENT_HELP_TEXT,
    }
    if topic not in help_map:
        raise typer.BadParameter(f"Unsupported help topic: {topic}")
    if language == HelpLanguage.BILINGUAL:
        return f"{help_map[topic]['en']}\n\n---\n\n{help_map[topic]['zh']}"
    return help_map[topic][language.value]


app = typer.Typer(
    help=ROOT_HELP_TEXT["en"],
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
        help="Help topic to render, currently: root, todo, journal, activity, or event.",
    ),
    lang: HelpLanguage = typer.Option(
        HelpLanguage.EN,
        "--lang",
        help="Language for rendered help: en, zh, or bilingual.",
        case_sensitive=False,
    ),
) -> None:
    """Render localized help text for a command group."""
    typer.echo(_merge_help(topic, lang))


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
