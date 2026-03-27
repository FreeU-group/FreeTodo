"""Localized help text catalog for the CLI."""

from __future__ import annotations

from enum import StrEnum


class HelpLanguage(StrEnum):
    EN = "en"
    ZH = "zh"
    BILINGUAL = "bilingual"


HELP_TEXTS = {
    "root": {
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
    },
    "todo": {
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
    },
    "journal": {
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
    },
    "activity": {
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
    },
    "event": {
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
    },
    "automation": {
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
    },
    "memory": {
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
    },
    "screenshot": {
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
    },
    "audio": {
        "en": (
            "Audio resource commands.\n\n"
            "Use these commands to inspect recordings and transcriptions, download audio files, and operate extracted todo links.\n\n"
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
    },
    "scheduler": {
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
    },
    "logs": {
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
    },
    "system": {
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
    },
    "search": {
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
    },
    "vector": {
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
    },
    "notification": {
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
    },
    "location": {
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
    },
    "time-allocation": {
        "en": (
            "Time allocation resource commands.\n\n"
            "Use these commands to fetch aggregated app usage statistics.\n\n"
            "Examples:\n"
            "  freetodo time-allocation get --days 7 --json\n"
            "  freetodo time-allocation get --start-date 2026-03-01 --end-date 2026-03-07 --json\n"
        ),
        "zh": (
            "Time allocation 资源命令。\n\n"
            "可以用这些命令查看聚合后的应用使用统计。\n\n"
            "示例：\n"
            "  freetodo time-allocation get --days 7 --json\n"
            "  freetodo time-allocation get --start-date 2026-03-01 --end-date 2026-03-07 --json\n"
        ),
    },
    "preview": {
        "en": (
            "Preview resource commands.\n\n"
            "Use these commands to preview local files via the backend preview endpoint.\n\n"
            "Examples:\n"
            "  freetodo preview file --path /abs/path/file.txt --mode text --json\n"
            "  freetodo preview file --path /abs/path/file.bin --mode binary --json\n"
        ),
        "zh": (
            "Preview 资源命令。\n\n"
            "可以用这些命令通过后端预览接口查看本地文件内容。\n\n"
            "示例：\n"
            "  freetodo preview file --path /abs/path/file.txt --mode text --json\n"
            "  freetodo preview file --path /abs/path/file.bin --mode binary --json\n"
        ),
    },
    "cost-tracking": {
        "en": (
            "Cost tracking resource commands.\n\n"
            "Use these commands to inspect token usage and cost statistics.\n\n"
            "Examples:\n"
            "  freetodo cost-tracking stats --days 30 --json\n"
            "  freetodo cost-tracking config --json\n"
        ),
        "zh": (
            "Cost tracking 资源命令。\n\n"
            "可以用这些命令查看 token 使用与费用统计。\n\n"
            "示例：\n"
            "  freetodo cost-tracking stats --days 30 --json\n"
            "  freetodo cost-tracking config --json\n"
        ),
    },
    "plugins": {
        "en": (
            "Plugins resource commands.\n\n"
            "Use these commands to inspect plugin status and manage plugin installation.\n\n"
            "Examples:\n"
            "  freetodo plugins list --json\n"
            "  freetodo plugins media-crawler status --json\n"
            "  freetodo plugins media-crawler install --version 1.2.3 --dry-run --json\n"
        ),
        "zh": (
            "Plugins 资源命令。\n\n"
            "可以用这些命令查看插件状态并管理插件安装。\n\n"
            "示例：\n"
            "  freetodo plugins list --json\n"
            "  freetodo plugins media-crawler status --json\n"
            "  freetodo plugins media-crawler install --version 1.2.3 --dry-run --json\n"
        ),
    },
    "config": {
        "en": (
            "Config resource commands.\n\n"
            "Use these commands to inspect and update backend configuration.\n\n"
            "Examples:\n"
            "  freetodo config get --json\n"
            "  freetodo config llm-status --json\n"
            "  freetodo config test-llm --input llm.json --json\n"
            "  freetodo config save --input config.json --dry-run --json\n"
        ),
        "zh": (
            "Config 资源命令。\n\n"
            "可以用这些命令查看或更新后端配置。\n\n"
            "示例：\n"
            "  freetodo config get --json\n"
            "  freetodo config llm-status --json\n"
            "  freetodo config test-llm --input llm.json --json\n"
            "  freetodo config save --input config.json --dry-run --json\n"
        ),
    },
    "health": {
        "en": (
            "Health resource commands.\n\n"
            "Use these commands to check backend and LLM health.\n\n"
            "Examples:\n"
            "  freetodo health root --json\n"
            "  freetodo health status --json\n"
            "  freetodo health llm --json\n"
        ),
        "zh": (
            "Health 资源命令。\n\n"
            "可以用这些命令检查后端与 LLM 的健康状态。\n\n"
            "示例：\n"
            "  freetodo health root --json\n"
            "  freetodo health status --json\n"
            "  freetodo health llm --json\n"
        ),
    },
}


def merge_help(topic: str, language: HelpLanguage) -> str:
    """Render help text in one requested language."""
    if topic not in HELP_TEXTS:
        available = ", ".join(sorted(HELP_TEXTS))
        raise ValueError(f"Unsupported help topic: {topic}. Available topics: {available}")
    if language == HelpLanguage.BILINGUAL:
        return f"{HELP_TEXTS[topic]['en']}\n\n---\n\n{HELP_TEXTS[topic]['zh']}"
    return HELP_TEXTS[topic][language.value]
