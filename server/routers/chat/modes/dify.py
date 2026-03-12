"""Dify 测试模式处理器。"""

from fastapi.responses import StreamingResponse

from routers.chat.base import publish_ai_output_to_perception
from schemas.chat import ChatMessage
from services.chat_service import ChatService
from services.dify_client import call_dify_chat
from util.logging_config import get_logger

logger = get_logger()


def create_dify_streaming_response(
    message: ChatMessage,
    chat_service: ChatService,
    session_id: str,
) -> StreamingResponse:
    """处理 Dify 测试模式，使用真正的流式输出。

    从 message 对象中提取 Dify 相关参数：
    - dify_response_mode: 响应模式（streaming/blocking），默认 streaming
    - dify_user: 用户标识，默认 lifetrace-user
    - dify_inputs: Dify 输入变量字典
    - 其他以 dify_ 开头的字段会作为额外参数传递给 Dify API
    """
    logger.info("[stream] 进入 Dify 测试模式")

    # 保存用户消息（只保存用户真正输入的内容，不含系统提示词和上下文）
    chat_service.add_message(
        session_id=session_id,
        role="user",
        content=message.get_user_input_for_storage(),
    )

    # 从 message 中提取 Dify 相关参数
    message_dict = message.model_dump(exclude={"message", "conversation_id", "use_rag", "mode"})

    # 提取 Dify 特定参数
    response_mode = message_dict.pop("dify_response_mode", "streaming")
    user = message_dict.pop("dify_user", None)
    inputs = message_dict.pop("dify_inputs", None)

    # 构建额外的 payload 参数（移除 dify_ 前缀）
    extra_payload = {}
    for key, value in list(message_dict.items()):
        if key.startswith("dify_"):
            # 移除 dify_ 前缀，将剩余的键名作为 payload 参数
            payload_key = key[5:]  # 移除 "dify_" 前缀
            extra_payload[payload_key] = value

    def dify_token_generator():
        total_content = ""
        try:
            # 调用 call_dify_chat，传递所有可配置的参数
            for chunk in call_dify_chat(
                message=message.message,
                user=user,
                response_mode=response_mode,
                inputs=inputs,
                **extra_payload,
            ):
                total_content += chunk
                yield chunk

            # 保存完整的助手回复
            if total_content:
                chat_service.add_message(
                    session_id=session_id,
                    role="assistant",
                    content=total_content,
                )
                logger.info("[stream][dify] 消息已保存到数据库")
                publish_ai_output_to_perception(
                    total_content,
                    metadata={"mode": "dify", "session_id": session_id},
                )
        except Exception as e:
            logger.error(f"[stream][dify] 生成失败: {e}")
            yield "Dify 测试模式调用失败，请检查后端 Dify 配置。"

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "X-Session-Id": session_id,
    }
    return StreamingResponse(
        dify_token_generator(), media_type="text/plain; charset=utf-8", headers=headers
    )
