"""聊天核心路由：基础问答与流式聊天。"""

import json
import mimetypes
import uuid
from pathlib import Path as FsPath
from typing import Any

from fastapi import Depends, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from core.dependencies import get_chat_service, get_rag_service
from schemas.chat import ChatMessage, ChatResponse
from services.chat_service import ChatService
from util.language import get_request_language
from util.time_utils import get_utc_now

from .attachments import build_chat_attachment_filename, get_chat_attachments_dir
from .base import _create_llm_stream_generator, logger, publish_ai_output_to_perception, router
from .helpers import (
    build_stream_messages_and_temperature,
    ensure_stream_session,
    schedule_chat_title_update,
)
from .modes import (
    create_agent_streaming_response,
    create_agno_streaming_response,
    create_dify_streaming_response,
    create_web_search_streaming_response,
)

ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024
ATTACHMENT_MAX_COUNT = 8
ALLOWED_IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}
ALLOWED_FILE_MIME_TYPES = {
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "application/xml",
    "application/yaml",
    "application/x-yaml",
    "application/pdf",
}
ALLOWED_FILE_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".json",
    ".yaml",
    ".yml",
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
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
    ".pdf",
}


def _parse_bool(value: str | None) -> bool | None:
    if value is None:
        return None
    value = str(value).strip().lower()
    if value in {"true", "1", "yes", "y"}:
        return True
    if value in {"false", "0", "no", "n"}:
        return False
    return None


def _parse_list_field(values: list[str]) -> list[str] | None:
    if not values:
        return None
    parsed: list[str] = []
    for value in values:
        text = str(value).strip()
        if not text:
            continue
        if text.startswith("["):
            try:
                items = json.loads(text)
                if isinstance(items, list):
                    parsed.extend(str(item).strip() for item in items if str(item).strip())
                    continue
            except json.JSONDecodeError:
                pass
        parsed.extend(item.strip() for item in text.split(",") if item.strip())
    return parsed or None


def _get_upload_kind(upload: UploadFile) -> tuple[str | None, str]:
    content_type = upload.content_type or ""
    mime_type = content_type or mimetypes.guess_type(upload.filename or "")[0] or ""
    ext = FsPath(upload.filename or "").suffix.lower()

    if mime_type in ALLOWED_IMAGE_MIME_TYPES:
        return "image", mime_type
    if mime_type.startswith("text/") or mime_type in ALLOWED_FILE_MIME_TYPES:
        return "file", mime_type or "application/octet-stream"
    if ext in ALLOWED_FILE_EXTENSIONS:
        return "file", mime_type or "application/octet-stream"
    return None, mime_type or "application/octet-stream"


async def _write_upload_file(upload: UploadFile, target_path: FsPath) -> int:
    size = 0
    with target_path.open("wb") as f:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > ATTACHMENT_MAX_BYTES:
                raise HTTPException(status_code=413, detail="Attachment too large")
            f.write(chunk)
    return size


async def _save_chat_attachments(
    session_id: str, uploads: list[UploadFile]
) -> list[dict[str, Any]]:
    if not uploads:
        return []
    if len(uploads) > ATTACHMENT_MAX_COUNT:
        raise HTTPException(status_code=400, detail="Too many attachments")

    attachments_dir = get_chat_attachments_dir(session_id)
    attachments_dir.mkdir(parents=True, exist_ok=True)

    saved: list[dict[str, Any]] = []
    for upload in uploads:
        if not upload.filename:
            continue
        kind, mime_type = _get_upload_kind(upload)
        if not kind:
            raise HTTPException(status_code=400, detail="Unsupported attachment type")

        attachment_id = uuid.uuid4().hex
        storage_name = build_chat_attachment_filename(attachment_id, upload.filename)
        target_path = attachments_dir / storage_name
        file_size = await _write_upload_file(upload, target_path)

        download_url = f"/api/chat/attachments/{session_id}/{storage_name}"
        saved.append(
            {
                "id": attachment_id,
                "file_name": upload.filename,
                "file_path": str(target_path),
                "file_size": file_size,
                "mime_type": mime_type or "application/octet-stream",
                "kind": kind,
                "storage_name": storage_name,
                "download_url": download_url,
            }
        )

    return saved


async def _parse_stream_chat_request(
    request: Request,
) -> tuple[ChatMessage, list[UploadFile]]:
    content_type = (request.headers.get("content-type") or "").lower()
    if content_type.startswith("multipart/form-data"):
        form = await request.form()

        def _get_value(key: str) -> str | None:
            value = form.get(key)
            if value is None:
                return None
            if isinstance(value, UploadFile):
                return None
            return str(value)

        message_payload = {
            "message": _get_value("message") or "",
            "user_input": _get_value("user_input"),
            "context": _get_value("context"),
            "system_prompt": _get_value("system_prompt"),
            "conversation_id": _get_value("conversation_id"),
            "use_rag": _parse_bool(_get_value("use_rag")),
            "mode": _get_value("mode"),
            "selected_tools": _parse_list_field(
                [
                    str(item)
                    for item in form.getlist("selected_tools")
                    if not isinstance(item, UploadFile)
                ]
            ),
            "external_tools": _parse_list_field(
                [
                    str(item)
                    for item in form.getlist("external_tools")
                    if not isinstance(item, UploadFile)
                ]
            ),
            "workspace_path": _get_value("workspace_path"),
            "enable_file_delete": _parse_bool(_get_value("enable_file_delete")) or False,
        }
        message = ChatMessage(**{k: v for k, v in message_payload.items() if v is not None})

        uploads: list[UploadFile] = []
        for key in ("files", "images", "attachments"):
            uploads.extend([item for item in form.getlist(key) if isinstance(item, UploadFile)])

        return message, uploads

    payload = await request.json()
    message = ChatMessage(**payload)
    return message, []


async def _publish_perception_user_input(text: str) -> None:
    content = (text or "").strip()
    if not content:
        return
    try:
        from perception.manager import (  # noqa: PLC0415
            try_get_perception_manager,
        )

        mgr = try_get_perception_manager()
        if mgr is None:
            return
        await mgr.try_publish_user_input(content, metadata={"source": "chat"})
    except Exception:
        return


@router.post("", response_model=ChatResponse)
async def chat_with_llm(
    message: ChatMessage,
    chat_service: ChatService = Depends(get_chat_service),
):
    """与LLM聊天接口 - 集成RAG功能"""
    _ = chat_service

    try:
        logger.info(f"收到聊天消息: {message.message}")
        await _publish_perception_user_input(message.get_user_input_for_storage())

        # 使用RAG服务处理查询
        rag_service = get_rag_service()
        rag_result = await rag_service.process_query(message.message)

        if rag_result.get("success", False):
            response = ChatResponse(
                response=rag_result["response"],
                timestamp=get_utc_now(),
                query_info=rag_result.get("query_info"),
                retrieval_info=rag_result.get("retrieval_info"),
                performance=rag_result.get("performance"),
            )
            publish_ai_output_to_perception(
                rag_result["response"],
                metadata={"mode": "rag"},
            )

            return response
        else:
            # 如果RAG处理失败，返回错误信息
            error_msg = rag_result.get("response", "处理您的查询时出现了错误，请稍后重试。")

            return ChatResponse(
                response=error_msg,
                timestamp=get_utc_now(),
                query_info={
                    "original_query": message.message,
                    "error": rag_result.get("error"),
                },
            )

    except Exception as e:
        logger.error(f"聊天处理失败: {e}")

        return ChatResponse(
            response="抱歉，系统暂时无法处理您的请求，请稍后重试。",
            timestamp=get_utc_now(),
            query_info={"original_query": message.message, "error": str(e)},
        )


@router.post("/stream")
async def chat_with_llm_stream(
    request: Request,
    chat_service: ChatService = Depends(get_chat_service),
):
    """与LLM聊天接口（流式输出）

    支持额外的 mode 字段：
    - 默认为现有行为（走本地 LLM + RAG）
    - 当 mode == \"dify_test\" 时，走 Dify 测试通道
    - 当 mode == \"agno\" 时，走 Agno Agent 通道（支持 file/shell 等外部工具）
    """
    try:
        message, uploads = await _parse_stream_chat_request(request)

        logger.info(f"[stream] 收到聊天消息: {message.message}")
        await _publish_perception_user_input(message.get_user_input_for_storage())

        # 解析请求语言
        lang = get_request_language(request)

        # 1. 会话初始化与聊天会话创建
        session_id = ensure_stream_session(message, chat_service)

        if uploads and getattr(message, "mode", None) != "agno":
            raise HTTPException(status_code=400, detail="Attachments only supported in Agno mode")

        if uploads:
            attachments = await _save_chat_attachments(session_id, uploads)
            message.attachments = attachments

        schedule_chat_title_update(
            chat_service=chat_service,
            session_id=session_id,
            user_input=message.get_user_input_for_storage(),
            context=message.context,
            system_prompt=message.system_prompt,
        )

        # 2. Dify 测试模式（直接返回）
        if getattr(message, "mode", None) == "dify_test":
            return create_dify_streaming_response(message, chat_service, session_id)

        # 2.3. Agent 模式（工具调用框架）
        if getattr(message, "mode", None) == "agent":
            return create_agent_streaming_response(message, chat_service, session_id, lang)

        # 2.5. 联网搜索模式（直接返回，保留向后兼容）
        if getattr(message, "mode", None) == "web_search":
            return create_web_search_streaming_response(message, chat_service, session_id, lang)

        # 2.6. Agno 模式（基于 Agno 框架的 Agent，支持 file/shell 等本地工具）
        if getattr(message, "mode", None) == "agno":
            return create_agno_streaming_response(message, chat_service, session_id, lang)

        # 3. 根据 use_rag 构建 messages / temperature，并处理 RAG 失败场景
        (
            messages,
            temperature,
            user_message_to_save,
            error_response,
        ) = await build_stream_messages_and_temperature(message, session_id, lang)

        if error_response is not None:
            return error_response

        # 4. 保存用户原始输入（不含 system prompt）
        chat_service.add_message(
            session_id=session_id,
            role="user",
            content=user_message_to_save,
        )

        # 5. 调用 LLM，生成统一的流式响应
        rag_svc = get_rag_service()
        token_generator = _create_llm_stream_generator(
            rag_svc=rag_svc,
            messages=messages,
            temperature=temperature,
            chat_service=chat_service,
            meta={
                "session_id": session_id,
                "endpoint": "stream_chat",
                "feature_type": "event_assistant",
                "user_query": message.message,
            },
        )

        headers = {
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Session-Id": session_id,  # 返回 session_id 供前端使用
        }
        return StreamingResponse(
            token_generator, media_type="text/plain; charset=utf-8", headers=headers
        )

    except Exception as e:
        logger.error(f"[stream] 聊天处理失败: {e}")
        raise HTTPException(status_code=500, detail="流式聊天处理失败") from e
