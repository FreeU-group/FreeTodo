"""Agno Agent 服务，基于 Agno 框架的通用 Agent 实现

支持 LifetraceToolkit 工具集和国际化消息。
支持工具调用事件流，可在前端实时展示 Agent 执行步骤。
支持 Phoenix + OpenInference 观测（通过配置启用）。
支持 session_id 传递，实现按会话聚合 trace 文件。
支持外部工具（如 DuckDuckGo 搜索）。
"""

from __future__ import annotations

import base64
import json
from contextvars import ContextVar
from pathlib import Path
from typing import TYPE_CHECKING, Any

from agno.agent import Agent, Message, RunEvent
from agno.db.sqlite import SqliteDb
from agno.learn import LearningMachine, LearningMode, UserMemoryConfig, UserProfileConfig
from agno.models.openai.like import OpenAILike

from llm.agno_external_tools import (
    create_external_tool,
)
from llm.agno_external_tools import (
    get_available_external_tools as _get_available_external_tools,
)
from llm.agno_learning import (
    normalize_memories,
    normalize_profile,
    safe_store_get,
)
from llm.agno_tools import LifetraceToolkit
from llm.agno_tools.base import get_message
from observability import setup_observability
from util.logging_config import get_logger
from util.path_utils import get_agno_learning_db_path
from util.settings import settings

if TYPE_CHECKING:
    from collections.abc import Callable, Generator

    from agno.tools import Toolkit

# 全局 ContextVar 用于跨 span 传递 session_id
# file_exporter 可以读取这个值来按 session 聚合文件
current_session_id: ContextVar[str | None] = ContextVar("current_session_id", default=None)

logger = get_logger()

# 初始化观测系统（在模块加载时执行一次）
# 如果配置中 observability.enabled = false，则不会有任何影响
setup_observability()

# Default language, can be overridden from settings
DEFAULT_LANG = "en"

# 工具调用事件标记（用于流式输出中区分内容和工具调用事件）
TOOL_EVENT_PREFIX = "\n[TOOL_EVENT:"
TOOL_EVENT_SUFFIX = "]\n"

# 工具结果预览最大长度
RESULT_PREVIEW_MAX_LENGTH = 500
MAX_INLINE_TEXT_ATTACHMENT_BYTES = 200_000

TEXT_ATTACHMENT_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".json",
    ".yaml",
    ".yml",
    ".csv",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".java",
    ".go",
    ".rs",
    ".rb",
    ".php",
    ".sh",
    ".bat",
    ".ps1",
    ".sql",
    ".html",
    ".css",
    ".xml",
    ".toml",
    ".ini",
    ".log",
}

# Learning 事件类型
MEMORY_EVENT_TYPE = "memory_saved"


def _build_learning_config() -> tuple[
    SqliteDb | None, bool | LearningMachine | None, bool, str | None
]:
    """构建 Agno Learning 配置"""
    learning_enabled = bool(settings.get("agno.learning.enabled", False))
    if not learning_enabled:
        return None, None, False, None

    db_path = get_agno_learning_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = SqliteDb(db_file=str(db_path))

    learning_mode = str(settings.get("agno.learning.mode", "always")).lower()
    if learning_mode == "agentic":
        learning = LearningMachine(
            user_profile=UserProfileConfig(mode=LearningMode.AGENTIC),
            user_memory=UserMemoryConfig(mode=LearningMode.AGENTIC),
        )
    else:
        learning = True

    add_history_to_context = bool(settings.get("agno.learning.add_history_to_context", False))
    return db, learning, add_history_to_context, str(db_path)


def get_available_external_tools() -> list[str]:
    """获取可用的外部工具列表"""
    return _get_available_external_tools()


def _get_current_date_instruction(lang: str) -> str:
    """获取当前日期的指令字符串（使用东八区时间）"""
    from util.time_utils import get_local_now  # noqa: PLC0415

    now = get_local_now()
    date_str = now.strftime("%Y-%m-%d")
    weekday_zh = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][now.weekday()]
    weekday_en = now.strftime("%A")

    if lang == "zh":
        return f"当前日期：{date_str}（{weekday_zh}）。"
    return f"Current date: {date_str} ({weekday_en})."


def _resolve_identity() -> tuple[str, str]:
    """Read user_name and agent_name from setup config."""
    user_name = settings.get("setup.user_name", "") or ""
    agent_name = settings.get("setup.agent_name", "") or ""
    return user_name.strip() or "用户", agent_name.strip() or "Free U"


def _inject_identity(text: str) -> str:
    """Replace {user_name} and {agent_name} placeholders in instructions."""
    user_name, agent_name = _resolve_identity()
    try:
        return text.format(user_name=user_name, agent_name=agent_name)
    except (KeyError, IndexError):
        return text.replace("{user_name}", user_name).replace("{agent_name}", agent_name)


def _build_instructions(
    lang: str,
    has_tools: bool,
    use_all_lifetrace_tools: bool,
    has_external_tools: bool,
) -> list[str] | None:
    """构建 Agent 的 instructions

    Args:
        lang: 语言代码
        has_tools: 是否有任何工具启用
        use_all_lifetrace_tools: 是否使用全部 Lifetrace 工具
        has_external_tools: 是否有外部工具

    Returns:
        instructions 列表或 None
    """
    date_instruction = _get_current_date_instruction(lang)
    _ = (use_all_lifetrace_tools, has_external_tools)
    user_name, agent_name = _resolve_identity()

    # Load instructions from agno_tools/{lang}/instructions.yaml (if available)
    instructions = get_message(lang, "instructions")
    if instructions and instructions != "[instructions]":
        return [date_instruction, _inject_identity(instructions)]

    # 简化的 instructions（also inject identity）
    if lang == "zh":
        if has_tools:
            return [
                date_instruction,
                f"你是 {agent_name}，{user_name} 的智能助手，可以帮助用户管理待办事项和执行各种任务。"
                "请根据用户的问题选择合适的工具来完成任务。",
            ]
        return [
            date_instruction,
            f"你是 {agent_name}，{user_name} 的智能助手。当前没有启用任何工具，请直接回答用户的问题。",
        ]

    # English
    if has_tools:
        return [
            date_instruction,
            f"You are {agent_name}, {user_name}'s assistant that helps manage todos "
            "and perform various tasks. Use the appropriate tools to complete tasks.",
        ]
    return [
        date_instruction,
        f"You are {agent_name}, {user_name}'s assistant. No tools are currently enabled. "
        "Please answer the user's questions directly.",
    ]


class AgnoAgentService:
    """Agno Agent 服务，提供基于 Agno 框架的智能对话能力

    Supports:
    - LifetraceToolkit for todo management
    - External tools (DuckDuckGo search, etc.)
    - Internationalization (i18n) through lang parameter
    - Streaming responses
    """

    def __init__(  # noqa: PLR0913
        self,
        lang: str | None = None,
        selected_tools: list[str] | None = None,
        external_tools: list[str] | None = None,
        external_tools_config: dict[str, dict] | None = None,
        extra_tools: list[Toolkit] | None = None,
        tool_hooks: list[Callable[..., Any]] | None = None,
        pre_hooks: list[Any] | None = None,
        post_hooks: list[Any] | None = None,
        agent_id: str | None = None,
        agent_name: str | None = None,
        model: str | None = None,
    ):
        """初始化 Agno Agent 服务

        Args:
            lang: Language code for messages ('zh' or 'en').
                  If None, uses DEFAULT_LANG or settings default.
            selected_tools: List of Lifetrace tool names to enable.
                           If None or empty, no Lifetrace tools are enabled.
            external_tools: List of external tool names to enable (e.g., ['duckduckgo', 'file']).
                           If None or empty, no external tools are enabled.
            external_tools_config: Configuration dict for external tools.
                           Example: {"file": {"base_dir": "/path/to/workspace", "enable_delete": False}}
        """
        try:
            self.lang = lang or DEFAULT_LANG
            tools_to_use = self._initialize_tools(
                selected_tools, external_tools, external_tools_config
            )
            if extra_tools:
                tools_to_use.extend(extra_tools)

            # 判断工具配置
            total_lifetrace_tools_count = 17
            use_all_lifetrace_tools = bool(
                selected_tools and len(selected_tools) == total_lifetrace_tools_count
            )
            has_external_tools = bool(external_tools and len(external_tools) > 0) or bool(
                extra_tools
            )

            instructions_list = _build_instructions(
                self.lang, bool(tools_to_use), use_all_lifetrace_tools, has_external_tools
            )

            db, learning, add_history_to_context, db_path = _build_learning_config()

            resolved_model = model or settings.llm.model
            self.agent = Agent(
                model=OpenAILike(
                    id=resolved_model,
                    api_key=settings.llm.api_key,
                    base_url=settings.llm.base_url,
                ),
                tools=tools_to_use if tools_to_use else None,
                instructions=instructions_list,
                db=db,
                learning=learning,
                add_history_to_context=add_history_to_context,
                markdown=True,
                tool_hooks=tool_hooks,
                pre_hooks=pre_hooks,
                post_hooks=post_hooks,
                id=agent_id,
                name=agent_name,
            )
            if learning:
                logger.info(
                    "Agno Learning 已启用: mode=%s, db=%s",
                    settings.get("agno.learning.mode", "always"),
                    db_path,
                )
            logger.info(
                f"Agno Agent 初始化成功，模型: {resolved_model}, "
                f"Base URL: {settings.llm.base_url}, lang: {self.lang}, "
                f"工具数量: {len(tools_to_use)}",
            )
        except Exception as e:
            logger.error(f"Agno Agent 初始化失败: {e}")
            raise

    def _initialize_tools(
        self,
        selected_tools: list[str] | None,
        external_tools: list[str] | None,
        external_tools_config: dict[str, dict] | None = None,
    ) -> list[Toolkit]:
        """初始化工具列表

        Args:
            selected_tools: Lifetrace 工具名称列表
            external_tools: 外部工具名称列表
            external_tools_config: 外部工具配置字典，如 {"file": {"base_dir": "/path"}}
        """
        tools_to_use: list[Toolkit] = []
        external_tools_config = external_tools_config or {}

        # Initialize LifetraceToolkit if any tools are selected
        if selected_tools and len(selected_tools) > 0:
            toolkit = LifetraceToolkit(lang=self.lang, selected_tools=selected_tools)
            tools_to_use.append(toolkit)
            logger.info(f"已启用 Lifetrace 工具: {selected_tools}")

        # Initialize external tools with config
        if external_tools and len(external_tools) > 0:
            for tool_name in external_tools:
                # 获取该工具的配置
                config = external_tools_config.get(tool_name, {})
                external_tool = create_external_tool(tool_name, **config)
                if external_tool:
                    tools_to_use.append(external_tool)
                    logger.info(f"已启用外部工具: {tool_name}, 配置: {config}")
                else:
                    logger.warning(f"未找到或无法创建外部工具: {tool_name}")

        return tools_to_use

    def _capture_learning_snapshot(
        self, user_id: str | None
    ) -> tuple[dict[str, Any], dict[str, str]] | None:
        """获取用户画像与记忆快照"""
        if not user_id:
            return None

        learning = self._get_learning_machine()
        if not learning:
            return None

        profile_store = learning.user_profile_store
        memory_store = learning.user_memory_store

        profile = safe_store_get(profile_store, user_id)
        memories = safe_store_get(memory_store, user_id)

        return normalize_profile(profile), normalize_memories(memories)

    def _get_learning_machine(self) -> LearningMachine | None:
        """获取 LearningMachine（兼容不同 Agno 版本的 API）"""
        get_learning_machine = getattr(self.agent, "get_learning_machine", None)
        if callable(get_learning_machine):
            learning = get_learning_machine()
            if isinstance(learning, LearningMachine):
                return learning

        learning_machine = getattr(self.agent, "learning_machine", None)
        if isinstance(learning_machine, LearningMachine):
            return learning_machine

        learning_attr = getattr(self.agent, "learning", None)
        if isinstance(learning_attr, LearningMachine):
            return learning_attr

        return None

    def _build_memory_event(
        self,
        user_id: str,
        before_snapshot: tuple[dict[str, Any], dict[str, str]] | None,
    ) -> dict[str, Any] | None:
        """构建记忆更新事件（用于前端 toast 提示）"""
        if not before_snapshot:
            return None

        after_snapshot = self._capture_learning_snapshot(user_id)
        if not after_snapshot:
            return None

        before_profile, before_memories = before_snapshot
        after_profile, after_memories = after_snapshot

        profile_updates = [
            {"field": key, "value": str(value)}
            for key, value in after_profile.items()
            if before_profile.get(key) != value
        ]
        new_memories = [
            content
            for memory_id, content in after_memories.items()
            if memory_id not in before_memories
        ]

        if not profile_updates and not new_memories:
            return None

        max_items = 4
        combined: list[tuple[str, Any]] = []
        combined.extend(("profile", item) for item in profile_updates)
        combined.extend(("memory", item) for item in new_memories)

        more_count = 0
        if len(combined) > max_items:
            more_count = len(combined) - max_items
            combined = combined[:max_items]

        limited_profiles = [item for kind, item in combined if kind == "profile"]
        limited_memories = [item for kind, item in combined if kind == "memory"]

        event: dict[str, Any] = {"type": MEMORY_EVENT_TYPE}
        if limited_memories:
            event["memories"] = limited_memories
        if limited_profiles:
            event["profile_updates"] = limited_profiles
        if more_count:
            event["more_count"] = more_count

        return event

    def _read_text_attachment(self, file_path: str, mime_type: str | None) -> str | None:
        path = Path(file_path)
        if not path.exists() or not path.is_file():
            return None

        if (
            mime_type
            and not mime_type.startswith("text/")
            and path.suffix.lower() not in TEXT_ATTACHMENT_EXTENSIONS
        ):
            return None

        try:
            data = path.read_bytes()
        except Exception:
            return None

        if len(data) > MAX_INLINE_TEXT_ATTACHMENT_BYTES:
            return None

        try:
            return data.decode("utf-8", errors="replace")
        except Exception:
            return None

    def _read_image_data_url(self, file_path: str, mime_type: str | None) -> str | None:
        path = Path(file_path)
        if not path.exists() or not path.is_file():
            return None
        try:
            data = path.read_bytes()
        except Exception:
            return None

        mime = mime_type or "image/png"
        encoded = base64.b64encode(data).decode("ascii")
        return f"data:{mime};base64,{encoded}"

    def _build_user_message_content(
        self,
        message: str,
        attachments: list[dict[str, Any]] | None,
    ) -> str | list[dict[str, Any]]:
        if not attachments:
            return message

        parts: list[dict[str, Any]] = []
        if message:
            parts.append({"type": "text", "text": message})

        for attachment in attachments:
            name = str(attachment.get("file_name") or "attachment")
            mime_type = attachment.get("mime_type")
            file_path = attachment.get("file_path")
            kind = attachment.get("kind") or "file"

            if kind == "image" and file_path:
                data_url = self._read_image_data_url(str(file_path), mime_type)
                if data_url:
                    parts.append({"type": "image_url", "image_url": {"url": data_url}})
                    continue
                parts.append({"type": "text", "text": f"[Image attachment: {name}]"})
                continue

            snippet = self._read_text_attachment(str(file_path), mime_type) if file_path else None
            if snippet:
                parts.append(
                    {
                        "type": "text",
                        "text": f"[Attachment: {name}]\n{snippet}",
                    }
                )
            else:
                details = f"{mime_type or 'application/octet-stream'}"
                size = attachment.get("file_size")
                if size:
                    details = f"{details}, {size} bytes"
                parts.append(
                    {
                        "type": "text",
                        "text": (
                            f"[Attachment: {name} ({details})] File stored on disk for reference."
                        ),
                    }
                )

        return parts if parts else message

    def _build_input_data(
        self,
        message: str,
        conversation_history: list[dict[str, str]] | None,
        attachments: list[dict[str, Any]] | None,
    ):
        """构建 Agent 输入数据"""
        user_content = self._build_user_message_content(message, attachments)

        if not conversation_history:
            return user_content

        messages = []
        for msg in conversation_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant"):
                messages.append(Message(role=role, content=content))
        messages.append(Message(role="user", content=user_content))
        return messages

    def _format_tool_event(self, event_data: dict) -> str:
        """格式化工具事件为输出字符串"""
        return f"{TOOL_EVENT_PREFIX}{json.dumps(event_data, ensure_ascii=False)}{TOOL_EVENT_SUFFIX}"

    def _handle_tool_call_started(self, chunk) -> str | None:
        """处理工具调用开始事件"""
        tool_info = getattr(chunk, "tool", None)
        if not tool_info:
            return None
        event_data = {
            "type": "tool_call_start",
            "tool_name": getattr(tool_info, "tool_name", "unknown"),
            "tool_args": getattr(tool_info, "tool_args", {}),
        }
        logger.debug(f"工具调用开始: {event_data['tool_name']}, 参数: {event_data['tool_args']}")
        return self._format_tool_event(event_data)

    def _handle_tool_call_completed(self, chunk) -> str | None:
        """处理工具调用完成事件"""
        tool_info = getattr(chunk, "tool", None)
        if not tool_info:
            return None
        result = getattr(tool_info, "result", "")
        result_str = str(result)
        result_preview = (
            result_str[:RESULT_PREVIEW_MAX_LENGTH] + "..."
            if len(result_str) > RESULT_PREVIEW_MAX_LENGTH
            else result_str
        )
        event_data = {
            "type": "tool_call_end",
            "tool_name": getattr(tool_info, "tool_name", "unknown"),
            "result_preview": result_preview,
        }
        logger.debug(
            f"工具调用完成: {event_data['tool_name']}, 结果预览: {result_preview[:100]}..."
        )
        return self._format_tool_event(event_data)

    def _handle_tool_call_error(self, chunk) -> str | None:
        """处理工具调用错误事件"""
        tool_info = getattr(chunk, "tool", None)
        if not tool_info:
            return None
        error = getattr(tool_info, "error", None) or getattr(chunk, "error", None)
        error_str = str(error) if error else "Unknown error"
        error_preview = (
            error_str[:RESULT_PREVIEW_MAX_LENGTH] + "..."
            if len(error_str) > RESULT_PREVIEW_MAX_LENGTH
            else error_str
        )
        event_data = {
            "type": "tool_call_end",
            "tool_name": getattr(tool_info, "tool_name", "unknown"),
            "result_preview": f"[Error] {error_preview}",
            "error": True,
        }
        logger.warning(f"工具调用错误: {event_data['tool_name']}, 错误: {error_preview[:100]}...")
        return self._format_tool_event(event_data)

    def _process_stream_chunk(self, chunk, include_tool_events: bool) -> str | None:
        """处理单个流式输出块，返回需要 yield 的内容"""
        result = None

        if chunk.event == RunEvent.run_content:
            result = chunk.content if chunk.content else None
        elif include_tool_events:
            if chunk.event == RunEvent.tool_call_started:
                result = self._handle_tool_call_started(chunk)
            elif chunk.event == RunEvent.tool_call_completed:
                result = self._handle_tool_call_completed(chunk)
            elif chunk.event == RunEvent.tool_call_error:
                # 处理工具调用错误事件，发送 tool_call_end 以便前端更新状态
                result = self._handle_tool_call_error(chunk)
            elif chunk.event == RunEvent.run_started:
                logger.debug("Agent 运行开始")
                result = self._format_tool_event({"type": "run_started"})
            elif chunk.event == RunEvent.run_completed:
                logger.debug("Agent 运行完成")
                result = self._format_tool_event({"type": "run_completed"})

        return result

    def stream_response(
        self,
        message: str,
        conversation_history: list[dict[str, str]] | None = None,
        include_tool_events: bool = True,
        session_id: str | None = None,
        user_id: str | None = None,
        attachments: list[dict[str, Any]] | None = None,
    ) -> Generator[str]:
        """
        流式生成 Agent 回复

        Args:
            message: 用户消息
            conversation_history: 对话历史，格式为 [{"role": "user|assistant", "content": "..."}]
            include_tool_events: 是否包含工具调用事件（默认 True）
            session_id: 会话 ID，用于 trace 文件按会话聚合和 Phoenix session 追踪
            user_id: 用户 ID，用于 Agno Learning 的跨会话记忆

        Yields:
            回复内容片段（字符串），如果 include_tool_events=True，
            工具调用事件会以特殊格式输出：[TOOL_EVENT:{"type":"...","data":{...}}]
        """
        # 设置本地 ContextVar（用于 file_exporter 按会话聚合）
        current_session_id.set(session_id)

        learning_snapshot = self._capture_learning_snapshot(user_id)

        try:
            input_data = self._build_input_data(message, conversation_history, attachments)
            # 直接将 session_id 传递给 agent.run()
            # Agno Instrumentor 会从参数中读取 session_id 并设置为 span 属性
            run_kwargs = {
                "stream": True,
                "stream_events": include_tool_events,
                "session_id": session_id,
            }
            if user_id:
                run_kwargs["user_id"] = user_id

            stream = self.agent.run(input_data, **run_kwargs)

            for chunk in stream:
                output = self._process_stream_chunk(chunk, include_tool_events)
                if output:
                    yield output

            if user_id:
                memory_event = self._build_memory_event(user_id, learning_snapshot)
                if memory_event:
                    yield self._format_tool_event(memory_event)

        except Exception as e:
            logger.error(f"Agno Agent 流式生成失败: {e}")
            yield f"Agno Agent 处理失败: {e!s}"
        finally:
            # 清理 ContextVar
            current_session_id.set(None)

    def is_available(self) -> bool:
        """检查 Agno Agent 是否可用"""
        return hasattr(self, "agent") and self.agent is not None
