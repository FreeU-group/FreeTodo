"""联网搜索模式处理器。"""

from fastapi.responses import StreamingResponse

from llm.web_search_service import WebSearchService
from routers.chat.base import publish_ai_output_to_perception
from schemas.chat import ChatMessage
from services.chat_service import ChatService
from util.logging_config import get_logger

logger = get_logger()


def create_web_search_streaming_response(
    message: ChatMessage,
    chat_service: ChatService,
    session_id: str,
    lang: str = "zh",
) -> StreamingResponse:
    """处理联网搜索模式，使用 Tavily 搜索和 LLM 生成流式输出"""
    logger.info("[stream] 进入联网搜索模式")

    # 保存用户消息
    chat_service.add_message(
        session_id=session_id,
        role="user",
        content=message.message,
    )

    # 创建联网搜索服务实例
    web_search_service = WebSearchService()

    def web_search_token_generator():
        total_content = ""
        try:
            # 调用联网搜索服务，流式生成回答
            for chunk in web_search_service.stream_answer_with_sources(message.message, lang=lang):
                total_content += chunk
                yield chunk

            # 保存完整的助手回复
            if total_content:
                chat_service.add_message(
                    session_id=session_id,
                    role="assistant",
                    content=total_content,
                )
                logger.info("[stream][web_search] 消息已保存到数据库")
                publish_ai_output_to_perception(
                    total_content,
                    metadata={"mode": "web_search", "session_id": session_id},
                )
        except Exception as e:
            logger.error(f"[stream][web_search] 生成失败: {e}")
            yield "联网搜索处理失败，请检查后端配置。"

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "X-Session-Id": session_id,
    }
    return StreamingResponse(
        web_search_token_generator(), media_type="text/plain; charset=utf-8", headers=headers
    )
