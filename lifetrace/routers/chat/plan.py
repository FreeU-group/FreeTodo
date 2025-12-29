"""Plan 相关聊天路由：任务问卷与任务总结。"""

from typing import Any

from fastapi import Depends, HTTPException
from fastapi.responses import StreamingResponse

from lifetrace.core.dependencies import get_chat_service, get_rag_service
from lifetrace.schemas.chat import PlanQuestionnaireRequest, PlanSummaryRequest
from lifetrace.services.chat_service import ChatService
from lifetrace.storage import todo_mgr
from lifetrace.util.prompt_loader import get_prompt

from .base import _create_llm_stream_generator, logger, router


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
async def plan_questionnaire_stream(
    request: PlanQuestionnaireRequest,
    chat_service: ChatService = Depends(get_chat_service),
):
    """Plan功能：生成选择题（流式输出）"""
    try:
        logger.info(
            f"[plan/questionnaire] 收到请求，任务名称: {request.todo_name}, todo_id: {request.todo_id}, session_id: {request.session_id}"
        )

        # 1. 确保 plan 会话存在
        session_id = _ensure_plan_session(
            session_id=request.session_id,
            chat_service=chat_service,
            todo_name=request.todo_name,
            context_id=request.todo_id,
        )

        # 2. 构建任务上下文与 prompt
        messages, context_info = _build_plan_questionnaire_prompts(request)

        # 3. 保存用户消息到数据库（保存用户请求的任务名称和上下文信息）
        user_message_content = f"请求为任务生成选择题：{request.todo_name}"
        if context_info:
            user_message_content += f"\n\n任务上下文：\n{context_info}"
        chat_service.add_message(
            session_id=session_id,
            role="user",
            content=user_message_content,
        )

        # 4. 使用统一的 LLM 流式生成器
        rag_svc = get_rag_service()
        token_generator = _create_llm_stream_generator(
            rag_svc=rag_svc,
            messages=messages,
            temperature=0.7,
            chat_service=chat_service,
            meta={
                "session_id": session_id,
                "endpoint": "plan_questionnaire_stream",
                "feature_type": "plan_assistant",
                "user_query": request.todo_name,
                "additional_info": {
                    "todo_id": request.todo_id,
                    "has_context": bool(context_info),
                },
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

    except Exception as e:
        logger.error(f"[plan/questionnaire] 处理失败: {e}")
        raise HTTPException(status_code=500, detail="生成选择题失败") from e


def _ensure_plan_session(
    *,
    session_id: str | None,
    chat_service: ChatService,
    todo_name: str,
    context_id: int | None = None,
) -> str:
    """确保 plan 相关会话存在，并在需要时创建。"""
    final_session_id = session_id or chat_service.generate_session_id()
    if not session_id:
        logger.info(f"[plan] 创建新会话: {final_session_id}")

    chat = chat_service.get_chat_by_session_id(final_session_id)
    if not chat:
        chat_service.create_chat(
            session_id=final_session_id,
            chat_type="plan",
            title=f"规划任务: {todo_name}",
            context_id=context_id,
        )
        logger.info(f"[plan] 在数据库中创建会话: {final_session_id}, 类型: plan")

    return final_session_id


def _build_plan_questionnaire_prompts(
    request: PlanQuestionnaireRequest,
) -> tuple[list[dict[str, str]], str]:
    """构建 Plan 问卷的上下文与 prompts。"""
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

    system_prompt = get_prompt("plan_questionnaire", "system_assistant")
    user_prompt = get_prompt(
        "plan_questionnaire",
        "user_prompt",
        todo_name=request.todo_name,
        context_info=context_info,
    )

    if not system_prompt or not user_prompt:
        raise HTTPException(status_code=500, detail="无法加载 prompt 配置，请检查 prompt.yaml")

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    return messages, context_info


@router.post("/plan/summary/stream")
async def plan_summary_stream(
    request: PlanSummaryRequest,
    chat_service: ChatService = Depends(get_chat_service),
):
    """Plan功能：生成任务总结和子任务（流式输出）"""
    try:
        logger.info(
            f"[plan/summary] 收到请求，任务名称: {request.todo_name}, 回答数量: {len(request.answers)}, session_id: {request.session_id}"
        )

        # 1. 确保 plan 会话存在
        session_id = _ensure_plan_session(
            session_id=request.session_id,
            chat_service=chat_service,
            todo_name=request.todo_name,
        )

        # 2. 构建回答文本与 prompt
        messages, answers_text = _build_plan_summary_prompts(request)

        # 3. 保存用户消息到数据库（保存用户回答）
        user_message_content = (
            f"为任务生成总结和子任务：{request.todo_name}\n\n用户回答：\n{answers_text}"
        )
        chat_service.add_message(
            session_id=session_id,
            role="user",
            content=user_message_content,
        )

        # 4. 使用统一的 LLM 流式生成器
        rag_svc = get_rag_service()
        token_generator = _create_llm_stream_generator(
            rag_svc=rag_svc,
            messages=messages,
            temperature=0.7,
            chat_service=chat_service,
            meta={
                "session_id": session_id,
                "endpoint": "plan_summary_stream",
                "feature_type": "plan_assistant",
                "user_query": request.todo_name,
                "additional_info": {
                    "answers_count": len(request.answers),
                },
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

    except Exception as e:
        logger.error(f"[plan/summary] 处理失败: {e}")
        raise HTTPException(status_code=500, detail="生成总结失败") from e


def _build_plan_summary_prompts(
    request: PlanSummaryRequest,
) -> tuple[list[dict[str, str]], str]:
    """构建 Plan 总结的回答文本与 prompts。"""
    answers_text = "\n".join(
        [
            f"问题 {question_id}: {', '.join(selected_options)}"
            for question_id, selected_options in request.answers.items()
        ]
    )
    answers_text = answers_text.replace("custom:", "")

    system_prompt = get_prompt("plan_summary", "system_assistant")
    user_prompt = get_prompt(
        "plan_summary",
        "user_prompt",
        todo_name=request.todo_name,
        answers_text=answers_text,
    )

    if not system_prompt or not user_prompt:
        raise HTTPException(status_code=500, detail="无法加载 prompt 配置，请检查 prompt.yaml")

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    return messages, answers_text
