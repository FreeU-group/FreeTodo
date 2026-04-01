"""Agent plan execution routes."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from llm.agno_plan.plan_builder import PlanBuilder
from llm.agno_plan.plan_runner import PlanRunner
from schemas.agent_plan import (
    PlanCreateRequest,
    PlanCreateResponse,
    PlanRunInfo,
    PlanRunRequest,
    PlanRunStatusResponse,
    PlanRunStepInfo,
    PlanSpec,
)
from storage import todo_mgr
from storage.database import agent_plan_mgr
from util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/agent/plan", tags=["agent_plan"])


def _format_todo_context(context: dict[str, Any]) -> str:  # noqa: C901
    lines: list[str] = []

    def _format_todo(todo: dict[str, Any], prefix: str = "") -> str:
        parts: list[str] = []
        parts.append(f"{prefix}- {todo.get('name', 'Unknown')}")
        description = todo.get("description")
        if description and description.strip():
            parts.append(f"{prefix}  desc: {description}")
        user_notes = todo.get("user_notes")
        if user_notes and user_notes.strip():
            parts.append(f"{prefix}  notes: {user_notes}")
        schedule_start = todo.get("start_time") or todo.get("deadline")
        schedule_end = todo.get("end_time")
        if schedule_start:
            schedule_label = schedule_start
            if schedule_end:
                schedule_label = f"{schedule_start} ~ {schedule_end}"
            parts.append(f"{prefix}  time: {schedule_label}")
        if todo.get("priority") and todo["priority"] != "none":
            parts.append(f"{prefix}  priority: {todo['priority']}")
        if todo.get("tags"):
            parts.append(f"{prefix}  tags: {', '.join(todo['tags'])}")
        if todo.get("status"):
            parts.append(f"{prefix}  status: {todo['status']}")
        return "\n".join(parts)

    current = context.get("current")
    if current:
        lines.append("current:")
        lines.append(_format_todo(current))

    parents = context.get("parents", [])
    if parents:
        lines.append("parents:")
        for i, parent in enumerate(parents):
            indent = "  " * (len(parents) - i - 1)
            lines.append(_format_todo(parent, indent))

    siblings = context.get("siblings", [])
    if siblings:
        lines.append("siblings:")
        for sibling in siblings:
            lines.append(_format_todo(sibling, "  "))

    def _format_children(children: list[dict[str, Any]], depth: int = 0) -> list[str]:
        result: list[str] = []
        for child in children:
            indent = "  " * (depth + 1)
            result.append(_format_todo(child, indent))
            if child.get("children"):
                result.extend(_format_children(child["children"], depth + 1))
        return result

    children = context.get("children", [])
    if children:
        lines.append("children:")
        lines.extend(_format_children(children))

    return "\n".join(lines) if lines else ""


def _build_tools_catalog() -> list[dict[str, Any]]:
    return [
        {
            "name": "list_todos",
            "description": "List todos with optional status filter.",
            "parameters": {"status": "active|completed|canceled", "limit": 50, "offset": 0},
        },
        {
            "name": "create_todo",
            "description": "Create a new todo.",
            "parameters": {"name": "string", "description": "string"},
        },
        {
            "name": "update_todo",
            "description": "Update an existing todo.",
            "parameters": {"todo_id": 1, "name": "string"},
        },
        {
            "name": "delete_todo",
            "description": "Delete a todo by id.",
            "parameters": {"todo_id": 1},
        },
        {
            "name": "write_file",
            "description": "Write content to a file.",
            "parameters": {"path": "path/to/file", "content": "text"},
        },
        {
            "name": "delete_file",
            "description": "Delete a file by path (moves to rollback trash).",
            "parameters": {"path": "path/to/file"},
        },
        {
            "name": "move_file",
            "description": "Move/rename a file.",
            "parameters": {"from_path": "from", "to_path": "to"},
        },
    ]


@router.post("", response_model=PlanCreateResponse)
async def create_plan(request: PlanCreateRequest):
    try:
        context_info = ""
        if request.todo_id is not None:
            context = todo_mgr.get_todo_context(request.todo_id)
            if context:
                context_info = _format_todo_context(context)

        if request.context:
            extra_context = json.dumps(request.context, ensure_ascii=False, indent=2)
            context_info = f"{context_info}\n\nextra:\n{extra_context}".strip()

        builder = PlanBuilder()
        plan = await builder.build_plan(
            message=request.message,
            context_info=context_info or "none",
            tools_catalog=_build_tools_catalog(),
        )

        plan_record = agent_plan_mgr.create_plan(
            plan_id=plan.plan_id,
            title=plan.title,
            spec=plan.model_dump(),
            todo_id=request.todo_id,
            session_id=request.session_id,
        )
        if not plan_record:
            raise RuntimeError("failed to persist plan")

        return PlanCreateResponse(plan=plan)
    except Exception as exc:
        logger.error(f"Failed to build plan: {exc}")
        raise HTTPException(status_code=500, detail="failed to build plan") from exc


@router.post("/run")
async def run_plan(request: PlanRunRequest):
    try:
        plan_record = agent_plan_mgr.get_plan(request.plan_id)
        if not plan_record:
            raise HTTPException(status_code=404, detail="plan not found")
        spec_json = json.loads(plan_record["spec_json"])
        plan = PlanSpec.model_validate(spec_json)

        runner = PlanRunner(agent_plan_mgr, workspace_path=request.workspace_path)
        generator = runner.run_plan_stream(
            plan=plan,
            session_id=request.session_id,
            run_id=request.run_id,
            resume=request.resume,
        )

        headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
        return StreamingResponse(generator, media_type="text/plain; charset=utf-8", headers=headers)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to run plan: {exc}")
        raise HTTPException(status_code=500, detail="failed to run plan") from exc


@router.get("/todo/{todo_id}/latest", response_model=PlanRunStatusResponse)
async def get_latest_plan_for_todo(todo_id: int):
    plan_record = agent_plan_mgr.get_latest_plan_for_todo(todo_id)
    if not plan_record:
        return PlanRunStatusResponse()

    plan = PlanSpec.model_validate(json.loads(plan_record["spec_json"]))
    run_record = agent_plan_mgr.get_latest_run_for_plan(plan.plan_id)
    steps: list[PlanRunStepInfo] = []
    if run_record:
        for step in agent_plan_mgr.list_steps(run_record["run_id"]):
            steps.append(
                PlanRunStepInfo(
                    step_id=step["step_id"],
                    step_name=step["step_name"],
                    status=step["status"],
                    retry_count=step["retry_count"],
                    input_json=step["input_json"],
                    output_json=step["output_json"],
                    error=step["error"],
                    started_at=step["started_at"],
                    ended_at=step["ended_at"],
                    is_side_effect=step["is_side_effect"],
                    rollback_required=step["rollback_required"],
                )
            )

    run_info = None
    if run_record:
        run_info = PlanRunInfo(
            run_id=run_record["run_id"],
            plan_id=run_record["plan_id"],
            status=run_record["status"],
            session_id=run_record["session_id"],
            error=run_record["error"],
            rollback_status=run_record["rollback_status"],
            rollback_error=run_record["rollback_error"],
            started_at=run_record["started_at"],
            ended_at=run_record["ended_at"],
            cancel_requested=run_record["cancel_requested"],
        )

    return PlanRunStatusResponse(plan=plan, run=run_info, steps=steps)


@router.post("/run/{run_id}/cancel")
async def cancel_plan_run(run_id: str):
    if not agent_plan_mgr.request_cancel(run_id):
        raise HTTPException(status_code=404, detail="run not found")
    return {"status": "cancelled"}


@router.post("/run/{run_id}/resume")
async def resume_plan_run(run_id: str):
    run_record = agent_plan_mgr.get_run(run_id)
    if not run_record:
        raise HTTPException(status_code=404, detail="run not found")
    plan_record = agent_plan_mgr.get_plan(run_record["plan_id"])
    if not plan_record:
        raise HTTPException(status_code=404, detail="plan not found")

    plan = PlanSpec.model_validate(json.loads(plan_record["spec_json"]))
    runner = PlanRunner(agent_plan_mgr)
    generator = runner.run_plan_stream(
        plan=plan,
        session_id=run_record["session_id"],
        run_id=run_id,
        resume=True,
    )
    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    return StreamingResponse(generator, media_type="text/plain; charset=utf-8", headers=headers)


@router.post("/run/{run_id}/retry")
async def retry_plan_run(run_id: str):
    run_record = agent_plan_mgr.get_run(run_id)
    if not run_record:
        raise HTTPException(status_code=404, detail="run not found")
    plan_record = agent_plan_mgr.get_plan(run_record["plan_id"])
    if not plan_record:
        raise HTTPException(status_code=404, detail="plan not found")

    plan = PlanSpec.model_validate(json.loads(plan_record["spec_json"]))
    runner = PlanRunner(agent_plan_mgr)
    generator = runner.run_plan_stream(
        plan=plan,
        session_id=run_record["session_id"],
        resume=False,
    )
    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    return StreamingResponse(generator, media_type="text/plain; charset=utf-8", headers=headers)
