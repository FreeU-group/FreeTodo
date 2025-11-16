"""聊天相关路由"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from fastapi.requests import Request
from fastapi.responses import StreamingResponse

from lifetrace.routers import dependencies as deps
from lifetrace.schemas.chat import (
    ChatMessage,
    ChatMessageWithContext,
    ChatResponse,
    NewChatRequest,
    NewChatResponse,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat_with_llm(message: ChatMessage, request: Request):
    """与LLM聊天接口 - 集成RAG功能"""
    start_time = datetime.now()
    session_id = None
    success = False  # noqa: F841

    try:
        deps.logger.info(f"收到聊天消息: {message.message}")

        # 获取请求信息
        user_agent = request.headers.get("user-agent", "")
        client_ip = request.client.host if request.client else "unknown"

        # 使用RAG服务处理查询
        rag_result = await deps.rag_service.process_query(message.message)

        # 计算响应时间
        response_time = (datetime.now() - start_time).total_seconds() * 1000

        if rag_result.get("success", False):
            success = True  # noqa: F841
            response = ChatResponse(
                response=rag_result["response"],
                timestamp=datetime.now(),
                query_info=rag_result.get("query_info"),
                retrieval_info=rag_result.get("retrieval_info"),
                performance=rag_result.get("performance"),
            )

            # 记录用户行为（如果behavior_tracker可用）
            if deps.behavior_tracker is not None:
                deps.behavior_tracker.track_action(
                    action_type="chat",
                    action_details={
                        "query": message.message,
                        "response_length": len(rag_result["response"]),
                        "success": True,
                    },
                    session_id=session_id,
                    user_agent=user_agent,
                    ip_address=client_ip,
                    response_time=response_time,
                )

            return response
        else:
            # 如果RAG处理失败，返回错误信息
            error_msg = rag_result.get("response", "处理您的查询时出现了错误，请稍后重试。")

            # 记录失败的用户行为（如果behavior_tracker可用）
            if deps.behavior_tracker is not None:
                deps.behavior_tracker.track_action(
                    action_type="chat",
                    action_details={
                        "query": message.message,
                        "error": rag_result.get("error"),
                        "success": False,
                    },
                    session_id=session_id,
                    user_agent=user_agent,
                    ip_address=client_ip,
                    response_time=response_time,
                )

            return ChatResponse(
                response=error_msg,
                timestamp=datetime.now(),
                query_info={
                    "original_query": message.message,
                    "error": rag_result.get("error"),
                },
            )

    except Exception as e:
        deps.logger.error(f"聊天处理失败: {e}")

        # 记录异常的用户行为（如果behavior_tracker可用）
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        if deps.behavior_tracker is not None:
            deps.behavior_tracker.track_action(
                action_type="chat",
                action_details={
                    "query": message.message,
                    "error": str(e),
                    "success": False,
                },
                session_id=session_id,
                user_agent=request.headers.get("user-agent", "") if request else "",
                ip_address=request.client.host if request and request.client else "unknown",
                response_time=response_time,
            )

        return ChatResponse(
            response="抱歉，系统暂时无法处理您的请求，请稍后重试。",
            timestamp=datetime.now(),
            query_info={"original_query": message.message, "error": str(e)},
        )


@router.post("/stream")
async def chat_with_llm_stream(message: ChatMessage):
    """与LLM聊天接口（流式输出）"""
    try:
        deps.logger.info(
            f"[stream] 收到聊天消息: {message.message}, project_id: {message.project_id}, task_ids: {message.task_ids}"
        )

        # 使用RAG服务的流式处理方法，避免重复的意图识别
        rag_result = await deps.rag_service.process_query_stream(
            message.message, message.project_id, message.task_ids
        )

        if not rag_result.get("success", False):
            # 如果RAG处理失败，返回错误信息
            error_msg = rag_result.get("response", "处理您的查询时出现了错误，请稍后重试。")

            async def error_generator():
                yield error_msg

            return StreamingResponse(error_generator(), media_type="text/plain; charset=utf-8")

        # 获取构建好的messages和temperature
        messages = rag_result.get("messages", [])
        temperature = rag_result.get("temperature", 0.7)

        # 3) 调用LLM流式API并逐块返回
        def token_generator():
            try:
                if not deps.rag_service.llm_client.is_available():
                    yield "抱歉，LLM服务当前不可用，请稍后重试。"
                    return

                # 使用LLM客户端进行流式生成
                response = deps.rag_service.llm_client.client.chat.completions.create(
                    model=deps.rag_service.llm_client.model,
                    messages=messages,
                    temperature=temperature,
                    stream=True,
                    stream_options={"include_usage": True},  # 请求包含usage信息
                )

                total_content = ""
                usage_info = None

                for chunk in response:
                    # 检查是否有usage信息（通常在最后一个chunk中）
                    if hasattr(chunk, "usage") and chunk.usage:
                        usage_info = chunk.usage

                    # 检查choices是否存在且不为空
                    if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        total_content += content
                        yield content

                # 流式响应结束后记录token使用量
                if usage_info:
                    try:
                        from lifetrace.util.token_usage_logger import log_token_usage

                        # 根据是否有 project_id 判断是项目助手还是事件助手
                        feature_type = (
                            "project_assistant" if message.project_id else "event_assistant"
                        )

                        log_token_usage(
                            model=deps.rag_service.llm_client.model,
                            input_tokens=usage_info.prompt_tokens,
                            output_tokens=usage_info.completion_tokens,
                            endpoint="stream_chat",
                            user_query=message.message,
                            response_type="stream",
                            feature_type=feature_type,
                            additional_info={
                                "total_tokens": usage_info.total_tokens,
                                "temperature": temperature,
                                "response_length": len(total_content),
                                "project_id": message.project_id,
                                "task_ids": message.task_ids,
                                "selected_tasks_count": len(message.task_ids)
                                if message.task_ids
                                else 0,
                            },
                        )
                        deps.logger.info(
                            f"[stream] Token使用量已记录: input={usage_info.prompt_tokens}, output={usage_info.completion_tokens}"
                        )
                    except Exception as log_error:
                        deps.logger.error(f"[stream] 记录token使用量失败: {log_error}")

            except Exception as e:
                deps.logger.error(f"[stream] 生成失败: {e}")
                yield "\n[提示] 流式生成出现异常，已结束。"

        headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
        return StreamingResponse(
            token_generator(), media_type="text/plain; charset=utf-8", headers=headers
        )

    except Exception as e:
        deps.logger.error(f"[stream] 聊天处理失败: {e}")
        raise HTTPException(status_code=500, detail="流式聊天处理失败") from e


@router.post("/stream-with-context")
async def chat_with_context_stream(message: ChatMessageWithContext):
    """带事件上下文的流式聊天接口"""
    try:
        deps.logger.info(
            f"[stream-with-context] 收到消息: {message.message}, 上下文事件数: {len(message.event_context or [])}"
        )

        # 构建上下文文本
        context_text = ""
        if message.event_context:
            context_parts = []
            for ctx in message.event_context:
                event_text = f"事件ID: {ctx['event_id']}\n{ctx['text']}\n"
                context_parts.append(event_text)
            context_text = "\n---\n".join(context_parts)

        # 构建带上下文的prompt
        if context_text:
            enhanced_message = f"""用户提供了以下事件上下文（来自屏幕记录的OCR文本）：

===== 事件上下文开始 =====
{context_text}
===== 事件上下文结束 =====

用户问题：{message.message}

请基于上述事件上下文回答用户问题。"""
        else:
            enhanced_message = message.message

        # 使用RAG服务的流式处理方法
        rag_result = await deps.rag_service.process_query_stream(enhanced_message)

        if not rag_result.get("success", False):
            # 如果RAG处理失败，返回错误信息
            error_msg = rag_result.get("response", "处理您的查询时出现了错误，请稍后重试。")

            async def error_generator():
                yield error_msg

            return StreamingResponse(error_generator(), media_type="text/plain; charset=utf-8")

        # 获取构建好的messages和temperature
        messages = rag_result.get("messages", [])
        temperature = rag_result.get("temperature", 0.7)

        # 调用LLM流式API并逐块返回
        def token_generator():
            try:
                if not deps.rag_service.llm_client.is_available():
                    yield "抱歉，LLM服务当前不可用，请稍后重试。"
                    return

                # 使用LLM客户端进行流式生成
                response = deps.rag_service.llm_client.client.chat.completions.create(
                    model=deps.rag_service.llm_client.model,
                    messages=messages,
                    temperature=temperature,
                    stream=True,
                    stream_options={"include_usage": True},  # 请求包含usage信息
                )

                total_content = ""
                usage_info = None

                for chunk in response:
                    # 检查是否有usage信息（通常在最后一个chunk中）
                    if hasattr(chunk, "usage") and chunk.usage:
                        usage_info = chunk.usage

                    # 检查choices是否存在且不为空
                    if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        total_content += content
                        yield content

                # 流式响应结束后记录token使用量
                if usage_info:
                    try:
                        from lifetrace.util.token_usage_logger import log_token_usage

                        log_token_usage(
                            model=deps.rag_service.llm_client.model,
                            input_tokens=usage_info.prompt_tokens,
                            output_tokens=usage_info.completion_tokens,
                            endpoint="stream_chat_with_context",
                            user_query=message.message,
                            response_type="stream",
                            feature_type="event_assistant",
                            additional_info={
                                "total_tokens": usage_info.total_tokens,
                                "temperature": temperature,
                                "response_length": len(total_content),
                                "context_events_count": len(message.event_context or []),
                            },
                        )
                        deps.logger.info(
                            f"[stream-with-context] Token使用量已记录: input={usage_info.prompt_tokens}, output={usage_info.completion_tokens}"
                        )
                    except Exception as log_error:
                        deps.logger.error(f"[stream-with-context] 记录token使用量失败: {log_error}")

            except Exception as e:
                deps.logger.error(f"[stream-with-context] 生成失败: {e}")
                yield "\n[提示] 流式生成出现异常，已结束。"

        headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
        return StreamingResponse(
            token_generator(), media_type="text/plain; charset=utf-8", headers=headers
        )

    except Exception as e:
        deps.logger.error(f"[stream-with-context] 聊天处理失败: {e}")
        raise HTTPException(status_code=500, detail="带上下文的流式聊天处理失败") from e


@router.post("/new", response_model=NewChatResponse)
async def create_new_chat(request: NewChatRequest = None):
    """创建新对话会话"""
    try:
        # 如果提供了session_id，清除其上下文；否则创建新会话
        if request and request.session_id:
            if deps.clear_session_context(request.session_id):
                session_id = request.session_id
                message = "会话上下文已清除"
            else:
                # 会话不存在，创建新的
                session_id = deps.create_new_session()
                message = "创建新对话会话"
        else:
            session_id = deps.create_new_session()
            message = "创建新对话会话"

        deps.logger.info(f"新对话会话: {session_id}")
        return NewChatResponse(session_id=session_id, message=message, timestamp=datetime.now())
    except Exception as e:
        deps.logger.error(f"创建新对话失败: {e}")
        raise HTTPException(status_code=500, detail="创建新对话失败") from e


@router.delete("/session/{session_id}")
async def clear_chat_session(session_id: str):
    """清除指定会话的上下文"""
    try:
        success = deps.clear_session_context(session_id)
        if success:
            return {
                "success": True,
                "message": f"会话 {session_id} 的上下文已清除",
                "timestamp": datetime.now(),
            }
        else:
            raise HTTPException(status_code=404, detail="会话不存在")
    except HTTPException:
        raise
    except Exception as e:
        deps.logger.error(f"清除会话上下文失败: {e}")
        raise HTTPException(status_code=500, detail="清除会话上下文失败") from e


@router.get("/history")
async def get_chat_history(session_id: str | None = Query(None)):
    """获取聊天历史记录"""
    try:
        if session_id:
            # 返回指定会话的历史记录
            context = deps.get_session_context(session_id)
            return {
                "session_id": session_id,
                "history": context,
                "message": f"会话 {session_id} 的历史记录",
            }
        else:
            # 返回所有会话的摘要信息
            sessions_info = []
            for sid, session_data in deps.chat_sessions.items():
                sessions_info.append(
                    {
                        "session_id": sid,
                        "created_at": session_data["created_at"],
                        "last_active": session_data["last_active"],
                        "message_count": len(session_data["context"]),
                    }
                )
            return {"sessions": sessions_info, "message": "所有会话摘要"}
    except Exception as e:
        deps.logger.error(f"获取聊天历史失败: {e}")
        raise HTTPException(status_code=500, detail="获取聊天历史失败") from e


@router.get("/suggestions")
async def get_query_suggestions(
    partial_query: str = Query("", description="部分查询文本"),
):
    """获取查询建议"""
    try:
        suggestions = deps.rag_service.get_query_suggestions(partial_query)
        return {"suggestions": suggestions, "partial_query": partial_query}
    except Exception as e:
        deps.logger.error(f"获取查询建议失败: {e}")
        raise HTTPException(status_code=500, detail="获取查询建议失败") from e


@router.get("/query-types")
async def get_supported_query_types():
    """获取支持的查询类型"""
    try:
        return deps.rag_service.get_supported_query_types()
    except Exception as e:
        deps.logger.error(f"获取查询类型失败: {e}")
        raise HTTPException(status_code=500, detail="获取查询类型失败") from e
