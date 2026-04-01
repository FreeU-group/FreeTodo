"""Execution Engine — runs a Sub-Agent in the background for 'executable' actions.

When the user confirms an executable pending action, this module spawns an
AgnoAgentService with full tools, streams progress step-by-step, and stores
the result back into the PendingAction.
"""

from __future__ import annotations

import asyncio
import re
import threading

from llm.agno_agent import AgnoAgentService
from llm.agno_tools.memory_toolkit import MemoryToolkit
from services.perception_todo_intent.pending_actions import (
    ActionStatus,
    ExecutionStep,
    PendingAction,
    get_action,
    set_execution_result,
    update_action_status,
    update_execution_steps,
)
from storage.notification_storage import add_notification
from util.logging_config import get_logger
from util.settings import settings
from util.time_utils import get_utc_now

logger = get_logger()

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

_running_tasks: dict[str, asyncio.Task[None]] = {}
_tasks_lock = threading.Lock()


def _create_executor_agent(task_description: str) -> AgnoAgentService:
    """Create a full-capability agent for task execution."""
    agent_cfg = settings.get("llm.agent", {}) or {}
    agent_model = str(agent_cfg.get("model", "") or "").strip()
    model = (
        str(settings.get("perception.todo_intent.agent.model", "")).strip()
        or agent_model
        or settings.llm.model
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
        "4. 每个步骤的开头用 [STEP] 标记，格式：[STEP] 步骤描述\n"
    )

    memory_toolkit = MemoryToolkit(lang="zh")
    service = AgnoAgentService(
        lang="zh",
        selected_tools=_EXECUTOR_TOOLS,
        extra_tools=[memory_toolkit],
        agent_id="todo_intent_executor",
        agent_name="TaskExecutor",
        model=model,
    )
    service.agent.instructions = [instructions]
    return service


def _run_executor_sync(
    action: PendingAction,
) -> str:
    """Run the executor agent synchronously, updating steps in real-time."""
    logger.info("[FLOW][ExecSync] 开始构建Agent: action_id=%s", action.action_id)
    plan_text = "\n".join(f"{i + 1}. {step}" for i, step in enumerate(action.execution_plan))
    task_msg = f"请执行以下任务：{action.title}\n\n详细描述：{action.description}\n\n"
    if plan_text:
        task_msg += f"建议步骤：\n{plan_text}\n\n"
    task_msg += "请开始执行，每完成一步用 [STEP] 标记进展。"

    service = _create_executor_agent(task_msg)
    logger.info("[FLOW][ExecSync] Agent已创建, 开始stream_response: action_id=%s", action.action_id)

    steps: list[ExecutionStep] = [
        ExecutionStep(label=s, status="pending") for s in action.execution_plan
    ]
    if not steps:
        steps = [ExecutionStep(label="执行任务", status="running")]
    else:
        steps[0].status = "running"
    update_execution_steps(action.action_id, steps)

    parts: list[str] = []
    current_step_idx = 0

    for chunk in service.stream_response(task_msg, include_tool_events=True):
        if "\n[TOOL_EVENT:" in chunk:
            continue
        parts.append(chunk)

        if "[STEP]" in chunk:
            if current_step_idx < len(steps):
                steps[current_step_idx].status = "done"
            current_step_idx += 1
            if current_step_idx < len(steps):
                steps[current_step_idx].status = "running"
            else:
                step_label_match = re.search(r"\[STEP\]\s*(.+)", chunk)
                label = step_label_match.group(1).strip() if step_label_match else "执行中..."
                steps.append(ExecutionStep(label=label, status="running"))
            update_execution_steps(action.action_id, steps)

    for step in steps:
        if step.status == "running":
            step.status = "done"
    update_execution_steps(action.action_id, steps)

    raw = "".join(parts)
    return re.sub(r"\n\[TOOL_EVENT:.*?\]\n", "", raw).strip()


async def execute_action(action_id: str) -> bool:
    """Start background execution for a pending action. Returns False if not found."""
    logger.info("[FLOW][ExecEngine] 准备启动: action_id=%s", action_id)
    action = get_action(action_id)
    if action is None:
        logger.warning("[FLOW][ExecEngine] action不存在: action_id=%s → return False", action_id)
        return False

    update_action_status(action_id, ActionStatus.EXECUTING)
    logger.info(
        "[FLOW][ExecEngine] 状态→EXECUTING: action_id=%s, title=%s", action_id, action.title
    )

    async def _run() -> None:
        try:
            logger.info(
                "[FLOW][ExecEngine] sub-agent线程开始: action_id=%s, plan_steps=%d",
                action_id,
                len(action.execution_plan),
            )
            result_text = await asyncio.to_thread(_run_executor_sync, action)
            set_execution_result(action_id, result_text)
            logger.info(
                "[FLOW][ExecEngine] ✓ 执行完成: action_id=%s, result_len=%d",
                action_id,
                len(result_text),
            )
            title_max = 40
            title = f"任务完成：{action.title}"
            if len(title) > title_max:
                title = title[: title_max - 3] + "..."
            add_notification(
                notification_id=f"exec_done_{action_id}",
                title=title,
                content=result_text[:500],
                timestamp=get_utc_now(),
                notification_type="execution_complete",
            )
        except Exception:
            logger.exception("[FLOW][ExecEngine] ✗ 执行失败: action_id=%s", action_id)
            update_action_status(action_id, ActionStatus.FAILED)
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
