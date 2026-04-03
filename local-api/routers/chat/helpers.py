"""聊天路由辅助函数：会话管理、消息构建、工作区验证等。"""

import asyncio
from pathlib import Path

from fastapi.responses import StreamingResponse

from core.dependencies import get_rag_service
from llm.chat_title_service import generate_chat_title
from llm.llm_client import LLMClient
from schemas.chat import ChatMessage
from services.agent_activity_tracker import start_activity, stop_activity
from services.chat_service import ChatService
from util.language import get_language_instruction
from util.logging_config import get_logger

logger = get_logger()
_background_tasks: set[asyncio.Task] = set()


# ============== 会话管理 ==============


def ensure_stream_session(message: ChatMessage, chat_service: ChatService) -> str:
    """确保流式聊天有有效的 session，并在需要时创建数据库会话。"""
    session_id = message.conversation_id or chat_service.generate_session_id()
    if not message.conversation_id:
        logger.info(f"[stream] 创建新会话: {session_id}")

    chat = chat_service.get_chat_by_session_id(session_id)
    if not chat:
        chat_type = "event"
        chat_service.create_chat(
            session_id=session_id,
            chat_type=chat_type,
        )
        logger.info(f"[stream] 在数据库中创建会话: {session_id}, 类型: {chat_type}")

    return session_id


def schedule_chat_title_update(
    *,
    chat_service: ChatService,
    session_id: str,
    user_input: str,
    context: str | None = None,
    system_prompt: str | None = None,
) -> None:
    """后台生成并更新聊天标题，避免阻塞主请求。"""
    if not session_id or not user_input:
        return

    async def _run():
        aid = start_activity(agent_type="chat_title", task=user_input[:100])
        try:
            llm_client = LLMClient()
            title = await asyncio.to_thread(
                generate_chat_title,
                llm_client=llm_client,
                user_input=user_input,
                context=context,
                system_prompt=system_prompt,
            )
            if title:
                chat_service.update_chat_title(session_id, title)
        except Exception as exc:  # pragma: no cover - best-effort background task
            logger.warning(f"聊天标题生成任务失败: {exc}")
            stop_activity(aid, status="error")
        finally:
            stop_activity(aid)

    task = asyncio.create_task(_run())
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


# ============== 对话历史 ==============


def get_conversation_history(
    chat_service: ChatService, session_id: str, exclude_content: str | None = None
) -> list[dict[str, str]] | None:
    """获取对话历史（用于 Agno 模式）

    Args:
        chat_service: 聊天服务
        session_id: 会话 ID
        exclude_content: 要排除的消息内容（通常是刚添加的用户消息）

    Returns:
        对话历史列表或 None
    """
    try:
        chat = chat_service.get_chat_by_session_id(session_id)
        if not chat:
            return None
        messages = chat_service.get_messages(session_id)
        history = []
        for msg in messages:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content != exclude_content:
                history.append({"role": role, "content": content})
        return history if history else None
    except Exception as e:
        logger.warning(f"获取对话历史失败: {e}，将使用单次对话模式")
        return None


# ============== 工作区验证 ==============

# 敏感路径黑名单（禁止作为工作区或其父目录）
WORKSPACE_FORBIDDEN_PATHS = {
    ".git",
    ".env",
    ".ssh",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
}

# 系统目录黑名单
WORKSPACE_SYSTEM_DIRS = {"/", "/usr", "/etc", "/var", "/bin", "/sbin", "/home", "/root"}


def validate_workspace_path(workspace_path: str) -> tuple[bool, str]:
    """验证工作区路径安全性

    Args:
        workspace_path: 工作区路径

    Returns:
        (is_valid, error_message) 元组
    """
    try:
        workspace = Path(workspace_path).resolve()
    except Exception as e:
        return False, f"无效的路径: {e}"

    # 检查路径是否存在且是目录
    if not workspace.exists():
        return False, f"路径不存在: {workspace_path}"
    if not workspace.is_dir():
        return False, f"路径不是目录: {workspace_path}"

    # 检查是否是系统目录
    if str(workspace) in WORKSPACE_SYSTEM_DIRS:
        return False, "不允许将系统目录作为工作区"

    # 检查路径中是否包含敏感目录名
    for part in workspace.parts:
        if part in WORKSPACE_FORBIDDEN_PATHS:
            return False, f"工作区路径包含敏感目录: {part}"

    return True, ""


# ============== 错误响应 ==============


def make_error_streaming_response(error_msg: str, session_id: str) -> StreamingResponse:
    """创建错误流式响应"""

    def error_gen():
        yield error_msg

    return StreamingResponse(
        error_gen(),
        media_type="text/plain; charset=utf-8",
        headers={"X-Session-Id": session_id},
    )


# ============== 消息构建 ==============


def build_messages_from_new_schema(
    message: ChatMessage,
    user_message_to_save: str,
    lang: str,
) -> list[dict[str, str]]:
    """使用新的 schema 字段构建 LLM 消息列表。"""
    llm_messages = []
    if message.system_prompt:
        system_content = message.system_prompt
        if message.context:
            system_content += f"\n\n{message.context}"
        system_content += get_language_instruction(lang)
        llm_messages.append({"role": "system", "content": system_content})
    elif message.context:
        system_content = message.context + get_language_instruction(lang)
        llm_messages.append({"role": "system", "content": system_content})

    llm_messages.append({"role": "user", "content": user_message_to_save})
    return llm_messages


def build_messages_from_legacy_format(
    full_message: str,
    lang: str,
) -> tuple[list[dict[str, str]], str]:
    """从老格式消息解析构建 LLM 消息列表（向后兼容）。

    返回 (messages, user_message_to_save)。
    """
    marker = "用户输入:" if "用户输入:" in full_message else "User input:"
    if marker not in full_message:
        return [{"role": "user", "content": full_message}], full_message

    parts = full_message.split(marker, 1)
    if len(parts) != 2:  # noqa: PLR2004
        return [{"role": "user", "content": full_message}], full_message

    system_prompt = parts[0].strip() + get_language_instruction(lang)
    user_input = parts[1].strip()
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_input},
    ]
    return messages, user_input


async def build_stream_messages_and_temperature(
    message: ChatMessage,
    session_id: str,
    lang: str = "zh",
) -> tuple[list[dict[str, str]], float, str, StreamingResponse | None]:
    """根据 use_rag / 前端 prompt 构建 messages 与 temperature。

    返回 (messages, temperature, user_message_to_save, error_response)。
    当 RAG 失败时，error_response 不为 None，调用方应直接返回该响应。
    """
    user_message_to_save = message.get_user_input_for_storage()

    if message.use_rag:
        rag_service = get_rag_service()
        rag_result = await rag_service.process_query_stream(message.message, session_id, lang=lang)

        if not rag_result.get("success", False):
            error_msg = rag_result.get("response", "处理您的查询时出现了错误，请稍后重试。")

            async def error_generator():
                yield error_msg

            return (
                [],
                0.7,
                user_message_to_save,
                StreamingResponse(error_generator(), media_type="text/plain; charset=utf-8"),
            )

        return (
            rag_result.get("messages", []),
            rag_result.get("temperature", 0.7),
            user_message_to_save,
            None,
        )

    # 不使用 RAG：优先新 schema，降级老解析
    if message.system_prompt is not None or message.user_input is not None:
        llm_messages = build_messages_from_new_schema(message, user_message_to_save, lang)
        return llm_messages, 0.7, user_message_to_save, None

    messages, user_message_to_save = build_messages_from_legacy_format(message.message, lang)
    return messages, 0.7, user_message_to_save, None
