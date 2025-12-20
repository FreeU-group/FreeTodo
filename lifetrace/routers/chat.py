"""聊天相关路由"""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from lifetrace.core.dependencies import get_chat_service, get_rag_service
from lifetrace.schemas.chat import (
    AddMessageRequest,
    ChatMessage,
    ChatMessageWithContext,
    ChatResponse,
    NewChatRequest,
    NewChatResponse,
    PlanQuestionnaireRequest,
    PlanSummaryRequest,
)
from lifetrace.services.chat_service import ChatService
from lifetrace.storage import todo_mgr
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()

router = APIRouter(prefix="/api/chat", tags=["chat"])


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
                timestamp=datetime.now(),
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
                timestamp=datetime.now(),
                query_info={
                    "original_query": message.message,
                    "error": rag_result.get("error"),
                },
            )

    except Exception as e:
        logger.error(f"聊天处理失败: {e}")

        return ChatResponse(
            response="抱歉，系统暂时无法处理您的请求，请稍后重试。",
            timestamp=datetime.now(),
            query_info={"original_query": message.message, "error": str(e)},
        )


@router.post("/stream")
async def chat_with_llm_stream(  # noqa: C901, PLR0915
    message: ChatMessage,
    chat_service: ChatService = Depends(get_chat_service),
):
    """与LLM聊天接口（流式输出）"""
    try:
        logger.info(
            f"[stream] 收到聊天消息: {message.message}, project_id: {message.project_id}, task_ids: {message.task_ids}"
        )

        # 确保有 session_id，如果没有则创建
        session_id = message.conversation_id
        if not session_id:
            session_id = chat_service.generate_session_id()
            logger.info(f"[stream] 创建新会话: {session_id}")

        # 检查数据库中是否存在该会话，如果不存在则创建
        chat = chat_service.get_chat_by_session_id(session_id)
        if not chat:
            # 根据是否有 project_id 判断聊天类型
            chat_type = "project" if message.project_id else "event"
            # 创建新的聊天会话
            chat_service.create_chat(
                session_id=session_id,
                chat_type=chat_type,
                title=message.message[:50] if len(message.message) > 50 else message.message,  # noqa: PLR2004
                context_id=message.project_id if message.project_id else None,
            )
            logger.info(f"[stream] 在数据库中创建会话: {session_id}, 类型: {chat_type}")

        # 根据use_rag参数决定是否使用RAG服务
        user_message_to_save = message.message  # 用于保存到数据库的原始消息

        if message.use_rag:
            # 使用RAG服务的流式处理方法，避免重复的意图识别
            rag_service = get_rag_service()
            rag_result = await rag_service.process_query_stream(
                message.message, message.project_id, message.task_ids, session_id
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
        else:
            # 不使用RAG，直接构建消息
            # 前端已经构建了完整的prompt（包含system和user消息）
            # 这里需要解析消息，检查是否包含system prompt
            full_message = message.message

            # 检查消息格式：如果包含"用户输入:"或"User input:"，说明前端已经构建了system prompt
            if "用户输入:" in full_message or "User input:" in full_message:
                # 分离system prompt和user input
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
                    # 保存时只保存用户输入部分
                    user_message_to_save = user_input
                else:
                    # 如果没有找到分隔符，将整个消息作为user消息
                    messages = [{"role": "user", "content": full_message}]
            else:
                # 普通消息，直接作为user消息
                messages = [{"role": "user", "content": full_message}]

            temperature = 0.7

        # 保存用户消息到数据库（保存原始用户输入，不包含system prompt）
        chat_service.add_message(
            session_id=session_id,
            role="user",
            content=user_message_to_save,
        )

        # 获取RAG服务（在生成器外部获取，避免重复初始化）
        rag_svc = get_rag_service()

        # 调用LLM流式API并逐块返回
        def token_generator():
            try:
                if not rag_svc.llm_client.is_available():
                    yield "抱歉，LLM服务当前不可用，请稍后重试。"
                    return

                # 使用LLM客户端进行流式生成
                response = rag_svc.llm_client.client.chat.completions.create(
                    model=rag_svc.llm_client.model,
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

                # 流式响应结束后，保存助手回复到数据库
                if total_content:
                    chat_service.add_message(
                        session_id=session_id,
                        role="assistant",
                        content=total_content,
                        token_count=usage_info.total_tokens if usage_info else None,
                        model=rag_svc.llm_client.model,
                    )
                    logger.info("[stream] 消息已保存到数据库")

                # 流式响应结束后记录token使用量
                if usage_info:
                    try:
                        from lifetrace.util.token_usage_logger import log_token_usage

                        # 根据是否有 project_id 判断是项目助手还是事件助手
                        feature_type = (
                            "project_assistant" if message.project_id else "event_assistant"
                        )

                        log_token_usage(
                            model=rag_svc.llm_client.model,
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
                        logger.info(
                            f"[stream] Token使用量已记录: input={usage_info.prompt_tokens}, output={usage_info.completion_tokens}"
                        )
                    except Exception as log_error:
                        logger.error(f"[stream] 记录token使用量失败: {log_error}")

            except Exception as e:
                logger.error(f"[stream] 生成失败: {e}")
                yield "\n[提示] 流式生成出现异常，已结束。"

        headers = {
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Session-Id": session_id,  # 返回 session_id 供前端使用
        }
        return StreamingResponse(
            token_generator(), media_type="text/plain; charset=utf-8", headers=headers
        )

    except Exception as e:
        logger.error(f"[stream] 聊天处理失败: {e}")
        raise HTTPException(status_code=500, detail="流式聊天处理失败") from e


@router.post("/stream-with-context")
async def chat_with_context_stream(  # noqa: C901, PLR0915
    message: ChatMessageWithContext,
    chat_service: ChatService = Depends(get_chat_service),
):
    """带事件上下文的流式聊天接口"""
    try:
        logger.info(
            f"[stream-with-context] 收到消息: {message.message}, 上下文事件数: {len(message.event_context or [])}"
        )

        # 确保有 session_id，如果没有则创建
        session_id = message.conversation_id
        if not session_id:
            session_id = chat_service.generate_session_id()
            logger.info(f"[stream-with-context] 创建新会话: {session_id}")

        # 检查数据库中是否存在该会话，如果不存在则创建
        chat = chat_service.get_chat_by_session_id(session_id)
        if not chat:
            # 创建新的聊天会话（事件助手类型）
            chat_service.create_chat(
                session_id=session_id,
                chat_type="event",
                title=message.message[:50] if len(message.message) > 50 else message.message,  # noqa: PLR2004
            )
            logger.info(f"[stream-with-context] 在数据库中创建会话: {session_id}")

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
        rag_service = get_rag_service()
        rag_result = await rag_service.process_query_stream(enhanced_message, session_id=session_id)

        if not rag_result.get("success", False):
            # 如果RAG处理失败，返回错误信息
            error_msg = rag_result.get("response", "处理您的查询时出现了错误，请稍后重试。")

            async def error_generator():
                yield error_msg

            return StreamingResponse(error_generator(), media_type="text/plain; charset=utf-8")

        # 获取构建好的messages和temperature
        messages = rag_result.get("messages", [])
        temperature = rag_result.get("temperature", 0.7)

        # 保存用户消息到数据库
        chat_service.add_message(
            session_id=session_id,
            role="user",
            content=message.message,
        )

        # 获取RAG服务（在生成器外部获取，避免重复初始化）
        rag_svc = get_rag_service()

        # 调用LLM流式API并逐块返回
        def token_generator():
            try:
                if not rag_svc.llm_client.is_available():
                    yield "抱歉，LLM服务当前不可用，请稍后重试。"
                    return

                # 使用LLM客户端进行流式生成
                response = rag_svc.llm_client.client.chat.completions.create(
                    model=rag_svc.llm_client.model,
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

                # 流式响应结束后，保存助手回复到数据库
                if total_content:
                    chat_service.add_message(
                        session_id=session_id,
                        role="assistant",
                        content=total_content,
                        token_count=usage_info.total_tokens if usage_info else None,
                        model=rag_svc.llm_client.model,
                    )
                    logger.info("[stream-with-context] 消息已保存到数据库")

                # 流式响应结束后记录token使用量
                if usage_info:
                    try:
                        from lifetrace.util.token_usage_logger import log_token_usage

                        log_token_usage(
                            model=rag_svc.llm_client.model,
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
                        logger.info(
                            f"[stream-with-context] Token使用量已记录: input={usage_info.prompt_tokens}, output={usage_info.completion_tokens}"
                        )
                    except Exception as log_error:
                        logger.error(f"[stream-with-context] 记录token使用量失败: {log_error}")

            except Exception as e:
                logger.error(f"[stream-with-context] 生成失败: {e}")
                yield "\n[提示] 流式生成出现异常，已结束。"

        headers = {
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Session-Id": session_id,  # 返回 session_id 供前端使用
        }
        return StreamingResponse(
            token_generator(), media_type="text/plain; charset=utf-8", headers=headers
        )

    except Exception as e:
        logger.error(f"[stream-with-context] 聊天处理失败: {e}")
        raise HTTPException(status_code=500, detail="带上下文的流式聊天处理失败") from e


@router.post("/new", response_model=NewChatResponse)
async def create_new_chat(
    request: NewChatRequest = None,
    chat_service: ChatService = Depends(get_chat_service),
):
    """创建新对话会话"""
    try:
        # 如果提供了session_id，清除其上下文；否则创建新会话
        if request and request.session_id:
            if chat_service.clear_session_context(request.session_id):
                session_id = request.session_id
                message = "会话上下文已清除"
            else:
                # 会话不存在，创建新的
                session_id = chat_service.create_new_session()
                message = "创建新对话会话"
        else:
            session_id = chat_service.create_new_session()
            message = "创建新对话会话"

        logger.info(f"新对话会话: {session_id}")
        return NewChatResponse(session_id=session_id, message=message, timestamp=datetime.now())
    except Exception as e:
        logger.error(f"创建新对话失败: {e}")
        raise HTTPException(status_code=500, detail="创建新对话失败") from e


@router.post("/session/{session_id}/message")
async def add_message_to_session(
    session_id: str,
    request: AddMessageRequest,
    chat_service: ChatService = Depends(get_chat_service),
):
    """添加消息到会话（消息已在流式聊天中自动保存，此接口保持兼容性）"""
    try:
        # 消息在流式聊天接口中已经自动保存，这里只是为了API兼容性
        # 如果需要手动保存，可以取消注释以下代码
        # chat_service.add_message(
        #     session_id=session_id,
        #     role=request.role,
        #     content=request.content,
        # )
        return {
            "success": True,
            "message": "消息已保存",
            "timestamp": datetime.now(),
        }
    except Exception as e:
        logger.error(f"保存消息失败: {e}")
        raise HTTPException(status_code=500, detail="保存消息失败") from e


@router.delete("/session/{session_id}")
async def clear_chat_session(
    session_id: str,
    chat_service: ChatService = Depends(get_chat_service),
):
    """清除指定会话的上下文"""
    try:
        success = chat_service.clear_session_context(session_id)
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
        logger.error(f"清除会话上下文失败: {e}")
        raise HTTPException(status_code=500, detail="清除会话上下文失败") from e


@router.get("/history")
async def get_chat_history(
    session_id: str | None = Query(None),
    chat_type: str | None = Query(None, description="聊天类型过滤：event, project, general"),
    chat_service: ChatService = Depends(get_chat_service),
):
    """获取聊天历史记录（从数据库读取）"""
    try:
        return chat_service.get_chat_history(session_id=session_id, chat_type=chat_type)
    except Exception as e:
        logger.error(f"获取聊天历史失败: {e}")
        raise HTTPException(status_code=500, detail="获取聊天历史失败") from e


@router.get("/suggestions")
async def get_query_suggestions(
    partial_query: str = Query("", description="部分查询文本"),
):
    """获取查询建议"""
    try:
        suggestions = get_rag_service().get_query_suggestions(partial_query)
        return {"suggestions": suggestions, "partial_query": partial_query}
    except Exception as e:
        logger.error(f"获取查询建议失败: {e}")
        raise HTTPException(status_code=500, detail="获取查询建议失败") from e


@router.get("/query-types")
async def get_supported_query_types():
    """获取支持的查询类型"""
    try:
        return get_rag_service().get_supported_query_types()
    except Exception as e:
        logger.error(f"获取查询类型失败: {e}")
        raise HTTPException(status_code=500, detail="获取查询类型失败") from e


def _format_todo_context(context: dict[str, Any]) -> str:  # noqa: C901
    """格式化任务上下文信息为易读的文本"""
    lines: list[str] = []

    # 格式化单个任务信息
    def _format_todo(todo: dict[str, Any], prefix: str = "") -> str:
        parts: list[str] = []
        parts.append(f"{prefix}- **{todo.get('name', '未知任务')}**")
        # 包含描述信息（如果存在）
        description = todo.get("description")
        if description and description.strip():
            parts.append(f"  描述: {description}")
        # 包含用户笔记（如果存在）
        user_notes = todo.get("user_notes")
        if user_notes and user_notes.strip():
            parts.append(f"  用户笔记: {user_notes}")
        if todo.get("deadline"):
            parts.append(f"  截止日期: {todo['deadline']}")
        if todo.get("priority") and todo["priority"] != "none":
            parts.append(f"  优先级: {todo['priority']}")
        if todo.get("tags"):
            parts.append(f"  标签: {', '.join(todo['tags'])}")
        if todo.get("status"):
            parts.append(f"  状态: {todo['status']}")
        return "\n".join(parts)

    # 父任务链
    parents = context.get("parents", [])
    if parents:
        lines.append("**父任务链（从直接父任务到根任务）：**")
        for i, parent in enumerate(parents):
            indent = "  " * (len(parents) - i - 1)
            lines.append(_format_todo(parent, indent))

    # 同级任务
    siblings = context.get("siblings", [])
    if siblings:
        lines.append("\n**同级任务：**")
        for sibling in siblings:
            lines.append(_format_todo(sibling, "  "))

    # 子任务（递归格式化）
    def _format_children(children: list[dict[str, Any]], depth: int = 0) -> list[str]:
        result: list[str] = []
        for child in children:
            indent = "  " * (depth + 1)
            result.append(_format_todo(child, indent))
            # 递归处理子任务的子任务
            if child.get("children"):
                result.extend(_format_children(child["children"], depth + 1))
        return result

    children = context.get("children", [])
    if children:
        lines.append("\n**子任务：**")
        lines.extend(_format_children(children))

    return "\n".join(lines) if lines else ""


@router.post("/plan/questionnaire/stream")
async def plan_questionnaire_stream(  # noqa: C901, PLR0915
    request: PlanQuestionnaireRequest,
    chat_service: ChatService = Depends(get_chat_service),
):
    """Plan功能：生成选择题（流式输出）"""
    try:
        logger.info(
            f"[plan/questionnaire] 收到请求，任务名称: {request.todo_name}, todo_id: {request.todo_id}, session_id: {request.session_id}"
        )

        # 确保有 session_id，如果没有则创建
        session_id = request.session_id
        if not session_id:
            session_id = chat_service.generate_session_id()
            logger.info(f"[plan/questionnaire] 创建新会话: {session_id}")

        # 检查数据库中是否存在该会话，如果不存在则创建
        chat = chat_service.get_chat_by_session_id(session_id)
        if not chat:
            # 创建新的聊天会话，类型为 "plan"
            chat_service.create_chat(
                session_id=session_id,
                chat_type="plan",
                title=f"规划任务: {request.todo_name}",
                context_id=request.todo_id,
            )
            logger.info(f"[plan/questionnaire] 在数据库中创建会话: {session_id}, 类型: plan")

        # 获取任务上下文（如果提供了 todo_id）
        context_info = ""
        if request.todo_id is not None:
            context = todo_mgr.get_todo_context(request.todo_id)
            if context:
                context_info = _format_todo_context(context)
                logger.info(
                    f"[plan/questionnaire] 获取到任务上下文，包含 {len(context.get('parents', []))} 个父任务, "
                    f"{len(context.get('siblings', []))} 个同级任务, {len(context.get('children', []))} 个子任务"
                )
            else:
                logger.warning(f"[plan/questionnaire] 无法获取 todo_id={request.todo_id} 的上下文")

        # 从 prompt.yaml 读取 prompt
        system_prompt = get_prompt("plan_questionnaire", "system_assistant")
        user_prompt = get_prompt(
            "plan_questionnaire",
            "user_prompt",
            todo_name=request.todo_name,
            context_info=context_info,
        )

        if not system_prompt or not user_prompt:
            raise HTTPException(status_code=500, detail="无法加载 prompt 配置，请检查 prompt.yaml")

        # 构建消息
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        # 保存用户消息到数据库（保存用户请求的任务名称和上下文信息）
        user_message_content = f"请求为任务生成选择题：{request.todo_name}"
        if context_info:
            user_message_content += f"\n\n任务上下文：\n{context_info}"
        chat_service.add_message(
            session_id=session_id,
            role="user",
            content=user_message_content,
        )

        # 获取RAG服务（在生成器外部获取，避免重复初始化）
        rag_svc = get_rag_service()

        # 调用LLM流式API并逐块返回
        def token_generator():
            try:
                if not rag_svc.llm_client.is_available():
                    yield "抱歉，LLM服务当前不可用，请稍后重试。"
                    return

                # 使用LLM客户端进行流式生成
                response = rag_svc.llm_client.client.chat.completions.create(
                    model=rag_svc.llm_client.model,
                    messages=messages,
                    temperature=0.7,
                    stream=True,
                    stream_options={"include_usage": True},
                )

                total_content = ""
                usage_info = None

                for chunk in response:
                    # 检查是否有usage信息（通常在最后一个chunk中）
                    if hasattr(chunk, "usage") and chunk.usage:
                        usage_info = chunk.usage

                    if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        total_content += content
                        yield content

                # 流式响应结束后，保存助手回复到数据库
                if total_content:
                    chat_service.add_message(
                        session_id=session_id,
                        role="assistant",
                        content=total_content,
                        token_count=usage_info.total_tokens if usage_info else None,
                        model=rag_svc.llm_client.model,
                    )
                    logger.info("[plan/questionnaire] 消息已保存到数据库")

            except Exception as e:
                logger.error(f"[plan/questionnaire] 生成失败: {e}")
                yield "\n[提示] 流式生成出现异常，已结束。"

        headers = {
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Session-Id": session_id,  # 返回 session_id 供前端使用
        }
        return StreamingResponse(
            token_generator(), media_type="text/plain; charset=utf-8", headers=headers
        )

    except Exception as e:
        logger.error(f"[plan/questionnaire] 处理失败: {e}")
        raise HTTPException(status_code=500, detail="生成选择题失败") from e


@router.post("/plan/summary/stream")
async def plan_summary_stream(  # noqa: C901
    request: PlanSummaryRequest,
    chat_service: ChatService = Depends(get_chat_service),
):
    """Plan功能：生成任务总结和子任务（流式输出）"""
    try:
        logger.info(
            f"[plan/summary] 收到请求，任务名称: {request.todo_name}, 回答数量: {len(request.answers)}, session_id: {request.session_id}"
        )

        # 确保有 session_id，如果没有则创建
        session_id = request.session_id
        if not session_id:
            session_id = chat_service.generate_session_id()
            logger.info(f"[plan/summary] 创建新会话: {session_id}")

        # 检查数据库中是否存在该会话，如果不存在则创建
        chat = chat_service.get_chat_by_session_id(session_id)
        if not chat:
            # 创建新的聊天会话，类型为 "plan"
            chat_service.create_chat(
                session_id=session_id,
                chat_type="plan",
                title=f"规划任务: {request.todo_name}",
            )
            logger.info(f"[plan/summary] 在数据库中创建会话: {session_id}, 类型: plan")

        # 构建用户回答文本
        answers_text = "\n".join(
            [
                f"问题 {question_id}: {', '.join(selected_options)}"
                for question_id, selected_options in request.answers.items()
            ]
        )

        # 处理自定义答案（移除 custom: 前缀）
        answers_text = answers_text.replace("custom:", "")

        # 从 prompt.yaml 读取 prompt
        system_prompt = get_prompt("plan_summary", "system_assistant")
        user_prompt = get_prompt(
            "plan_summary", "user_prompt", todo_name=request.todo_name, answers_text=answers_text
        )

        if not system_prompt or not user_prompt:
            raise HTTPException(status_code=500, detail="无法加载 prompt 配置，请检查 prompt.yaml")

        # 构建消息
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        # 保存用户消息到数据库（保存用户回答）
        user_message_content = (
            f"为任务生成总结和子任务：{request.todo_name}\n\n用户回答：\n{answers_text}"
        )
        chat_service.add_message(
            session_id=session_id,
            role="user",
            content=user_message_content,
        )

        # 获取RAG服务（在生成器外部获取，避免重复初始化）
        rag_svc = get_rag_service()

        # 调用LLM流式API并逐块返回
        def token_generator():
            try:
                if not rag_svc.llm_client.is_available():
                    yield "抱歉，LLM服务当前不可用，请稍后重试。"
                    return

                # 使用LLM客户端进行流式生成
                response = rag_svc.llm_client.client.chat.completions.create(
                    model=rag_svc.llm_client.model,
                    messages=messages,
                    temperature=0.7,
                    stream=True,
                    stream_options={"include_usage": True},
                )

                total_content = ""
                usage_info = None

                for chunk in response:
                    # 检查是否有usage信息（通常在最后一个chunk中）
                    if hasattr(chunk, "usage") and chunk.usage:
                        usage_info = chunk.usage

                    if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        total_content += content
                        yield content

                # 流式响应结束后，保存助手回复到数据库
                if total_content:
                    chat_service.add_message(
                        session_id=session_id,
                        role="assistant",
                        content=total_content,
                        token_count=usage_info.total_tokens if usage_info else None,
                        model=rag_svc.llm_client.model,
                    )
                    logger.info("[plan/summary] 消息已保存到数据库")

            except Exception as e:
                logger.error(f"[plan/summary] 生成失败: {e}")
                yield "\n[提示] 流式生成出现异常，已结束。"

        headers = {
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Session-Id": session_id,  # 返回 session_id 供前端使用
        }
        return StreamingResponse(
            token_generator(), media_type="text/plain; charset=utf-8", headers=headers
        )

    except Exception as e:
        logger.error(f"[plan/summary] 处理失败: {e}")
        raise HTTPException(status_code=500, detail="生成总结失败") from e
