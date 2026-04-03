"""Plan Runner - execution and rollback."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections import deque
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from llm.agno_plan.plan_actions import CompletedStep, PlanActionExecutor
from llm.llm_client import LLMClient
from repositories.sql_todo_repository import SqlTodoRepository
from storage.agent_plan_manager import AgentPlanStepPayload
from storage.database import db_base
from util.logging_config import get_logger
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Callable

    from schemas.agent_plan import PlanSpec, PlanStep
    from storage.agent_plan_manager import AgentPlanManager

logger = get_logger()

PLAN_EVENT_PREFIX = "\n[PLAN_EVENT:"
PLAN_EVENT_SUFFIX = "]\n"

STEP_STATUS_PENDING = "pending"
STEP_STATUS_RUNNING = "running"
STEP_STATUS_SUCCESS = "success"
STEP_STATUS_FAILED = "failed"
STEP_STATUS_SKIPPED = "skipped"
STEP_STATUS_ROLLBACKING = "rollbacking"
STEP_STATUS_ROLLED_BACK = "rolled_back"

RUN_STATUS_RUNNING = "running"
RUN_STATUS_COMPLETED = "completed"
RUN_STATUS_FAILED = "failed"
RUN_STATUS_CANCELLED = "cancelled"


@dataclass
class StepResult:
    step_id: str
    status: str
    on_fail: str
    completed_at: float


class PlanRunner:
    """Plan Runner"""

    def __init__(
        self,
        plan_manager: AgentPlanManager,
        llm_client: LLMClient | None = None,
        workspace_path: str | None = None,
    ) -> None:
        self.plan_manager = plan_manager
        self.llm_client = llm_client or LLMClient()
        todo_repo = SqlTodoRepository(db_base)
        self.actions = PlanActionExecutor(
            plan_manager,
            todo_repo,
            workspace_path=workspace_path,
        )

    def format_event(self, payload: dict[str, Any]) -> str:
        return f"{PLAN_EVENT_PREFIX}{json.dumps(payload, ensure_ascii=False)}{PLAN_EVENT_SUFFIX}"

    def validate_plan(self, plan: PlanSpec) -> None:
        step_ids = {step.step_id for step in plan.steps}
        if len(step_ids) != len(plan.steps):
            raise ValueError("duplicate step_id detected")
        for step in plan.steps:
            for dep in step.depends_on:
                if dep not in step_ids:
                    raise ValueError(f"missing dependency: {dep}")
        self._topo_levels(plan.steps)

    async def run_plan_stream(
        self,
        *,
        plan: PlanSpec,
        session_id: str | None = None,
        run_id: str | None = None,
        resume: bool = False,
    ) -> AsyncGenerator[str, None]:
        """Run plan and stream events."""
        event_queue: asyncio.Queue[str | None] = asyncio.Queue()

        async def emit(payload: dict[str, Any]) -> None:
            await event_queue.put(self.format_event(payload))

        runner_task = asyncio.create_task(
            self._run_plan(
                plan=plan,
                session_id=session_id,
                run_id=run_id,
                resume=resume,
                emit=emit,
            )
        )

        while True:
            if runner_task.done() and event_queue.empty():
                break
            payload = await event_queue.get()
            if payload is None:
                break
            yield payload

        try:
            await runner_task
        except Exception as exc:
            logger.error(f"Plan stream failed: {exc}")

    async def _run_plan(
        self,
        *,
        plan: PlanSpec,
        session_id: str | None,
        run_id: str | None,
        resume: bool,
        emit: Callable[[dict[str, Any]], Any],
    ) -> None:
        self.validate_plan(plan)
        run_id = self._ensure_run(plan, session_id, run_id, resume)
        await emit(
            {
                "type": "plan_started",
                "plan_id": plan.plan_id,
                "run_id": run_id,
                "timestamp": get_utc_now().isoformat(),
            }
        )

        completed_ids, completed_steps = self._load_resume_state(run_id, resume)

        try:
            for level in self._topo_levels(plan.steps):
                if await self._handle_cancel(plan, run_id, emit):
                    return
                results = await self._execute_level(level, plan, run_id, completed_ids, emit)
                completed_steps, completed_ids = self._collect_results(
                    results, completed_steps, completed_ids
                )

            await self._finalize_success(plan, run_id, emit)
        except Exception as exc:
            await self._finalize_failure(plan, run_id, exc, completed_steps, emit)

    def _ensure_run(
        self,
        plan: PlanSpec,
        session_id: str | None,
        run_id: str | None,
        resume: bool,
    ) -> str:
        if resume and run_id:
            run_info = self.plan_manager.get_run(run_id)
            if not run_info:
                raise ValueError("run_id not found")
            if run_info["status"] in (RUN_STATUS_COMPLETED, RUN_STATUS_CANCELLED):
                raise ValueError("run already finished")
            self.plan_manager.update_run(
                run_id,
                status=RUN_STATUS_RUNNING,
                error=None,
                ended_at=None,
                cancel_requested=False,
            )
            return run_id

        new_run_id = f"run_{uuid.uuid4().hex[:12]}"
        run_info = self.plan_manager.create_run(
            run_id=new_run_id,
            plan_id=plan.plan_id,
            status=RUN_STATUS_RUNNING,
            session_id=session_id,
        )
        if not run_info:
            raise RuntimeError("failed to create run")
        return new_run_id

    def _load_resume_state(self, run_id: str, resume: bool) -> tuple[set[str], list[StepResult]]:
        if not resume:
            return set(), []
        completed_steps: list[StepResult] = []
        completed_ids: set[str] = set()
        for step in self.plan_manager.list_steps(run_id):
            if step["status"] not in (STEP_STATUS_SUCCESS, STEP_STATUS_SKIPPED):
                continue
            completed_ids.add(step["step_id"])
            completed_steps.append(
                StepResult(
                    step_id=step["step_id"],
                    status=step["status"],
                    on_fail="skip",
                    completed_at=step["ended_at"].timestamp() if step["ended_at"] else 0.0,
                )
            )
        return completed_ids, completed_steps

    async def _handle_cancel(
        self,
        plan: PlanSpec,
        run_id: str,
        emit: Callable[[dict[str, Any]], Any],
    ) -> bool:
        if not self._is_cancel_requested(run_id):
            return False
        self.plan_manager.update_run(run_id, status=RUN_STATUS_CANCELLED, ended_at=get_utc_now())
        await emit(
            {
                "type": "plan_cancelled",
                "plan_id": plan.plan_id,
                "run_id": run_id,
                "timestamp": get_utc_now().isoformat(),
            }
        )
        return True

    async def _execute_level(
        self,
        level: list[PlanStep],
        plan: PlanSpec,
        run_id: str,
        completed_ids: set[str],
        emit: Callable[[dict[str, Any]], Any],
    ) -> list[StepResult | None]:
        tasks: list[asyncio.Task[StepResult | None]] = []
        for step in level:
            if step.step_id in completed_ids:
                continue
            tasks.append(asyncio.create_task(self._execute_step(step, plan, run_id, emit)))
        if not tasks:
            return []
        return await asyncio.gather(*tasks)

    def _collect_results(
        self,
        results: list[StepResult | None],
        completed_steps: list[StepResult],
        completed_ids: set[str],
    ) -> tuple[list[StepResult], set[str]]:
        for result in results:
            if result is None:
                continue
            if result.status in (STEP_STATUS_SUCCESS, STEP_STATUS_SKIPPED):
                completed_steps.append(result)
                completed_ids.add(result.step_id)
                continue
            if result.status == STEP_STATUS_FAILED and result.on_fail != "skip":
                raise RuntimeError(f"step_failed:{result.step_id}")
        return completed_steps, completed_ids

    async def _finalize_success(
        self,
        plan: PlanSpec,
        run_id: str,
        emit: Callable[[dict[str, Any]], Any],
    ) -> None:
        self.plan_manager.update_run(run_id, status=RUN_STATUS_COMPLETED, ended_at=get_utc_now())
        await emit(
            {
                "type": "plan_completed",
                "plan_id": plan.plan_id,
                "run_id": run_id,
                "timestamp": get_utc_now().isoformat(),
            }
        )

    async def _finalize_failure(
        self,
        plan: PlanSpec,
        run_id: str,
        exc: Exception,
        completed_steps: list[StepResult],
        emit: Callable[[dict[str, Any]], Any],
    ) -> None:
        logger.error(f"Plan execution failed: {exc}")
        self.plan_manager.update_run(
            run_id,
            status=RUN_STATUS_FAILED,
            error=str(exc),
            ended_at=get_utc_now(),
        )
        await emit(
            {
                "type": "plan_failed",
                "plan_id": plan.plan_id,
                "run_id": run_id,
                "error": str(exc),
                "timestamp": get_utc_now().isoformat(),
            }
        )
        rollback_steps = [
            CompletedStep(step_id=step.step_id, completed_at=step.completed_at)
            for step in completed_steps
            if step.status in (STEP_STATUS_SUCCESS, STEP_STATUS_SKIPPED)
        ]
        await self.actions.rollback(run_id, rollback_steps, emit)

    async def _execute_step(
        self,
        step: PlanStep,
        plan: PlanSpec,
        run_id: str,
        emit: Callable[[dict[str, Any]], Any],
    ) -> StepResult:
        retry_policy = step.retry
        max_retries = retry_policy.max_retries if retry_policy else 0
        backoff_ms = retry_policy.backoff_ms if retry_policy else 0

        is_side_effect = self.actions.is_side_effect(step)
        start_time = get_utc_now()
        self.plan_manager.upsert_step(
            AgentPlanStepPayload(
                run_id=run_id,
                step_id=step.step_id,
                step_name=step.name,
                status=STEP_STATUS_RUNNING,
                retry_count=0,
                input_json=json.dumps(step.inputs, ensure_ascii=False),
                started_at=start_time,
                is_side_effect=is_side_effect,
                rollback_required=self.actions.requires_rollback(step),
            )
        )
        await emit(
            {
                "type": "step_started",
                "plan_id": plan.plan_id,
                "run_id": run_id,
                "step_id": step.step_id,
                "status": STEP_STATUS_RUNNING,
                "timestamp": start_time.isoformat(),
            }
        )

        attempt = 0
        last_error: str | None = None
        while attempt <= max_retries:
            attempt += 1
            try:
                output = await self._execute_step_logic(step, run_id)
                end_time = get_utc_now()
                self.plan_manager.upsert_step(
                    AgentPlanStepPayload(
                        run_id=run_id,
                        step_id=step.step_id,
                        step_name=step.name,
                        status=STEP_STATUS_SUCCESS,
                        retry_count=attempt - 1,
                        output_json=json.dumps(output, ensure_ascii=False),
                        ended_at=end_time,
                        is_side_effect=is_side_effect,
                        rollback_required=self.actions.requires_rollback(step),
                    )
                )
                await emit(
                    {
                        "type": "step_completed",
                        "plan_id": plan.plan_id,
                        "run_id": run_id,
                        "step_id": step.step_id,
                        "status": STEP_STATUS_SUCCESS,
                        "timestamp": end_time.isoformat(),
                    }
                )
                return StepResult(
                    step_id=step.step_id,
                    status=STEP_STATUS_SUCCESS,
                    on_fail=step.on_fail,
                    completed_at=end_time.timestamp(),
                )
            except Exception as exc:
                last_error = str(exc)
                if attempt <= max_retries:
                    await emit(
                        {
                            "type": "step_retry",
                            "plan_id": plan.plan_id,
                            "run_id": run_id,
                            "step_id": step.step_id,
                            "retry_count": attempt,
                        }
                    )
                    if backoff_ms:
                        await asyncio.sleep(backoff_ms / 1000)
                    continue

                end_time = get_utc_now()
                self.plan_manager.upsert_step(
                    AgentPlanStepPayload(
                        run_id=run_id,
                        step_id=step.step_id,
                        step_name=step.name,
                        status=STEP_STATUS_FAILED,
                        retry_count=attempt - 1,
                        error=last_error,
                        ended_at=end_time,
                        is_side_effect=is_side_effect,
                        rollback_required=self.actions.requires_rollback(step),
                    )
                )
                await emit(
                    {
                        "type": "step_failed",
                        "plan_id": plan.plan_id,
                        "run_id": run_id,
                        "step_id": step.step_id,
                        "status": STEP_STATUS_FAILED,
                        "error": last_error,
                        "timestamp": end_time.isoformat(),
                    }
                )

                if step.on_fail == "skip":
                    return StepResult(
                        step_id=step.step_id,
                        status=STEP_STATUS_SKIPPED,
                        on_fail=step.on_fail,
                        completed_at=end_time.timestamp(),
                    )

                return StepResult(
                    step_id=step.step_id,
                    status=STEP_STATUS_FAILED,
                    on_fail=step.on_fail,
                    completed_at=end_time.timestamp(),
                )

        raise RuntimeError(last_error or "step_failed")

    async def _execute_step_logic(self, step: PlanStep, run_id: str) -> dict[str, Any]:
        if step.type == "tool":
            return self.actions.execute_tool(step, run_id)
        if step.type == "llm":
            return await self._execute_llm(step)
        if step.type == "condition":
            return self._execute_condition(step)
        raise ValueError(f"unsupported step type: {step.type}")

    async def _execute_llm(self, step: PlanStep) -> dict[str, Any]:
        messages = step.inputs.get("messages")
        if not messages:
            prompt = step.inputs.get("prompt") or ""
            system_prompt = step.inputs.get("system_prompt")
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
        response = await self.llm_client.async_chat(messages=messages, temperature=0.2)
        return {"content": response}

    def _execute_condition(self, step: PlanStep) -> dict[str, Any]:
        value = step.inputs.get("value")
        if isinstance(value, bool):
            return {"value": value}
        expression = step.inputs.get("expression")
        if isinstance(expression, bool):
            return {"value": expression}
        return {"value": False}

    def _topo_levels(self, steps: list[PlanStep]) -> list[list[PlanStep]]:
        step_map = {step.step_id: step for step in steps}
        indegree = {step.step_id: 0 for step in steps}
        graph: dict[str, list[str]] = {}

        for step in steps:
            for dep in step.depends_on:
                graph.setdefault(dep, []).append(step.step_id)
                indegree[step.step_id] += 1

        queue = deque([sid for sid, deg in indegree.items() if deg == 0])
        levels: list[list[PlanStep]] = []
        visited = 0
        while queue:
            level_size = len(queue)
            level_steps: list[PlanStep] = []
            for _ in range(level_size):
                sid = queue.popleft()
                visited += 1
                level_steps.append(step_map[sid])
                for neighbor in graph.get(sid, []):
                    indegree[neighbor] -= 1
                    if indegree[neighbor] == 0:
                        queue.append(neighbor)
            levels.append(level_steps)

        if visited != len(steps):
            raise ValueError("cycle detected in plan")
        return levels

    def _is_cancel_requested(self, run_id: str) -> bool:
        run = self.plan_manager.get_run(run_id)
        return bool(run and run.get("cancel_requested"))
