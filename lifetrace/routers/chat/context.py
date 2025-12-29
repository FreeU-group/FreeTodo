"""带事件上下文的聊天路由。"""

from fastapi import Depends, HTTPException
from fastapi.responses import StreamingResponse

from lifetrace.core.dependencies import get_chat_service, get_rag_service
from lifetrace.schemas.chat import ChatMessageWithContext
from lifetrace.services.chat_service import ChatService

from .base import _create_llm_stream_generator, logger, router


@router.post("/stream-with-context")
async def chat_with_context_stream(
    message: ChatMessageWithContext,
    chat_service: ChatService = Depends(get_chat_service),
):
    """带事件上下文的流式聊天接口"""
    try:
        logger.info(
            f"[stream-with-context] 收到消息: {message.message}, 上下文事件数: {len(message.event_context or [])}"
        )

        # 1. 确保会话存在（事件助手类型）
        session_id = _ensure_context_stream_session(message, chat_service)

        # 2. 基于上下文构建 messages / temperature，并处理 RAG 失败场景
        (
            messages,
            temperature,
            error_response,
        ) = await _build_context_stream_messages_and_temperature(message, session_id)
        if error_response is not None:
            return error_response

        # 3. 保存用户消息到数据库
        chat_service.add_message(
            session_id=session_id,
            role="user",
            content=message.message,
        )

        # 4. 调用统一的 LLM 流式生成器
        rag_svc = get_rag_service()
        token_generator = _create_llm_stream_generator(
            rag_svc=rag_svc,
            messages=messages,
            temperature=temperature,
            chat_service=chat_service,
            meta={
                "session_id": session_id,
                "endpoint": "stream_chat_with_context",
                "feature_type": "event_assistant",
                "user_query": message.message,
                "additional_info": {
                    "context_events_count": len(message.event_context or []),
                },
            },
        )

        # 5. 返回流式响应
        headers = {
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Session-Id": session_id,  # 返回 session_id 供前端使用
        }
        return StreamingResponse(
            token_generator, media_type="text/plain; charset=utf-8", headers=headers
        )

    except Exception as e:
        logger.error(f"[stream-with-context] 聊天处理失败: {e}")
        raise HTTPException(status_code=500, detail="带上下文的流式聊天处理失败") from e


def _ensure_context_stream_session(
    message: ChatMessageWithContext,
    chat_service: ChatService,
) -> str:
    """确保带上下文的流式聊天有有效 session，并按事件助手类型创建会话。"""
    session_id = message.conversation_id or chat_service.generate_session_id()
    if not message.conversation_id:
        logger.info(f"[stream-with-context] 创建新会话: {session_id}")

    chat = chat_service.get_chat_by_session_id(session_id)
    if not chat:
        title = message.message[:50] if len(message.message) > 50 else message.message  # noqa: PLR2004
        chat_service.create_chat(
            session_id=session_id,
            chat_type="event",
            title=title,
        )
        logger.info(f"[stream-with-context] 在数据库中创建会话: {session_id}")

    return session_id


def _build_event_context_text(event_context: list[dict[str, str]] | None) -> str:
    """根据事件上下文列表构建可读文本。"""
    if not event_context:
        return ""

    context_parts = []
    for ctx in event_context:
        event_text = f"事件ID: {ctx['event_id']}\n{ctx['text']}\n"
        context_parts.append(event_text)
    return "\n---\n".join(context_parts)


async def _build_context_stream_messages_and_temperature(
    message: ChatMessageWithContext,
    session_id: str,
) -> tuple[list[dict[str, str]], float, StreamingResponse | None]:
    """基于事件上下文构建 messages / temperature，并处理 RAG 失败场景。"""
    context_text = _build_event_context_text(message.event_context)
    if context_text:
        enhanced_message = f"""用户提供了以下事件上下文（来自屏幕记录的OCR文本）：

===== 事件上下文开始 =====
{context_text}
===== 事件上下文结束 =====

用户问题：{message.message}

请基于上述事件上下文回答用户问题。"""
    else:
        enhanced_message = message.message

    rag_service = get_rag_service()
    rag_result = await rag_service.process_query_stream(enhanced_message, session_id=session_id)

    if not rag_result.get("success", False):
        error_msg = rag_result.get(
            "response",
            "处理您的查询时出现了错误，请稍后重试。",
        )

        async def error_generator():
            yield error_msg

        return (
            [],
            0.7,
            StreamingResponse(
                error_generator(),
                media_type="text/plain; charset=utf-8",
            ),
        )

    messages = rag_result.get("messages", [])
    temperature = rag_result.get("temperature", 0.7)
    return messages, temperature, None
