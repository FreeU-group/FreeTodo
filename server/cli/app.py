"""Typer application assembly."""

from __future__ import annotations

from enum import StrEnum

import typer

from cli.client import ApiClient
from cli.commands.activity import activity_app
from cli.commands.audio import audio_app
from cli.commands.automation import automation_app
from cli.commands.event import event_app
from cli.commands.journal import journal_app
from cli.commands.location import location_app
from cli.commands.logs import logs_app
from cli.commands.memory import memory_app
from cli.commands.notification import notification_app
from cli.commands.scheduler import scheduler_app
from cli.commands.screenshot import screenshot_app
from cli.commands.search import search_app
from cli.commands.system import system_app
from cli.commands.todo import todo_app
from cli.commands.vector import vector_app
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

AUTOMATION_HELP_TEXT = {
    "en": (
        "Automation task commands.\n\n"
        "Use these commands to inspect, create, update, and control backend automation tasks.\n\n"
        "Examples:\n"
        "  freetodo automation list --json\n"
        "  freetodo automation create --input task.json --json\n"
        "  freetodo automation run --id 12 --json\n"
        "  freetodo automation pause --id 12 --json\n"
    ),
    "zh": (
        "Automation 任务命令。\n\n"
        "可以用这些命令查看、创建、更新并控制后端自动化任务。\n\n"
        "示例：\n"
        "  freetodo automation list --json\n"
        "  freetodo automation create --input task.json --json\n"
        "  freetodo automation run --id 12 --json\n"
        "  freetodo automation pause --id 12 --json\n"
    ),
}

MEMORY_HELP_TEXT = {
    "en": (
        "Memory resource commands.\n\n"
        "Use these commands to inspect daily memory, search historical notes, and trigger memory maintenance flows.\n\n"
        "Examples:\n"
        "  freetodo memory today --json\n"
        "  freetodo memory search --keyword cli --json\n"
        "  freetodo memory compress --date 2026-03-13 --json\n"
        "  freetodo memory profile --json\n"
    ),
    "zh": (
        "Memory 资源命令。\n\n"
        "可以用这些命令查看每日记忆、搜索历史内容，并触发记忆维护流程。\n\n"
        "示例：\n"
        "  freetodo memory today --json\n"
        "  freetodo memory search --keyword cli --json\n"
        "  freetodo memory compress --date 2026-03-13 --json\n"
        "  freetodo memory profile --json\n"
    ),
}

SCREENSHOT_HELP_TEXT = {
    "en": (
        "Screenshot resource commands.\n\n"
        "Use these commands to inspect screenshot metadata, OCR-enriched detail, file paths, and image downloads.\n\n"
        "Examples:\n"
        "  freetodo screenshot list --json\n"
        "  freetodo screenshot get --id 42 --json\n"
        "  freetodo screenshot path --id 42 --json\n"
        "  freetodo screenshot download --id 42 --output shot.png --json\n"
    ),
    "zh": (
        "Screenshot 资源命令。\n\n"
        "可以用这些命令查看截图元数据、OCR 详情、文件路径，以及下载图片文件。\n\n"
        "示例：\n"
        "  freetodo screenshot list --json\n"
        "  freetodo screenshot get --id 42 --json\n"
        "  freetodo screenshot path --id 42 --json\n"
        "  freetodo screenshot download --id 42 --output shot.png --json\n"
    ),
}

AUDIO_HELP_TEXT = {
    "en": (
        "Audio resource commands.\n\n"
        "Use these commands to inspect recordings and transcriptions, download audio files, "
        "and operate extracted todo links.\n\n"
        "Examples:\n"
        "  freetodo audio recordings --date 2026-03-13 --json\n"
        "  freetodo audio transcription --id 12 --json\n"
        "  freetodo audio extract --id 12 --json\n"
        "  freetodo audio download-recording --id 12 --output clip.wav --json\n"
    ),
    "zh": (
        "Audio 资源命令。\n\n"
        "可以用这些命令查看录音和转录、下载音频文件，并处理提取出的待办关联。\n\n"
        "示例：\n"
        "  freetodo audio recordings --date 2026-03-13 --json\n"
        "  freetodo audio transcription --id 12 --json\n"
        "  freetodo audio extract --id 12 --json\n"
        "  freetodo audio download-recording --id 12 --output clip.wav --json\n"
    ),
}

SCHEDULER_HELP_TEXT = {
    "en": (
        "Scheduler resource commands.\n\n"
        "Use these commands to inspect and control backend scheduled jobs.\n\n"
        "Examples:\n"
        "  freetodo scheduler list --json\n"
        "  freetodo scheduler status --json\n"
        "  freetodo scheduler pause --id clean_data_job --json\n"
        "  freetodo scheduler update-interval --id clean_data_job --input interval.json --json\n"
    ),
    "zh": (
        "Scheduler 资源命令。\n\n"
        "可以用这些命令查看并控制后端定时任务。\n\n"
        "示例：\n"
        "  freetodo scheduler list --json\n"
        "  freetodo scheduler status --json\n"
        "  freetodo scheduler pause --id clean_data_job --json\n"
        "  freetodo scheduler update-interval --id clean_data_job --input interval.json --json\n"
    ),
}

LOGS_HELP_TEXT = {
    "en": (
        "Logs resource commands.\n\n"
        "Use these commands to inspect backend log files and read recent log content.\n\n"
        "Examples:\n"
        "  freetodo logs files --json\n"
        "  freetodo logs content --file server/app.log --json\n"
    ),
    "zh": (
        "Logs 资源命令。\n\n"
        "可以用这些命令查看后端日志文件，并读取最近的日志内容。\n\n"
        "示例：\n"
        "  freetodo logs files --json\n"
        "  freetodo logs content --file server/app.log --json\n"
    ),
}

SYSTEM_HELP_TEXT = {
    "en": (
        "System resource commands.\n\n"
        "Use these commands to inspect backend capabilities and system state, and trigger cleanup operations.\n\n"
        "Examples:\n"
        "  freetodo system statistics --json\n"
        "  freetodo system resources --json\n"
        "  freetodo system capabilities --json\n"
        "  freetodo system cleanup --days 30 --dry-run --json\n"
    ),
    "zh": (
        "System 资源命令。\n\n"
        "可以用这些命令查看后端能力和系统状态，并触发清理操作。\n\n"
        "示例：\n"
        "  freetodo system statistics --json\n"
        "  freetodo system resources --json\n"
        "  freetodo system capabilities --json\n"
        "  freetodo system cleanup --days 30 --dry-run --json\n"
    ),
}

SEARCH_HELP_TEXT = {
    "en": (
        "Search resource commands.\n\n"
        "Use these commands to search screenshots and events through backend OCR indexes.\n\n"
        "Examples:\n"
        "  freetodo search screenshots --query meeting notes --json\n"
        "  freetodo search events --input search.json --json\n"
    ),
    "zh": (
        "Search 资源命令。\n\n"
        "可以用这些命令通过后端 OCR 索引搜索截图和事件。\n\n"
        "示例：\n"
        "  freetodo search screenshots --query meeting notes --json\n"
        "  freetodo search events --input search.json --json\n"
    ),
}

VECTOR_HELP_TEXT = {
    "en": (
        "Vector resource commands.\n\n"
        "Use these commands to run semantic search and manage the backend vector index.\n\n"
        "Examples:\n"
        "  freetodo vector semantic-search --input semantic.json --json\n"
        "  freetodo vector stats --json\n"
        "  freetodo vector sync --limit 100 --dry-run --json\n"
    ),
    "zh": (
        "Vector 资源命令。\n\n"
        "可以用这些命令做语义搜索，并管理后端向量索引。\n\n"
        "示例：\n"
        "  freetodo vector semantic-search --input semantic.json --json\n"
        "  freetodo vector stats --json\n"
        "  freetodo vector sync --limit 100 --dry-run --json\n"
    ),
}

NOTIFICATION_HELP_TEXT = {
    "en": (
        "Notification resource commands.\n\n"
        "Use these commands to inspect backend notifications and clear handled items.\n\n"
        "Examples:\n"
        "  freetodo notification list --json\n"
        "  freetodo notification delete --id notif-123 --dry-run --json\n"
    ),
    "zh": (
        "Notification 资源命令。\n\n"
        "可以用这些命令查看后端通知，并清理已处理的通知项。\n\n"
        "示例：\n"
        "  freetodo notification list --json\n"
        "  freetodo notification delete --id notif-123 --dry-run --json\n"
    ),
}

LOCATION_HELP_TEXT = {
    "en": (
        "Location resource commands.\n\n"
        "Use these commands to report GPS fixes and inspect stored location history.\n\n"
        "Examples:\n"
        "  freetodo location latest --json\n"
        "  freetodo location history --limit 20 --json\n"
        "  freetodo location report --input location.json --dry-run --json\n"
    ),
    "zh": (
        "Location 资源命令。\n\n"
        "可以用这些命令上报 GPS 定位，并查看已存储的位置历史。\n\n"
        "示例：\n"
        "  freetodo location latest --json\n"
        "  freetodo location history --limit 20 --json\n"
        "  freetodo location report --input location.json --dry-run --json\n"
    ),
}


def _merge_help(topic: str, language: HelpLanguage) -> str:
    help_map = {
        "root": ROOT_HELP_TEXT,
        "todo": TODO_HELP_TEXT,
        "journal": JOURNAL_HELP_TEXT,
        "activity": ACTIVITY_HELP_TEXT,
        "event": EVENT_HELP_TEXT,
        "automation": AUTOMATION_HELP_TEXT,
        "memory": MEMORY_HELP_TEXT,
        "screenshot": SCREENSHOT_HELP_TEXT,
        "audio": AUDIO_HELP_TEXT,
        "scheduler": SCHEDULER_HELP_TEXT,
        "logs": LOGS_HELP_TEXT,
        "system": SYSTEM_HELP_TEXT,
        "search": SEARCH_HELP_TEXT,
        "vector": VECTOR_HELP_TEXT,
        "notification": NOTIFICATION_HELP_TEXT,
        "location": LOCATION_HELP_TEXT,
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
        help=(
            "Help topic to render, currently: root, todo, journal, activity, event, "
            "automation, memory, screenshot, audio, scheduler, logs, system, "
            "search, vector, notification, or location."
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
app.add_typer(automation_app, name="automation")
app.add_typer(memory_app, name="memory")
app.add_typer(notification_app, name="notification")
app.add_typer(location_app, name="location")
app.add_typer(screenshot_app, name="screenshot")
app.add_typer(audio_app, name="audio")
app.add_typer(scheduler_app, name="scheduler")
app.add_typer(logs_app, name="logs")
app.add_typer(system_app, name="system")
app.add_typer(search_app, name="search")
app.add_typer(vector_app, name="vector")
