"""TodoIntentAgent — ReAct Agent for proactive intent recognition.

v2: The Agent now *analyzes* and *classifies* intents but does NOT execute.
It outputs structured JSON (action_type: todo | executable | skip).
Execution happens only after user confirmation via the interactive popup.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import TYPE_CHECKING, Any

from llm.agno_agent import AgnoAgentService
from llm.agno_tools.memory_toolkit import MemoryToolkit
from schemas.perception_todo_intent import (
    IntegrationAction,
    TodoIntegrationResult,
)
from services.agent_activity_tracker import start_activity, stop_activity
from services.perception_todo_intent.pending_actions import (
    ActionType,
    create_pending_action,
)
from storage.notification_storage import add_notification
from util.prompt_loader import get_prompt
from util.settings import settings
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from schemas.perception_todo_intent import TodoIntentContext

logger = logging.getLogger(__name__)

_ANALYSIS_TOOLS = [
    "search_todos",
    "check_schedule_conflict",
    "parse_time",
]


def _create_agent() -> AgnoAgentService:
    """Create a fresh Agent instance (no shared state, safe for parallel use)."""
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
    model = str(settings.get("perception.todo_intent.agent.model", "")).strip() or None

    service = AgnoAgentService(
        lang="zh",
        selected_tools=_ANALYSIS_TOOLS,
        extra_tools=[memory_toolkit],
        agent_id="todo_intent_agent",
        agent_name="TodoIntentAgent",
        model=model,
        enable_learning=False,
    )

    if instructions_text:
        service.agent.instructions = [date_instruction, instructions_text]
    service.agent.tool_call_limit = 6
    return service


def _build_agent_message(
    context: TodoIntentContext,
    *,
    active_todos: str,
    user_profile: str,
) -> str:
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


_TOOL_EVENT_MARKER = "\n[TOOL_EVENT:"
_AGENT_TIMEOUT_SECONDS = 60


def _run_agent_sync(message: str) -> str:
    service = _create_agent()
    parts: list[str] = []
    deadline = __import__("time").monotonic() + _AGENT_TIMEOUT_SECONDS

    for chunk in service.stream_response(message, include_tool_events=True):
        if _TOOL_EVENT_MARKER not in chunk:
            parts.append(chunk)
        if __import__("time").monotonic() > deadline:
            logger.warning("[TodoIntentAgent] Timeout after %ds, stopping", _AGENT_TIMEOUT_SECONDS)
            break

    raw = "".join(parts)
    clean = re.sub(r"\n\[TOOL_EVENT:.*?\]\n", "", raw)
    return clean


def _parse_agent_json(response: str) -> dict[str, Any] | None:
    """Extract the JSON block from the Agent's response."""
    json_match = re.search(r"```json\s*\n(.*?)\n```", response, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            logger.warning("[TodoIntentAgent] JSON parse failed from code block")

    json_match = re.search(r"\{[^{}]*\"action_type\"[^{}]*\}", response, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass

    try:
        return json.loads(response.strip())
    except json.JSONDecodeError:
        return None


_NOTIFICATION_TITLE_MAX_LEN = 40


def _process_single_intent(
    item: dict[str, Any],
    context: TodoIntentContext,
    raw_response: str,
) -> TodoIntegrationResult:
    """Process one intent item from the agent's JSON output."""
    action_type_str = str(item.get("action_type", "skip")).lower()

    if action_type_str == "skip":
        reason = item.get("reason", "无意图")
        logger.info(
            "[FLOW][IntentAgent] 1/3 LLM判断结果=skip, reason=%s, context=%s",
            reason,
            context.context_id[:16],
        )
        return TodoIntegrationResult(
            action=IntegrationAction.SKIPPED,
            reason=f"agent_skip: {reason}",
        )

    if action_type_str == "todo":
        title = str(item.get("title", "新待办"))
        description = str(item.get("description", ""))
        todo_data = item.get("todo_data", {})
        if not isinstance(todo_data, dict):
            todo_data = {}

        logger.info(
            "[FLOW][IntentAgent] 1/3 LLM判断结果=todo, title=%s, context=%s",
            title,
            context.context_id[:16],
        )

        pending = create_pending_action(
            action_type=ActionType.TODO,
            title=title,
            description=description,
            context_id=context.context_id,
            todo_data=todo_data,
            agent_raw_output=raw_response,
        )
        logger.info(
            "[FLOW][IntentAgent] 2/3 创建PendingAction: action_id=%s, type=TODO", pending.action_id
        )

        add_notification(
            notification_id=f"pa_{pending.action_id}",
            title=title,
            content=json.dumps(pending.to_dict(), ensure_ascii=False),
            timestamp=get_utc_now(),
            notification_type="pending_todo",
        )
        logger.info(
            "[FLOW][IntentAgent] 3/3 写入通知: noti_id=pa_%s, type=pending_todo → 等待弹窗系统拾取",
            pending.action_id,
        )

        return TodoIntegrationResult(
            action=IntegrationAction.QUEUED_REVIEW,
            reason=f"pending_todo: {pending.action_id}",
        )

    if action_type_str == "executable":
        title = str(item.get("title", "可执行任务"))
        description = str(item.get("description", ""))
        execution_plan = item.get("execution_plan", [])
        if not isinstance(execution_plan, list):
            execution_plan = []

        logger.info(
            "[FLOW][IntentAgent] 1/3 LLM判断结果=executable, title=%s, steps=%d, context=%s",
            title,
            len(execution_plan),
            context.context_id[:16],
        )

        pending = create_pending_action(
            action_type=ActionType.EXECUTABLE,
            title=title,
            description=description,
            context_id=context.context_id,
            execution_plan=execution_plan,
            agent_raw_output=raw_response,
        )
        logger.info(
            "[FLOW][IntentAgent] 2/3 创建PendingAction: action_id=%s, type=EXECUTABLE",
            pending.action_id,
        )

        add_notification(
            notification_id=f"pa_{pending.action_id}",
            title=title,
            content=json.dumps(pending.to_dict(), ensure_ascii=False),
            timestamp=get_utc_now(),
            notification_type="pending_execute",
        )
        logger.info(
            "[FLOW][IntentAgent] 3/3 写入通知: noti_id=pa_%s, type=pending_execute → 等待弹窗系统拾取",
            pending.action_id,
        )

        return TodoIntegrationResult(
            action=IntegrationAction.QUEUED_REVIEW,
            reason=f"pending_execute: {pending.action_id}",
        )

    logger.warning("[FLOW][IntentAgent] Unknown action_type: %s", action_type_str)
    return TodoIntegrationResult(
        action=IntegrationAction.SKIPPED,
        reason=f"agent_unknown_type: {action_type_str}",
    )


async def run_intent_agent(
    context: TodoIntentContext,
    *,
    active_todos: str = "",
    user_profile: str = "",
) -> TodoIntegrationResult:
    """Run the TodoIntentAgent — returns structured analysis, creates pending action."""
    message = _build_agent_message(
        context,
        active_todos=active_todos,
        user_profile=user_profile,
    )

    logger.info(
        "[FLOW][IntentAgent] 0/3 开始意图分析: context=%s, sources=%s, text_len=%d, msg_len=%d",
        context.context_id[:16],
        ",".join(s.value for s in context.source_set),
        len(context.merged_text or ""),
        len(message),
    )

    aid = start_activity(
        agent_type="intent",
        task=(context.merged_text or "")[:100],
    )
    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(_run_agent_sync, message),
            timeout=_AGENT_TIMEOUT_SECONDS + 10,
        )
        logger.info(
            "[TodoIntentAgent] Agent completed: %d chars, preview=%.300s",
            len(response),
            response,
        )

        parsed = _parse_agent_json(response)
        if parsed is None:
            logger.warning("[TodoIntentAgent] Could not parse structured output")
            return TodoIntegrationResult(
                action=IntegrationAction.SKIPPED,
                reason=f"agent_unparseable: {response.strip()[:200]}",
            )

        # Agent may return a single object or an array of intents
        items: list[dict[str, Any]] = parsed if isinstance(parsed, list) else [parsed]

        last_result: TodoIntegrationResult | None = None
        reasons: list[str] = []

        for item in items:
            if not isinstance(item, dict):
                continue
            result = _process_single_intent(item, context, response)
            if result.action == IntegrationAction.QUEUED_REVIEW:
                reasons.append(result.reason or "")
                last_result = result
            elif last_result is None:
                last_result = result

        if reasons:
            return TodoIntegrationResult(
                action=IntegrationAction.QUEUED_REVIEW,
                reason="; ".join(reasons),
            )

        return last_result or TodoIntegrationResult(
            action=IntegrationAction.SKIPPED,
            reason="agent_no_actionable_items",
        )

    except Exception:
        logger.exception("[TodoIntentAgent] Agent execution failed")
        stop_activity(aid, status="error")
        return TodoIntegrationResult(
            action=IntegrationAction.QUEUED_REVIEW,
            reason="agent_error",
        )
    finally:
        stop_activity(aid)
