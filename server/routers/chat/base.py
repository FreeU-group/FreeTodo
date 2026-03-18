"""聊天路由基础设施：共享 router 与通用工具函数。"""

import asyncio
from typing import Any, TypedDict

from fastapi import APIRouter

from services.chat_service import ChatService
from util.logging_config import get_logger
from util.token_usage_logger import log_token_usage

logger = get_logger()


async def _try_extract_and_save_preferences(
    user_message: str,
    ai_response: str,
) -> None:
    """Fire-and-forget: detect preferences in chat and update user profile."""
    try:
        from memory.manager import try_get_memory_manager  # noqa: PLC0415
        from services.preference_extractor import extract_preferences  # noqa: PLC0415

        mgr = try_get_memory_manager()
        if mgr is None or mgr.profile_builder is None:
            return
        llm = mgr.profile_builder._llm
        model = mgr.profile_builder._model

        items = await extract_preferences(user_message, ai_response, llm, model)
        if items:
            mgr.profile_builder.update_preferences(items)
    except Exception:
        logger.debug("Preference extraction background task failed", exc_info=True)


def _schedule_preference_extraction(user_query: str, ai_response: str) -> None:
    """Schedule preference extraction from a synchronous context (generator thread)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(
                _try_extract_and_save_preferences(user_query, ai_response),
                loop,
            )
        else:
            loop.run_until_complete(_try_extract_and_save_preferences(user_query, ai_response))
    except Exception:
        logger.debug("Failed to schedule preference extraction", exc_info=True)


def publish_ai_output_to_perception(
    text: str,
    *,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Best-effort publish AI output to the perception stream (sync, threadsafe)."""
    content = (text or "").strip()
    if not content:
        return
    try:
        from perception.manager import try_get_perception_manager  # noqa: PLC0415

        mgr = try_get_perception_manager()
        if mgr is None:
            return
        mgr.try_publish_ai_output_threadsafe(content, metadata=metadata)
    except Exception:
        logger.exception("Failed to publish AI output to perception")


router = APIRouter(prefix="/api/chat", tags=["chat"])


class StreamMeta(TypedDict, total=False):
    """统一封装流式聊天的上下文字段，减少函数参数数量。"""

    session_id: str
    endpoint: str
    feature_type: str
    user_query: str
    additional_info: dict[str, Any]


def _finalize_stream(
    *,
    total_content: str,
    usage_info,
    rag_svc,
    temperature: float,
    chat_service: ChatService,
    meta: StreamMeta,
) -> None:
    """Save message, publish to perception, extract preferences, log token usage."""
    if total_content:
        session_id = meta.get("session_id")
        if session_id:
            chat_service.add_message(
                session_id=session_id,
                role="assistant",
                content=total_content,
                token_count=usage_info.total_tokens if usage_info else None,
                model=rag_svc.llm_client.model,
            )
            logger.info("[stream] 消息已保存到数据库")
        publish_ai_output_to_perception(
            total_content,
            metadata={
                "mode": meta.get("feature_type", "stream_chat"),
                "session_id": meta.get("session_id"),
            },
        )
        user_query = meta.get("user_query", "")
        if user_query:
            _schedule_preference_extraction(user_query, total_content)

    if usage_info:
        _log_stream_token_usage(
            rag_svc=rag_svc,
            usage_info=usage_info,
            temperature=temperature,
            total_content=total_content,
            session_id=meta.get("session_id"),
            meta=meta,
        )


def _create_llm_stream_generator(
    *,
    rag_svc,
    messages: list[dict[str, str]],
    temperature: float,
    chat_service: ChatService,
    meta: StreamMeta,
):
    """构造统一的 LLM 流式生成器，并负责保存消息与记录 token 使用量。"""

    def token_generator():
        try:
            if not rag_svc.llm_client.is_available():
                yield "抱歉，LLM服务当前不可用，请稍后重试。"
                return

            response = rag_svc.llm_client.client.chat.completions.create(
                model=rag_svc.llm_client.model,
                messages=messages,
                temperature=temperature,
                stream=True,
                stream_options={"include_usage": True},
            )

            total_content = ""
            usage_info = None

            for chunk in response:
                if hasattr(chunk, "usage") and chunk.usage:
                    usage_info = chunk.usage

                if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    total_content += content
                    yield content

            _finalize_stream(
                total_content=total_content,
                usage_info=usage_info,
                rag_svc=rag_svc,
                temperature=temperature,
                chat_service=chat_service,
                meta=meta,
            )
        except Exception as e:
            logger.error(f"[stream] 生成失败: {e}")
            yield "\n[提示] 流式生成出现异常，已结束。"

    return token_generator()


def _log_stream_token_usage(
    *,
    rag_svc,
    usage_info,
    temperature: float,
    total_content: str,
    session_id: str | None,
    meta: StreamMeta,
) -> None:
    """记录流式聊天的 token 使用量，抽离成独立函数以降低主流程复杂度。"""
    try:
        base_additional_info: dict[str, Any] = {
            "total_tokens": usage_info.total_tokens,
            "temperature": temperature,
            "response_length": len(total_content),
        }
        if session_id:
            base_additional_info["session_id"] = session_id
        additional_info = meta.get("additional_info")
        if additional_info:
            base_additional_info.update(additional_info)

        endpoint = meta.get("endpoint", "")
        feature_type = meta.get("feature_type", "")
        user_query = meta.get("user_query", "")

        log_token_usage(
            model=rag_svc.llm_client.model,
            input_tokens=usage_info.prompt_tokens,
            output_tokens=usage_info.completion_tokens,
            endpoint=endpoint,
            user_query=user_query,
            response_type="stream",
            feature_type=feature_type,
            additional_info=base_additional_info,
        )
        logger.info(
            f"[stream] Token使用量已记录: input={usage_info.prompt_tokens}, output={usage_info.completion_tokens}"
        )
    except Exception as log_error:
        logger.error(f"[stream] 记录token使用量失败: {log_error}")
