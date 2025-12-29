"""聊天路由基础设施：共享 router 与通用工具函数。"""

from typing import Any, TypedDict

from fastapi import APIRouter

from lifetrace.services.chat_service import ChatService
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/chat", tags=["chat"])


class StreamMeta(TypedDict, total=False):
    """统一封装流式聊天的上下文字段，减少函数参数数量。"""

    session_id: str
    endpoint: str
    feature_type: str
    user_query: str
    additional_info: dict[str, Any]


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

            if total_content:
                session_id = meta.get("session_id")
                chat_service.add_message(
                    session_id=session_id,
                    role="assistant",
                    content=total_content,
                    token_count=usage_info.total_tokens if usage_info else None,
                    model=rag_svc.llm_client.model,
                )
                logger.info("[stream] 消息已保存到数据库")

            if usage_info:
                session_id = meta.get("session_id")
                _log_stream_token_usage(
                    rag_svc=rag_svc,
                    usage_info=usage_info,
                    temperature=temperature,
                    total_content=total_content,
                    session_id=session_id,
                    meta=meta,
                )
        except Exception as e:  # noqa: BLE001
            logger.error(f"[stream] 生成失败: {e}")
            yield "\n[提示] 流式生成出现异常，已结束。"

    return token_generator()


def _log_stream_token_usage(
    *,
    rag_svc,
    usage_info,
    temperature: float,
    total_content: str,
    session_id: str,
    meta: StreamMeta,
) -> None:
    """记录流式聊天的 token 使用量，抽离成独立函数以降低主流程复杂度。"""
    try:
        from lifetrace.util.token_usage_logger import log_token_usage

        base_additional_info: dict[str, Any] = {
            "total_tokens": usage_info.total_tokens,
            "temperature": temperature,
            "response_length": len(total_content),
            "session_id": session_id,
        }
        if meta.get("additional_info"):
            base_additional_info.update(meta["additional_info"])

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
    except Exception as log_error:  # noqa: BLE001
        logger.error(f"[stream] 记录token使用量失败: {log_error}")
