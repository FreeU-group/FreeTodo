"""Agno Agent 服务，基于 Agno 框架的通用 Agent 实现

支持 LifetraceToolkit 工具集和国际化消息。
支持工具调用事件流，可在前端实时展示 Agent 执行步骤。
支持 Phoenix + OpenInference 观测（通过配置启用）。
支持 session_id 传递，实现按会话聚合 trace 文件。
支持外部工具（如 DuckDuckGo 搜索）。
"""

from __future__ import annotations

import threading
from collections.abc import Generator
from contextvars import ContextVar
from typing import TYPE_CHECKING, Any

from agno.agent import Agent, Message
from agno.learn import LearningMachine
from agno.models.openai.like import OpenAILike

from llm.agno_agent_config import (
    build_instructions,
    build_learning_config,
    collect_tool_names,
    get_mcp_superseded_tools,
    get_mcp_tools,
    resolve_agent_llm,
)
from llm.agno_agent_io import build_user_message_content, format_tool_event, process_stream_chunk
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
from observability import setup_observability
from util.logging_config import get_logger
from util.settings import settings

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Callable, Generator

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

# Learning 事件类型
MEMORY_EVENT_TYPE = "memory_saved"


def get_available_external_tools() -> list[str]:
    """获取可用的外部工具列表"""
    return _get_available_external_tools()


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
        enable_learning: bool = True,
        force_main_llm: bool = False,
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
            enable_learning: When False the agent is created without Learning
                           so the stream finishes as soon as all content is
                           yielded.  Learning can then run in a background
                           thread via ``run_learning_background``.
            force_main_llm: When True, skip agent-specific LLM config and
                           always use the main llm.* credentials.
        """
        try:
            self.lang = lang or DEFAULT_LANG
            tools_to_use = self._initialize_tools(
                selected_tools, external_tools, external_tools_config
            )
            if extra_tools:
                tools_to_use.extend(extra_tools)

            # Inject globally connected MCP tools
            mcp_tools = get_mcp_tools()
            if mcp_tools:
                tools_to_use.extend(mcp_tools)

            # 判断工具配置
            total_lifetrace_tools_count = 17
            use_all_lifetrace_tools = bool(
                selected_tools and len(selected_tools) == total_lifetrace_tools_count
            )
            has_external_tools = bool(external_tools and len(external_tools) > 0) or bool(
                extra_tools
            )

            available_tool_names = collect_tool_names(tools_to_use)
            instructions_list = build_instructions(
                self.lang,
                bool(tools_to_use),
                use_all_lifetrace_tools,
                has_external_tools,
                available_tool_names=available_tool_names,
            )

            if enable_learning:
                db, learning, add_history_to_context, db_path = build_learning_config()
            else:
                db, learning, add_history_to_context, db_path = None, None, False, None

            resolved_model, resolved_api_key, resolved_base_url = resolve_agent_llm(
                model, force_main_llm=force_main_llm
            )
            agent_temperature = float(settings.get("llm.agent_temperature", 0.3))

            is_qwen_thinking = resolved_model.lower().startswith("qwen")
            model_kwargs: dict[str, Any] = {
                "id": resolved_model,
                "api_key": resolved_api_key,
                "base_url": resolved_base_url,
                "temperature": agent_temperature,
            }
            if is_qwen_thinking:
                model_kwargs["request_params"] = {
                    "extra_body": {"enable_thinking": True},
                }
                logger.info("Qwen 模型检测到，已启用 thinking 模式: %s", resolved_model)

            self.agent = Agent(
                model=OpenAILike(**model_kwargs),
                tools=tools_to_use if tools_to_use else None,
                instructions=instructions_list,
                db=db,
                learning=learning,
                add_history_to_context=add_history_to_context,
                markdown=True,
                retries=1,
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
                "Agno Agent 初始化成功，模型: %s, Base URL: %s, lang: %s, "
                "Toolkit数: %d, 工具函数: %s",
                resolved_model,
                settings.llm.base_url,
                self.lang,
                len(tools_to_use),
                available_tool_names or [],
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
            mcp_superseded = get_mcp_superseded_tools()
            for tool_name in external_tools:
                if tool_name in mcp_superseded:
                    logger.info("跳过内置外部工具 %r（已被 MCP 服务器取代）", tool_name)
                    continue
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

    def _build_user_message_content(
        self,
        message: str,
        attachments: list[dict[str, Any]] | None,
    ) -> str | list[dict[str, Any]]:
        return build_user_message_content(message, attachments)

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
        return format_tool_event(event_data)

    def _process_stream_chunk(self, chunk, include_tool_events: bool) -> str | None:
        """处理单个流式输出块，返回需要 yield 的内容"""
        return process_stream_chunk(chunk, include_tool_events, logger)

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

    async def async_stream_response(
        self,
        message: str,
        conversation_history: list[dict[str, str]] | None = None,
        include_tool_events: bool = True,
        session_id: str | None = None,
        user_id: str | None = None,
        attachments: list[dict[str, Any]] | None = None,
    ) -> AsyncGenerator[str]:
        """异步流式生成 Agent 回复（使用 arun，原生支持 async 工具如 MCP）。"""
        current_session_id.set(session_id)
        learning_snapshot = self._capture_learning_snapshot(user_id)

        try:
            input_data = self._build_input_data(message, conversation_history, attachments)
            run_kwargs = {
                "stream": True,
                "stream_events": include_tool_events,
                "session_id": session_id,
            }
            if user_id:
                run_kwargs["user_id"] = user_id

            stream = await self.agent.arun(input_data, **run_kwargs)

            async for chunk in stream:
                output = self._process_stream_chunk(chunk, include_tool_events)
                if output:
                    yield output

            if user_id:
                memory_event = self._build_memory_event(user_id, learning_snapshot)
                if memory_event:
                    yield self._format_tool_event(memory_event)

        except Exception as e:
            logger.error(f"Agno Agent 异步流式生成失败: {e}")
            yield f"Agno Agent 处理失败: {e!s}"
        finally:
            current_session_id.set(None)

    def is_available(self) -> bool:
        """检查 Agno Agent 是否可用"""
        return hasattr(self, "agent") and self.agent is not None

    @staticmethod
    def run_learning_background(
        user_message: str,
        assistant_response: str,
        user_id: str,
        session_id: str,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> None:
        """Fire-and-forget: run Learning Machine in a background thread.

        Creates a lightweight agent solely for memory / profile extraction
        so the main streaming agent can finish without waiting for learning.
        """
        db, learning, _, db_path = build_learning_config()
        if not learning:
            return

        def _bg() -> None:
            try:
                messages: list[Message] = []
                if conversation_history:
                    for msg in conversation_history[-6:]:
                        messages.append(
                            Message(role=msg.get("role", "user"), content=msg.get("content", ""))
                        )
                messages.append(Message(role="user", content=user_message))
                messages.append(Message(role="assistant", content=assistant_response))

                learning_model_id = str(
                    settings.get("agno.learning.model", "")
                ).strip() or settings.get("llm.small_model", "qwen-turbo")
                learning_agent = Agent(
                    model=OpenAILike(
                        id=learning_model_id,
                        api_key=settings.llm.api_key,
                        base_url=settings.llm.base_url,
                    ),
                    learning=learning,
                    db=db,
                    instructions=["Respond with OK only."],
                    markdown=False,
                )
                learning_agent.run(
                    messages,
                    user_id=user_id,
                    session_id=session_id,
                )
                logger.info("[Learning] Background learning completed for user %s", user_id)
            except Exception:
                logger.exception("[Learning] Background learning failed")

        threading.Thread(target=_bg, daemon=True, name="bg-learning").start()
