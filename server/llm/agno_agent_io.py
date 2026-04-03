"""Shared attachment and stream-event helpers for Agno agents."""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

from agno.agent import RunEvent

TOOL_EVENT_PREFIX = "\n[TOOL_EVENT:"
TOOL_EVENT_SUFFIX = "]\n"
RESULT_PREVIEW_MAX_LENGTH = 500
MAX_INLINE_TEXT_ATTACHMENT_BYTES = 200_000

TEXT_ATTACHMENT_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".json",
    ".yaml",
    ".yml",
    ".csv",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".java",
    ".go",
    ".rs",
    ".rb",
    ".php",
    ".sh",
    ".bat",
    ".ps1",
    ".sql",
    ".html",
    ".css",
    ".xml",
    ".toml",
    ".ini",
    ".log",
}


def read_text_attachment(file_path: str, mime_type: str | None) -> str | None:
    path = Path(file_path)
    if not path.exists() or not path.is_file():
        return None

    if (
        mime_type
        and not mime_type.startswith("text/")
        and path.suffix.lower() not in TEXT_ATTACHMENT_EXTENSIONS
    ):
        return None

    try:
        data = path.read_bytes()
    except Exception:
        return None

    if len(data) > MAX_INLINE_TEXT_ATTACHMENT_BYTES:
        return None

    try:
        return data.decode("utf-8", errors="replace")
    except Exception:
        return None


def read_image_data_url(file_path: str, mime_type: str | None) -> str | None:
    path = Path(file_path)
    if not path.exists() or not path.is_file():
        return None
    try:
        data = path.read_bytes()
    except Exception:
        return None

    mime = mime_type or "image/png"
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def build_user_message_content(
    message: str,
    attachments: list[dict[str, Any]] | None,
) -> str | list[dict[str, Any]]:
    if not attachments:
        return message

    parts: list[dict[str, Any]] = []
    if message:
        parts.append({"type": "text", "text": message})

    for attachment in attachments:
        name = str(attachment.get("file_name") or "attachment")
        mime_type = attachment.get("mime_type")
        file_path = attachment.get("file_path")
        kind = attachment.get("kind") or "file"

        if kind == "image" and file_path:
            data_url = read_image_data_url(str(file_path), mime_type)
            if data_url:
                parts.append({"type": "image_url", "image_url": {"url": data_url}})
                continue
            parts.append({"type": "text", "text": f"[Image attachment: {name}]"})
            continue

        snippet = read_text_attachment(str(file_path), mime_type) if file_path else None
        if snippet:
            parts.append(
                {
                    "type": "text",
                    "text": f"[Attachment: {name}]\n{snippet}",
                }
            )
            continue

        details = f"{mime_type or 'application/octet-stream'}"
        size = attachment.get("file_size")
        if size:
            details = f"{details}, {size} bytes"
        parts.append(
            {
                "type": "text",
                "text": f"[Attachment: {name} ({details})] File stored on disk for reference.",
            }
        )

    return parts if parts else message


def format_tool_event(event_data: dict[str, Any]) -> str:
    return f"{TOOL_EVENT_PREFIX}{json.dumps(event_data, ensure_ascii=False)}{TOOL_EVENT_SUFFIX}"


def _build_result_preview(value: Any) -> str:
    result = str(value)
    if len(result) > RESULT_PREVIEW_MAX_LENGTH:
        return result[:RESULT_PREVIEW_MAX_LENGTH] + "..."
    return result


def _build_tool_start_event(chunk, logger) -> str | None:
    tool_info = getattr(chunk, "tool", None)
    if not tool_info:
        return None
    event_data = {
        "type": "tool_call_start",
        "tool_name": getattr(tool_info, "tool_name", "unknown"),
        "tool_args": getattr(tool_info, "tool_args", {}),
    }
    logger.debug("工具调用开始: %s, 参数: %s", event_data["tool_name"], event_data["tool_args"])
    return format_tool_event(event_data)


def _build_tool_end_event(chunk, logger, *, is_error: bool) -> str | None:
    tool_info = getattr(chunk, "tool", None)
    if not tool_info:
        return None

    value = getattr(tool_info, "result", "")
    if is_error:
        value = (
            getattr(tool_info, "error", None) or getattr(chunk, "error", None) or "Unknown error"
        )
    result_preview = _build_result_preview(value)
    if is_error:
        result_preview = f"[Error] {result_preview}"

    event_data = {
        "type": "tool_call_end",
        "tool_name": getattr(tool_info, "tool_name", "unknown"),
        "result_preview": result_preview,
    }
    if is_error:
        event_data["error"] = True
        logger.warning(
            "工具调用错误: %s, 错误: %s...", event_data["tool_name"], result_preview[:100]
        )
    else:
        logger.debug(
            "工具调用完成: %s, 结果预览: %s...", event_data["tool_name"], result_preview[:100]
        )
    return format_tool_event(event_data)


def process_stream_chunk(chunk, include_tool_events: bool, logger) -> str | None:
    result = None
    if chunk.event == RunEvent.run_content:
        result = chunk.content if chunk.content else None
    elif chunk.event == RunEvent.reasoning_started:
        logger.debug("Reasoning 开始")
        result = format_tool_event({"type": "reasoning_started"})
    elif chunk.event == RunEvent.reasoning_content_delta:
        content = getattr(chunk, "content", None) or getattr(chunk, "reasoning_content", None)
        if content:
            result = format_tool_event({"type": "reasoning_delta", "content": content})
    elif chunk.event == RunEvent.reasoning_step:
        content = getattr(chunk, "reasoning_content", None) or getattr(chunk, "content", None)
        if content:
            result = format_tool_event({"type": "reasoning_delta", "content": content})
    elif chunk.event == RunEvent.reasoning_completed:
        logger.debug("Reasoning 完成")
        result = format_tool_event({"type": "reasoning_completed"})
    elif include_tool_events:
        if chunk.event == RunEvent.tool_call_started:
            result = _build_tool_start_event(chunk, logger)
        elif chunk.event == RunEvent.tool_call_completed:
            result = _build_tool_end_event(chunk, logger, is_error=False)
        elif chunk.event == RunEvent.tool_call_error:
            result = _build_tool_end_event(chunk, logger, is_error=True)
        elif chunk.event == RunEvent.run_started:
            logger.debug("Agent 运行开始")
            result = format_tool_event({"type": "run_started"})
        elif chunk.event == RunEvent.run_completed:
            logger.debug("Agent 运行完成")
            result = format_tool_event({"type": "run_completed"})
    return result
