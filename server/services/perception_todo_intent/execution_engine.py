"""Execution Engine — runs a full-capability Agent for 'executable' actions.

Reuses the same AgnoAgentService architecture as the chat agent, with:
- Full tool support (all Lifetrace tools + MemoryToolkit + MCP)
- Activity tracker integration for real-time WebSocket monitoring
- Streaming output stored in PendingAction for progress polling
- Cancellation support via activity tracker cancel events
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
from typing import Any

from llm.agno_agent import AgnoAgentService
from llm.agno_agent_io import TOOL_EVENT_PREFIX, TOOL_EVENT_SUFFIX
from llm.agno_tools.memory_toolkit import MemoryToolkit
from services.agent_activity_tracker import (
    add_activity_step,
    is_cancelled,
    start_activity,
    stop_activity,
)
from services.perception_todo_intent.pending_actions import (
    ActionStatus,
    PendingAction,
    append_streaming_output,
    get_action,
    set_activity_id,
    set_execution_result,
    update_action_status,
    upsert_execution_step,
)
from storage.notification_storage import add_notification
from util.logging_config import get_logger
from util.settings import settings
from util.time_utils import get_utc_now

logger = get_logger()

_running_tasks: dict[str, asyncio.Task[None]] = {}
_tasks_lock = threading.Lock()

_EXECUTOR_TOOLS = [
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


def _create_executor_agent(task_description: str) -> AgnoAgentService:
    """Create a full-capability agent mirroring the chat agent architecture."""
    agent_cfg = settings.get("llm.agent", {}) or {}
    agent_model = str(agent_cfg.get("model", "") or "").strip()
    model = (
        str(settings.get("perception.todo_intent.agent.model", "")).strip()
        or agent_model
        or settings.llm.model
    )

    memory_toolkit = MemoryToolkit(lang="zh")

    service = AgnoAgentService(
        lang="zh",
        selected_tools=_EXECUTOR_TOOLS,
        extra_tools=[memory_toolkit],
        agent_id="todo_intent_executor",
        agent_name="TaskExecutor",
        model=model,
        enable_learning=False,
    )

    user_name = settings.get("setup.user_name", "") or "用户"
    agent_name = settings.get("setup.agent_name", "") or "Free U"

    instructions = (
        f"你是 {agent_name}，正在为 {user_name} 执行一个任务。\n\n"
        "## 任务要求\n"
        f"{task_description}\n\n"
        "## 执行规则\n"
        "1. 逐步完成任务，每完成一步简要说明进展。\n"
        "2. 遇到问题时说明原因，不要编造结果。\n"
        "3. 完成后用简洁的中文总结成果。\n"
    )
    service.agent.instructions = [instructions]
    service.agent.tool_call_limit = 90
    return service


def _strip_tool_events(text: str) -> str:
    """Remove [TOOL_EVENT:...] markers from text, keeping only readable content."""
    result = []
    cursor = 0
    while True:
        start = text.find(TOOL_EVENT_PREFIX, cursor)
        if start == -1:
            result.append(text[cursor:])
            break
        result.append(text[cursor:start])
        end = text.find(TOOL_EVENT_SUFFIX, start)
        if end == -1:
            break
        cursor = end + len(TOOL_EVENT_SUFFIX)
    return "".join(result)


def _parse_tool_event_json(text: str) -> dict[str, Any] | None:
    """Extract tool event JSON from a chunk containing TOOL_EVENT markers."""
    start = text.find(TOOL_EVENT_PREFIX)
    if start == -1:
        return None
    end = text.find(TOOL_EVENT_SUFFIX, start)
    if end == -1:
        return None
    json_str = text[start + len(TOOL_EVENT_PREFIX) : end]
    try:
        return json.loads(json_str)
    except (json.JSONDecodeError, ValueError):
        return None


_EXECUTION_TIMEOUT_SECONDS = 300
_NOTIFICATION_MAX_CHARS = 2000


def _build_notification_content(result_text: str) -> str:
    """Build notification content: prefer the tail (summary) over the head."""
    if len(result_text) <= _NOTIFICATION_MAX_CHARS:
        return result_text
    return "..." + result_text[-_NOTIFICATION_MAX_CHARS:]


def _mark_plan_step(action_id: str, step_index: int, status: str, detail: str = "") -> None:
    upsert_execution_step(
        action_id,
        key=f"plan_{step_index + 1}",
        label=f"步骤 {step_index + 1}",
        status=status,
        detail=detail,
    )


def _record_tool_step(
    action_id: str,
    *,
    tool_name: str,
    status: str,
    detail: str = "",
) -> None:
    upsert_execution_step(
        action_id,
        key=f"tool_{tool_name}",
        label=f"工具：{tool_name}",
        status=status,
        detail=detail,
    )


def _handle_stream_event(action_id: str, activity_id: str, event: dict[str, Any]) -> None:
    event_type = str(event.get("type", ""))
    tool_name = str(event.get("tool_name", "") or event.get("name", "")).strip()
    if event_type == "tool_call_start" and tool_name:
        _record_tool_step(action_id, tool_name=tool_name, status="running")
    elif event_type == "tool_call_end" and tool_name:
        detail = str(event.get("result_preview", "") or "")
        tool_status = "failed" if event.get("error") else "done"
        _record_tool_step(
            action_id,
            tool_name=tool_name,
            status=tool_status,
            detail=detail,
        )

    add_activity_step(
        activity_id,
        step_type=event.get("type", "tool_call"),
        name=event.get("name", event.get("tool", "")),
        content=json.dumps(event, ensure_ascii=False)[:500],
    )


def _run_executor_sync(action: PendingAction, activity_id: str) -> str:
    """Run the executor agent synchronously with streaming output + activity tracking."""
    logger.info("[FLOW][ExecSync] 构建Agent: action_id=%s", action.action_id)

    plan_text = "\n".join(f"{i + 1}. {step}" for i, step in enumerate(action.execution_plan))
    task_msg = f"请执行以下任务：{action.title}\n\n详细描述：{action.description}\n\n"
    if plan_text:
        task_msg += f"建议步骤：\n{plan_text}\n\n"
    task_msg += "请开始执行。"

    for index, step in enumerate(action.execution_plan):
        _mark_plan_step(action.action_id, index, "pending", str(step))

    if action.execution_plan:
        _mark_plan_step(action.action_id, 0, "running")

    service = _create_executor_agent(task_msg)
    logger.info("[FLOW][ExecSync] Agent已创建, 开始stream: action_id=%s", action.action_id)

    parts: list[str] = []
    deadline = time.monotonic() + _EXECUTION_TIMEOUT_SECONDS

    for chunk in service.stream_response(task_msg, include_tool_events=True):
        if is_cancelled(activity_id):
            logger.info("[FLOW][ExecSync] 收到取消信号: action_id=%s", action.action_id)
            append_streaming_output(action.action_id, "\n\n[已中断]")
            return "".join(parts).strip()

        if time.monotonic() > deadline:
            logger.warning(
                "[FLOW][ExecSync] 执行超时(%ds): action_id=%s",
                _EXECUTION_TIMEOUT_SECONDS,
                action.action_id,
            )
            append_streaming_output(action.action_id, "\n\n[执行超时，已自动停止]")
            break

        if not chunk:
            continue

        event = _parse_tool_event_json(chunk)
        if event:
            _handle_stream_event(action.action_id, activity_id, event)

        clean = _strip_tool_events(chunk)
        if clean:
            parts.append(clean)
            append_streaming_output(action.action_id, clean)

    raw = "".join(parts)
    return raw.strip()


async def execute_action(action_id: str) -> bool:
    """Start background execution for a pending action. Returns False if not found."""
    logger.info("[FLOW][ExecEngine] 准备启动: action_id=%s", action_id)
    action = get_action(action_id)
    if action is None:
        logger.warning("[FLOW][ExecEngine] action不存在: action_id=%s → return False", action_id)
        return False

    update_action_status(action_id, ActionStatus.EXECUTING)

    activity_id = start_activity(
        agent_type="executor",
        task=f"执行任务: {action.title}"[:100],
        model="agno",
    )
    set_activity_id(action_id, activity_id)

    logger.info(
        "[FLOW][ExecEngine] 状态→EXECUTING: action_id=%s, activity_id=%s, title=%s",
        action_id,
        activity_id,
        action.title,
    )

    async def _run() -> None:
        try:
            logger.info(
                "[FLOW][ExecEngine] sub-agent线程开始: action_id=%s, plan_steps=%d",
                action_id,
                len(action.execution_plan),
            )
            result_text = await asyncio.to_thread(_run_executor_sync, action, activity_id)

            if is_cancelled(activity_id):
                update_action_status(action_id, ActionStatus.FAILED)
                for index, _step in enumerate(action.execution_plan):
                    _mark_plan_step(
                        action_id,
                        index,
                        "failed" if index == 0 else "pending",
                        "任务已被中断",
                    )
                stop_activity(activity_id, status="cancelled")
                add_notification(
                    notification_id=f"exec_cancel_{action_id}",
                    title=f"任务已中断：{action.title}",
                    content="任务已被用户中断。",
                    timestamp=get_utc_now(),
                    notification_type="execution_cancelled",
                )
                return

            for index, step in enumerate(action.execution_plan):
                _mark_plan_step(action_id, index, "done", str(step))
            set_execution_result(action_id, result_text)
            stop_activity(activity_id, status="completed")
            logger.info(
                "[FLOW][ExecEngine] ✓ 执行完成: action_id=%s, result_len=%d",
                action_id,
                len(result_text),
            )

            title_max = 40
            title = f"任务完成：{action.title}"
            if len(title) > title_max:
                title = title[: title_max - 3] + "..."
            notify_content = _build_notification_content(result_text)
            add_notification(
                notification_id=f"exec_done_{action_id}",
                title=title,
                content=notify_content,
                timestamp=get_utc_now(),
                notification_type="execution_complete",
            )
        except Exception:
            logger.exception("[FLOW][ExecEngine] ✗ 执行失败: action_id=%s", action_id)
            update_action_status(action_id, ActionStatus.FAILED)
            for index, _step in enumerate(action.execution_plan):
                _mark_plan_step(
                    action_id,
                    index,
                    "failed" if index == 0 else "pending",
                    "执行过程中遇到错误",
                )
            stop_activity(activity_id, status="error")
            add_notification(
                notification_id=f"exec_fail_{action_id}",
                title=f"任务失败：{action.title}",
                content="执行过程中遇到错误，请稍后重试。",
                timestamp=get_utc_now(),
                notification_type="execution_failed",
            )
        finally:
            with _tasks_lock:
                _running_tasks.pop(action_id, None)

    task = asyncio.create_task(_run())
    with _tasks_lock:
        _running_tasks[action_id] = task
    logger.info("[FLOW][ExecEngine] asyncio.Task已创建: action_id=%s → 后台执行中", action_id)
    return True


def is_running(action_id: str) -> bool:
    with _tasks_lock:
        task = _running_tasks.get(action_id)
        return task is not None and not task.done()
