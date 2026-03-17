"""聊天核心路由：基础问答与流式聊天。"""

from fastapi import Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from lifetrace.core.dependencies import get_chat_service, get_rag_service
from lifetrace.schemas.chat import ChatMessage, ChatResponse
from lifetrace.services.chat_service import ChatService
from lifetrace.util.language import get_request_language
from lifetrace.util.time_utils import get_utc_now

from .base import _create_llm_stream_generator, logger, router
from .helpers import build_stream_messages_and_temperature, ensure_stream_session
from .modes import (
    create_agent_streaming_response,
    create_agno_streaming_response,
    create_dify_streaming_response,
    create_web_search_streaming_response,
)


@router.post("", response_model=ChatResponse)
async def chat_with_llm(
    message: ChatMessage,
    chat_service: ChatService = Depends(get_chat_service),
):
    """与LLM聊天接口 - 集成RAG功能"""
    _ = chat_service

    try:
        logger.info(f"收到聊天消息: {message.message}")

        # 使用RAG服务处理查询
        rag_service = get_rag_service()
        rag_result = await rag_service.process_query(message.message)

        if rag_result.get("success", False):
            success = True  # noqa: F841
            response = ChatResponse(
                response=rag_result["response"],
                timestamp=get_utc_now(),
                query_info=rag_result.get("query_info"),
                retrieval_info=rag_result.get("retrieval_info"),
                performance=rag_result.get("performance"),
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
    message: ChatMessage,
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
        logger.info(f"[stream] 收到聊天消息: {message.message}")

        # 解析请求语言
        lang = get_request_language(request)

        # 1. 会话初始化与聊天会话创建
        session_id = ensure_stream_session(message, chat_service)

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
            token_generator, media_type="text/event-stream", headers=headers
        )

    except Exception as e:
        logger.error(f"[stream] 聊天处理失败: {e}")
        raise HTTPException(status_code=500, detail="流式聊天处理失败") from e
