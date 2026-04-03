"""Agent 执行计划相关的 Pydantic 模型"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, ConfigDict, field_validator


class PlanRetryPolicy(BaseModel):
    max_retries: int = 0
    backoff_ms: int | None = None


class PlanStep(BaseModel):
    model_config = ConfigDict(extra="allow")

    step_id: str
    name: str
    type: Literal["tool", "llm", "condition"]
    tool: str | None = None
    inputs: dict[str, Any] = {}
    depends_on: list[str] = []
    parallel_group: str | None = None
    retry: PlanRetryPolicy | None = None
    on_fail: Literal["stop", "skip"] = "stop"
    is_side_effect: bool | None = None

    @field_validator("tool")
    @classmethod
    def _tool_required_for_tool_step(cls, value: str | None, info):
        if info.data.get("type") == "tool" and not value:
            raise ValueError("tool step requires tool name")
        return value


class PlanSpec(BaseModel):
    plan_id: str
    title: str
    steps: list[PlanStep]


class PlanCreateRequest(BaseModel):
    message: str
    todo_id: int | None = None
    context: dict[str, Any] | None = None
    session_id: str | None = None


class PlanCreateResponse(BaseModel):
    plan: PlanSpec


class PlanRunRequest(BaseModel):
    plan_id: str
    session_id: str | None = None
    resume: bool = False
    run_id: str | None = None
    workspace_path: str | None = None


class PlanRunInfo(BaseModel):
    run_id: str
    plan_id: str
    status: str
    session_id: str | None = None
    error: str | None = None
    rollback_status: str | None = None
    rollback_error: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    cancel_requested: bool = False


class PlanRunStepInfo(BaseModel):
    step_id: str
    step_name: str
    status: str
    retry_count: int
    input_json: str | None = None
    output_json: str | None = None
    error: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    is_side_effect: bool = False
    rollback_required: bool = False


class PlanRunStatusResponse(BaseModel):
    plan: PlanSpec | None = None
    run: PlanRunInfo | None = None
    steps: list[PlanRunStepInfo] = []


if TYPE_CHECKING:
    from datetime import datetime
