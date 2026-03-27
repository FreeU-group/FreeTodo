"""Agno 模式处理器（基于本地 Agno Agent）。"""

import json
import threading
from typing import Any

from fastapi.responses import StreamingResponse

from llm.agno_agent import AgnoAgentService
from llm.agno_agent_io import TOOL_EVENT_PREFIX, TOOL_EVENT_SUFFIX
from llm.agno_tools.memory_toolkit import MemoryToolkit
from routers.chat.base import _schedule_preference_extraction, publish_ai_output_to_perception
from schemas.chat import ChatMessage
from services.chat_service import ChatService
from util.logging_config import get_logger
from util.settings import settings

from ..helpers import make_error_streaming_response, validate_workspace_path

logger = get_logger()


def _resolve_workspace_path(
    external_tools: list[str],
    workspace_path: str | None,
) -> str | None:
    local_tools = {"file", "local_fs", "shell"}
    needs_workspace = bool(local_tools & set(external_tools))
    if not needs_workspace or workspace_path:
        return workspace_path

    default_workspace = settings.get("agno.default_workspace")
    logger.info(f"[stream][agno] 未指定 workspace_path，使用默认值: {default_workspace}")
    return default_workspace


def _validate_workspace_or_error(
    workspace_path: str | None,
    lang: str,
    session_id: str,
) -> StreamingResponse | None:
    if not workspace_path:
        return None

    is_valid, validation_error = validate_workspace_path(workspace_path)
    if is_valid:
        return None

    err = (
        f"工作区验证失败: {validation_error}"
        if lang == "zh"
        else f"Workspace validation failed: {validation_error}"
    )
    return make_error_streaming_response(err, session_id)


def _resolve_user_id(message_user_id: str | None, session_id: str) -> str:
    user_id = message_user_id or settings.get("agno.user_id") or session_id
    if not message_user_id and not settings.get("agno.user_id"):
        logger.info(f"[stream][agno] user_id 未提供，使用 session_id 作为 user_id: {session_id}")
    return user_id


def _parse_tool_events_for_storage(
    chunk: str,
    base_offset: int,
) -> tuple[list[dict[str, Any]], str, str]:
    events: list[dict[str, Any]] = []
    output_parts: list[str] = []
    output_len = 0
    cursor = 0

    while True:
        start_idx = chunk.find(TOOL_EVENT_PREFIX, cursor)
        if start_idx == -1:
            output_parts.append(chunk[cursor:])
            output_len += len(chunk[cursor:])
            break

        end_idx = chunk.find(TOOL_EVENT_SUFFIX, start_idx)
        if end_idx == -1:
            output_parts.append(chunk[cursor:start_idx])
            output_len += len(chunk[cursor:start_idx])
            pending = chunk[start_idx:]
            return events, "".join(output_parts), pending

        output_parts.append(chunk[cursor:start_idx])
        output_len += len(chunk[cursor:start_idx])

        json_start = start_idx + len(TOOL_EVENT_PREFIX)
        json_str = chunk[json_start:end_idx]
        try:
            event = json.loads(json_str)
            if isinstance(event, dict):
                event["offset"] = base_offset + output_len
                events.append(event)
        except json.JSONDecodeError:
            logger.debug("[stream][agno] Failed to parse tool event payload.")

        cursor = end_idx + len(TOOL_EVENT_SUFFIX)

    return events, "".join(output_parts), ""


def _save_and_publish(
    storage_chunks: list[str],
    tool_events: list[dict[str, Any]],
    chat_service: ChatService,
    session_id: str,
) -> None:
    storage_content = "".join(storage_chunks).strip()
    metadata = json.dumps({"tool_events": tool_events}, ensure_ascii=False) if tool_events else None
    if not storage_content and not tool_events:
        return

    chat_service.add_message(
        session_id=session_id,
        role="assistant",
        content=storage_content,
        metadata=metadata,
    )
    logger.info("[stream][agno] 消息已保存到数据库")
    if storage_content:
        publish_ai_output_to_perception(
            storage_content,
            metadata={"mode": "agno", "session_id": session_id},
        )


def _schedule_post_stream_tasks(
    storage_chunks: list[str],
    tool_events: list[dict[str, Any]],
    chat_service: ChatService,
    session_id: str,
    user_query: str,
) -> None:
    """将流结束后的后处理（DB 写入、感知发布、偏好提取）移到后台线程，避免阻塞 HTTP 流关闭。"""

    def _bg() -> None:
        try:
            _save_and_publish(storage_chunks, tool_events, chat_service, session_id)
        except Exception:
            logger.exception("[stream][agno] 后台保存消息失败")

        storage_text = "".join(storage_chunks).strip()
        if user_query and storage_text:
            _schedule_preference_extraction(user_query, storage_text)

    threading.Thread(target=_bg, daemon=True, name="agno-post-stream").start()


def _sanitize_attachments_for_metadata(
    attachments: list[dict[str, Any]] | None,
) -> list[dict[str, Any]] | None:
    if not attachments:
        return None
    sanitized: list[dict[str, Any]] = []
    for item in attachments:
        if not isinstance(item, dict):
            continue
        sanitized.append({k: v for k, v in item.items() if k != "file_path"})
    return sanitized or None


def _has_image_attachments(attachments: list[dict[str, Any]] | None) -> bool:
    if not attachments:
        return False
    for item in attachments:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "").lower()
        mime_type = str(item.get("mime_type") or "").lower()
        if kind == "image" or mime_type.startswith("image/"):
            return True
    return False


def _build_agent_os_token_generator(
    agent_service: AgnoAgentService,
    message: ChatMessage,
    session_id: str,
    user_id: str,
    chat_service: ChatService,
    add_history_to_context: bool,
    conversation_history: list[dict[str, str]] | None,
):
    def token_generator():
        storage_chunks: list[str] = []
        storage_length = 0
        tool_events: list[dict[str, Any]] = []
        pending_chunk = ""

        try:
            for chunk in agent_service.stream_response(
                message=message.message,
                conversation_history=conversation_history if add_history_to_context else None,
                include_tool_events=True,
                session_id=session_id,
                user_id=user_id,
                attachments=message.attachments,
            ):
                if not chunk:
                    continue

                full_chunk = pending_chunk + chunk
                events, content, pending_chunk = _parse_tool_events_for_storage(
                    full_chunk,
                    storage_length,
                )
                if events:
                    tool_events.extend(events)
                if content:
                    storage_chunks.append(content)
                    storage_length += len(content)
                yield chunk

            _schedule_post_stream_tasks(
                storage_chunks,
                tool_events,
                chat_service,
                session_id,
                (message.message or "").strip(),
            )
        except Exception as e:
            logger.exception(f"[stream][agno] 生成失败: {e}")
            yield f"Agno Agent 处理失败: {e!s}"

    return token_generator()


def create_agno_streaming_response(
    message: ChatMessage,
    chat_service: ChatService,
    session_id: str,
    lang: str = "en",
) -> StreamingResponse:
    """处理 Agno 模式，使用本地 Agno Agent 进行对话"""
    logger.info(f"[stream] 进入 Agno 模式 (local), lang={lang}")

    external_tools = message.external_tools or []
    workspace_path = _resolve_workspace_path(external_tools, message.workspace_path)
    validation_error_response = _validate_workspace_or_error(workspace_path, lang, session_id)
    if validation_error_response:
        return validation_error_response

    user_id = _resolve_user_id(message.user_id, session_id)
    add_history_to_context = bool(settings.chat.enable_history)
    conversation_history = None
    if add_history_to_context:
        history_items = chat_service.get_messages(session_id, limit=20)
        conversation_history = [
            {"role": item.get("role", "user"), "content": item.get("content", "")}
            for item in history_items
            if item.get("role") in ("user", "assistant")
        ]

    user_input_for_storage = message.get_user_input_for_storage()
    attachments_metadata = _sanitize_attachments_for_metadata(message.attachments)
    metadata = (
        json.dumps({"attachments": attachments_metadata}, ensure_ascii=False)
        if attachments_metadata
        else None
    )
    chat_service.add_message(
        session_id=session_id,
        role="user",
        content=user_input_for_storage,
        metadata=metadata,
    )

    external_tools_config: dict[str, dict[str, Any]] = {}
    for tool_name in message.external_tools or []:
        if tool_name in {"file", "local_fs", "shell"} and workspace_path:
            external_tools_config[tool_name] = {
                "base_dir": workspace_path,
                "enable_delete": bool(message.enable_file_delete),
            }

    model_override = None
    if _has_image_attachments(message.attachments):
        model_override = settings.llm.vision_model or settings.llm.model
        if settings.llm.vision_model:
            logger.info("[stream][agno] 图片附件检测到，切换到视觉模型: %s", model_override)
        else:
            logger.warning("[stream][agno] 图片附件检测到，但未配置 vision_model，继续使用默认模型")

    extra_tools = []
    memory_config = settings.get("memory", {}) or {}
    if memory_config.get("enabled", True):
        _memory_tool_names = {"recall_today", "recall_date", "search_memory", "list_memory_dates"}
        selected_memory_tools = [
            t for t in (message.selected_tools or []) if t in _memory_tool_names
        ]
        if selected_memory_tools:
            extra_tools.append(MemoryToolkit(lang=lang, selected_tools=selected_memory_tools))

    agent_service = AgnoAgentService(
        lang=lang,
        selected_tools=message.selected_tools,
        external_tools=message.external_tools,
        external_tools_config=external_tools_config or None,
        model=model_override,
        extra_tools=extra_tools or None,
    )

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "X-Session-Id": session_id,
    }
    return StreamingResponse(
        _build_agent_os_token_generator(
            agent_service,
            message,
            session_id,
            user_id,
            chat_service,
            add_history_to_context,
            conversation_history,
        ),
        media_type="text/plain; charset=utf-8",
        headers=headers,
    )
