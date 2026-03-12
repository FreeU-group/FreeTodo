"""Agno 模式处理器（基于 Agno AgentOS）。"""

import json
from typing import Any

from agno.agent import RunEvent
from fastapi.responses import StreamingResponse

from llm.agno_agent import RESULT_PREVIEW_MAX_LENGTH, TOOL_EVENT_PREFIX, TOOL_EVENT_SUFFIX
from routers.chat.base import publish_ai_output_to_perception
from schemas.chat import ChatMessage
from services.agent_os_client import AgentOSClient
from services.chat_service import ChatService
from util.logging_config import get_logger
from util.settings import settings

from ..helpers import make_error_streaming_response, validate_workspace_path

logger = get_logger()


def _format_tool_event(event_data: dict[str, Any]) -> str:
    return f"{TOOL_EVENT_PREFIX}{json.dumps(event_data, ensure_ascii=False)}{TOOL_EVENT_SUFFIX}"


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


def _normalize_content(content: Any) -> str | None:
    if content is None:
        return None
    if isinstance(content, str):
        return content
    if isinstance(content, dict | list):
        return json.dumps(content, ensure_ascii=False)
    return str(content)


def _result_preview(value: Any) -> str:
    result_str = str(value)
    if len(result_str) > RESULT_PREVIEW_MAX_LENGTH:
        return f"{result_str[:RESULT_PREVIEW_MAX_LENGTH]}..."
    return result_str


def _build_tool_event(event_type: str, data: dict[str, Any]) -> dict[str, Any] | None:
    if event_type == RunEvent.run_started.value:
        return {"type": "run_started"}
    if event_type == RunEvent.run_completed.value:
        return {"type": "run_completed"}

    if event_type == RunEvent.memory_update_completed.value:
        memories = data.get("memories")
        if not memories:
            return None
        normalized = [str(item) for item in memories]
        return {"type": "memory_saved", "memories": normalized}

    tool_info = data.get("tool")
    if not isinstance(tool_info, dict):
        tool_info = {}
    tool_name = tool_info.get("tool_name") or "unknown"

    event_data: dict[str, Any] | None = None
    if event_type == RunEvent.tool_call_started.value:
        event_data = {
            "type": "tool_call_start",
            "tool_name": tool_name,
            "tool_args": tool_info.get("tool_args") or {},
        }
    elif event_type == RunEvent.tool_call_completed.value:
        event_data = {
            "type": "tool_call_end",
            "tool_name": tool_name,
            "result_preview": _result_preview(tool_info.get("result", "")),
        }
    elif event_type == RunEvent.tool_call_error.value:
        error = (
            data.get("error")
            or tool_info.get("error")
            or tool_info.get("result")
            or "Unknown error"
        )
        event_data = {
            "type": "tool_call_end",
            "tool_name": tool_name,
            "result_preview": f"[Error] {_result_preview(error)}",
            "error": True,
        }

    return event_data


def _build_agent_os_dependencies(
    message: ChatMessage,
    workspace_path: str | None,
) -> dict[str, Any]:
    return {
        "selected_tools": message.selected_tools or [],
        "external_tools": message.external_tools or [],
        "workspace_path": workspace_path,
        "enable_file_delete": bool(message.enable_file_delete),
    }


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


def _build_agent_os_token_generator(
    agent_os_client: AgentOSClient,
    message: ChatMessage,
    session_id: str,
    user_id: str,
    dependencies: dict[str, Any],
    chat_service: ChatService,
    add_history_to_context: bool,
):
    def token_generator():
        storage_chunks: list[str] = []
        tool_events: list[dict[str, Any]] = []

        try:
            for event_type, payload in agent_os_client.stream_run_events(
                message=message.message,
                session_id=session_id,
                user_id=user_id,
                dependencies=dependencies,
                add_history_to_context=add_history_to_context,
            ):
                if not event_type or not payload:
                    continue

                payload_dict: dict[str, Any] = payload

                if event_type in (
                    RunEvent.run_content.value,
                    RunEvent.run_intermediate_content.value,
                ):
                    content = _normalize_content(payload_dict.get("content"))
                    if content:
                        storage_chunks.append(content)
                        yield content
                    continue

                if event_type == RunEvent.run_error.value:
                    error_msg = (
                        payload_dict.get("content") or payload_dict.get("error") or "Unknown error"
                    )
                    logger.error(f"[stream][agno] AgentOS error: {error_msg}")
                    yield f"Agno Agent 处理失败: {error_msg}"
                    return

                tool_event = _build_tool_event(event_type, payload_dict)
                if tool_event:
                    tool_events.append(tool_event)
                    yield _format_tool_event(tool_event)

            _save_and_publish(storage_chunks, tool_events, chat_service, session_id)
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
    """处理 Agno 模式，使用 Agno AgentOS 进行对话"""
    logger.info(f"[stream] 进入 Agno 模式 (AgentOS), lang={lang}")

    external_tools = message.external_tools or []
    workspace_path = _resolve_workspace_path(external_tools, message.workspace_path)
    validation_error_response = _validate_workspace_or_error(workspace_path, lang, session_id)
    if validation_error_response:
        return validation_error_response

    user_id = _resolve_user_id(message.user_id, session_id)
    user_input_for_storage = message.get_user_input_for_storage()

    chat_service.add_message(
        session_id=session_id,
        role="user",
        content=user_input_for_storage,
    )

    dependencies = _build_agent_os_dependencies(message, workspace_path)
    add_history_to_context = bool(settings.chat.enable_history)
    agent_os_client = AgentOSClient.from_settings()

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "X-Session-Id": session_id,
    }
    return StreamingResponse(
        _build_agent_os_token_generator(
            agent_os_client,
            message,
            session_id,
            user_id,
            dependencies,
            chat_service,
            add_history_to_context,
        ),
        media_type="text/plain; charset=utf-8",
        headers=headers,
    )
