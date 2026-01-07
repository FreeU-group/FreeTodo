"""聊天核心路由：基础问答与流式聊天。"""

from fastapi import Depends, HTTPException
from fastapi.responses import StreamingResponse

from lifetrace.core.dependencies import get_chat_service, get_rag_service
from lifetrace.llm.agent_service import AgentService
from lifetrace.llm.web_search_service import WebSearchService
from lifetrace.schemas.chat import ChatMessage, ChatResponse
from lifetrace.services.chat_service import ChatService
from lifetrace.services.dify_client import call_dify_chat
from lifetrace.util.time_utils import get_utc_now

from .base import _create_llm_stream_generator, logger, router


@router.post("", response_model=ChatResponse)
async def chat_with_llm(
    message: ChatMessage,
    chat_service: ChatService = Depends(get_chat_service),
):
    """与LLM聊天接口 - 集成RAG功能"""

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
    chat_service: ChatService = Depends(get_chat_service),
):
    """与LLM聊天接口（流式输出）

    支持额外的 mode 字段：
    - 默认为现有行为（走本地 LLM + RAG）
    - 当 mode == \"dify_test\" 时，走 Dify 测试通道
    """
    try:
        logger.info(f"[stream] 收到聊天消息: {message.message}")

        # 1. 会话初始化与聊天会话创建
        session_id = _ensure_stream_session(message, chat_service)

        # 2. Dify 测试模式（直接返回）
        if getattr(message, "mode", None) == "dify_test":
            return _create_dify_streaming_response(message, chat_service, session_id)

        # 2.3. Agent 模式（工具调用框架）
        if getattr(message, "mode", None) == "agent":
            return _create_agent_streaming_response(message, chat_service, session_id)

        # 2.5. 联网搜索模式（直接返回，保留向后兼容）
        if getattr(message, "mode", None) == "web_search":
            return _create_web_search_streaming_response(message, chat_service, session_id)

        # 3. 根据 use_rag 构建 messages / temperature，并处理 RAG 失败场景
        (
            messages,
            temperature,
            user_message_to_save,
            error_response,
        ) = await _build_stream_messages_and_temperature(message, session_id)

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

    except Exception as e:  # noqa: BLE001
        logger.error(f"[stream] 聊天处理失败: {e}")
        raise HTTPException(status_code=500, detail="流式聊天处理失败") from e


def _ensure_stream_session(message: ChatMessage, chat_service: ChatService) -> str:
    """确保流式聊天有有效的 session，并在需要时创建数据库会话。"""
    session_id = message.conversation_id or chat_service.generate_session_id()
    if not message.conversation_id:
        logger.info(f"[stream] 创建新会话: {session_id}")

    chat = chat_service.get_chat_by_session_id(session_id)
    if not chat:
        chat_type = "event"
        title = message.message[:50] if len(message.message) > 50 else message.message  # noqa: PLR2004
        chat_service.create_chat(
            session_id=session_id,
            chat_type=chat_type,
            title=title,
        )
        logger.info(f"[stream] 在数据库中创建会话: {session_id}, 类型: {chat_type}")

    return session_id


def _create_dify_streaming_response(
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

    # 保存用户消息
    chat_service.add_message(
        session_id=session_id,
        role="user",
        content=message.message,
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
        except Exception as e:  # noqa: BLE001
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


def _create_agent_streaming_response(
    message: ChatMessage,
    chat_service: ChatService,
    session_id: str,
) -> StreamingResponse:
    """处理 Agent 模式，支持工具调用"""
    logger.info("[stream] 进入 Agent 模式")

    # 保存用户消息
    chat_service.add_message(
        session_id=session_id,
        role="user",
        content=message.message,
    )

    # 创建 Agent 服务
    agent_service = AgentService()

    # 解析待办上下文
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

    def agent_token_generator():
        total_content = ""
        try:
            # 流式生成 Agent 回答
            for chunk in agent_service.stream_agent_response(
                user_query=user_query,
                todo_context=todo_context,
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
        except Exception as e:  # noqa: BLE001
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


def _create_web_search_streaming_response(
    message: ChatMessage,
    chat_service: ChatService,
    session_id: str,
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
            for chunk in web_search_service.stream_answer_with_sources(message.message):
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
        except Exception as e:  # noqa: BLE001
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


async def _build_stream_messages_and_temperature(
    message: ChatMessage,
    session_id: str,
) -> tuple[list[dict[str, str]], float, str, StreamingResponse | None]:
    """根据 use_rag / 前端 prompt 构建 messages 与 temperature。

    返回 (messages, temperature, user_message_to_save, error_response)。
    当 RAG 失败时，error_response 不为 None，调用方应直接返回该响应。
    """
    user_message_to_save = message.message

    if message.use_rag:
        # 使用 RAG 服务的流式处理方法，避免重复的意图识别
        rag_service = get_rag_service()
        rag_result = await rag_service.process_query_stream(
            message.message,
            session_id,
        )

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
                user_message_to_save,
                StreamingResponse(
                    error_generator(),
                    media_type="text/plain; charset=utf-8",
                ),
            )

        messages = rag_result.get("messages", [])
        temperature = rag_result.get("temperature", 0.7)
        return messages, temperature, user_message_to_save, None

    # 不使用 RAG，直接构建消息，兼容前端已构建好的 system prompt
    full_message = message.message
    if "用户输入:" in full_message or "User input:" in full_message:
        if "用户输入:" in full_message:
            parts = full_message.split("用户输入:", 1)
        else:
            parts = full_message.split("User input:", 1)

        if len(parts) == 2:  # noqa: PLR2004
            system_prompt = parts[0].strip()
            user_input = parts[1].strip()
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_input},
            ]
            user_message_to_save = user_input
        else:
            messages = [{"role": "user", "content": full_message}]
    else:
        messages = [{"role": "user", "content": full_message}]

    return messages, 0.7, user_message_to_save, None
