"""Agent 模式处理器（工具调用框架）。"""

from fastapi.responses import StreamingResponse

from llm.agent_service import AgentService
from routers.chat.base import publish_ai_output_to_perception
from schemas.chat import ChatMessage
from services.chat_service import ChatService
from util.logging_config import get_logger

logger = get_logger()


def create_agent_streaming_response(
    message: ChatMessage,
    chat_service: ChatService,
    session_id: str,
    lang: str = "zh",
) -> StreamingResponse:
    """处理 Agent 模式，支持工具调用"""
    logger.info("[stream] 进入 Agent 模式")

    # 创建 Agent 服务
    agent_service = AgentService()

    # 获取待办上下文和用户输入
    # 优先使用新的 schema 字段，降级到老的解析方式（向后兼容）
    if message.context is not None or message.user_input is not None:
        # 新方式：使用 schema 字段
        todo_context = message.context
        user_query = message.get_user_input_for_storage()
    else:
        # 老方式：从 message 解析（向后兼容）
        todo_context = None
        user_query = message.message
        if "用户输入:" in message.message or "User input:" in message.message:
            markers = ["用户输入:", "User input:"]
            for marker in markers:
                if marker in message.message:
                    parts = message.message.split(marker, 1)
                    if len(parts) == 2:  # noqa: PLR2004
                        todo_context = parts[0].strip()
                        user_query = parts[1].strip()
                        break

    # 保存用户消息（只保存用户真正的输入，不含系统提示词和上下文）
    chat_service.add_message(
        session_id=session_id,
        role="user",
        content=user_query,
    )

    def agent_token_generator():
        total_content = ""
        try:
            # 流式生成 Agent 回答
            for chunk in agent_service.stream_agent_response(
                user_query=user_query,
                todo_context=todo_context,
                lang=lang,
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
                logger.info("[stream][agent] 消息已保存到数据库")
                publish_ai_output_to_perception(
                    total_content,
                    metadata={"mode": "agent", "session_id": session_id},
                )
        except Exception as e:
            logger.error(f"[stream][agent] 生成失败: {e}")
            yield "Agent 处理失败，请检查后端配置。"

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "X-Session-Id": session_id,
    }
    return StreamingResponse(
        agent_token_generator(), media_type="text/plain; charset=utf-8", headers=headers
    )
