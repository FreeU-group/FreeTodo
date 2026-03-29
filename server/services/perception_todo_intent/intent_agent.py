"""TodoIntentAgent — ReAct Agent for proactive intent recognition.

Replaces the Extractor + PostProcessor + Integration pipeline with a single
Agent that autonomously: understands intent → searches memory → decides action
→ executes (create/update/complete/skip) → generates user notification.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING
from uuid import uuid4

from llm.agno_agent import AgnoAgentService
from llm.agno_tools.memory_toolkit import MemoryToolkit
from schemas.perception_todo_intent import (
    IntegrationAction,
    TodoIntegrationResult,
)
from storage.notification_storage import add_notification
from util.prompt_loader import get_prompt
from util.settings import settings
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from schemas.perception_todo_intent import TodoIntentContext

logger = logging.getLogger(__name__)

_INTENT_TOOLS = [
    "create_todo",
    "update_todo",
    "complete_todo",
    "list_todos",
    "search_todos",
    "check_schedule_conflict",
    "parse_time",
    "find_free_slots",
    "search_nearby_places",
    "draft_reply_message",
]

_agent_instance: AgnoAgentService | None = None
_agent_lock = __import__("threading").Lock()


def _get_or_create_agent() -> AgnoAgentService:
    """Lazy-init a singleton AgnoAgentService with intent-recognition tools."""
    global _agent_instance  # noqa: PLW0603
    if _agent_instance is not None:
        return _agent_instance

    with _agent_lock:
        if _agent_instance is not None:
            return _agent_instance

        prompt_category = "perception_todo_intent_agent"
        instructions_text = get_prompt(prompt_category, "system_assistant") or ""

        from util.time_utils import get_local_now  # noqa: PLC0415

        now = get_local_now()
        date_str = now.strftime("%Y-%m-%d")
        weekday_zh = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][now.weekday()]
        time_str = now.strftime("%H:%M:%S")
        date_instruction = f"当前时间：{date_str}（{weekday_zh}）{time_str}。"

        user_name = settings.get("setup.user_name", "") or "用户"
        agent_name = settings.get("setup.agent_name", "") or "Free U"
        instructions_text = instructions_text.replace("{user_name}", str(user_name))
        instructions_text = instructions_text.replace("{agent_name}", str(agent_name))

        memory_toolkit = MemoryToolkit(lang="zh")

        model = (
            str(settings.get("perception.todo_intent.agent.model", "")).strip()
            or settings.llm.model
        )

        service = AgnoAgentService(
            lang="zh",
            selected_tools=_INTENT_TOOLS,
            extra_tools=[memory_toolkit],
            agent_id="todo_intent_agent",
            agent_name="TodoIntentAgent",
            model=model,
        )

        if instructions_text:
            service.agent.instructions = [date_instruction, instructions_text]

        _agent_instance = service
        logger.info(
            "[TodoIntentAgent] Initialized: model=%s, tools=%d+%d (lifetrace+memory)",
            model,
            len(_INTENT_TOOLS),
            4,
        )
        return _agent_instance


def reset_agent() -> None:
    """Force re-creation on next call (e.g. after config change)."""
    global _agent_instance  # noqa: PLW0603
    with _agent_lock:
        _agent_instance = None


def _build_agent_message(
    context: TodoIntentContext,
    *,
    active_todos: str,
    user_profile: str,
) -> str:
    """Build the user message sent to the Agent."""
    prompt_category = "perception_todo_intent_agent"
    merged_text = (context.merged_text or "").strip()

    from util.time_utils import get_local_now  # noqa: PLC0415

    now = get_local_now()
    current_time_str = now.strftime("%Y-%m-%d %H:%M:%S %Z")

    user_prompt = get_prompt(
        prompt_category,
        "user_prompt",
        text=merged_text,
        current_time=current_time_str,
        source_set=", ".join(s.value for s in context.source_set) or "unknown",
        app_name=str(context.metadata.get("app_name") or ""),
        window_title=str(context.metadata.get("window_title") or ""),
        speaker=str(context.metadata.get("speaker") or ""),
        active_todos=active_todos or "(无已有待办)",
        user_profile=user_profile or "(无用户画像)",
    )
    return user_prompt or merged_text


def _run_agent_sync(message: str) -> str:
    """Run the Agent synchronously, collecting full text response."""
    service = _get_or_create_agent()
    parts: list[str] = []
    for chunk in service.stream_response(message, include_tool_events=False):
        parts.append(chunk)
    return "".join(parts)


async def run_intent_agent(
    context: TodoIntentContext,
    *,
    active_todos: str = "",
    user_profile: str = "",
) -> TodoIntegrationResult:
    """Run the TodoIntentAgent for a given context.

    Returns a TodoIntegrationResult indicating what happened.
    """
    message = _build_agent_message(
        context,
        active_todos=active_todos,
        user_profile=user_profile,
    )

    logger.info(
        "[TodoIntentAgent] Processing context %s (%d chars message)",
        context.context_id[:16],
        len(message),
    )

    try:
        response = await asyncio.to_thread(_run_agent_sync, message)
        logger.info(
            "[TodoIntentAgent] Agent completed: response=%d chars, preview=%.300s",
            len(response),
            response,
        )

        if _response_indicates_no_action(response):
            logger.info("[TodoIntentAgent] Agent determined no action needed")
            return TodoIntegrationResult(
                action=IntegrationAction.SKIPPED,
                reason="agent_no_action",
            )

        notification_id = f"intent_{uuid4().hex[:12]}"
        title = _extract_notification_title(response)
        add_notification(
            notification_id=notification_id,
            title=title,
            content=response.strip(),
            timestamp=get_utc_now(),
            notification_type="auto_todo",
        )
        logger.info("[TodoIntentAgent] Notification pushed: %s — %s", notification_id, title)

        return TodoIntegrationResult(
            action=IntegrationAction.CREATED,
            reason="agent_completed",
        )
    except Exception:
        logger.exception("[TodoIntentAgent] Agent execution failed")
        return TodoIntegrationResult(
            action=IntegrationAction.QUEUED_REVIEW,
            reason="agent_error",
        )


def _response_indicates_no_action(response: str) -> bool:
    """Heuristic: did the Agent decide there's nothing to do?"""
    text = response.strip().lower()
    if not text:
        return True
    no_action_signals = [
        "没有发现待办",
        "没有待办",
        "未检测到",
        "无需创建",
        "不需要创建",
        "没有需要处理的",
        "无待办",
    ]
    return any(signal in text for signal in no_action_signals)


_NOTIFICATION_TITLE_MAX_LEN = 40


def _extract_notification_title(response: str) -> str:
    """Extract a short title from the Agent's response for the notification."""
    first_line = response.strip().split("\n")[0]
    clean = first_line.strip("# *·•-—")
    if len(clean) > _NOTIFICATION_TITLE_MAX_LEN:
        clean = clean[: _NOTIFICATION_TITLE_MAX_LEN - 3] + "..."
    return clean or "自动待办"
