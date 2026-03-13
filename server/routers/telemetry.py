from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from util.base_paths import get_user_data_dir


class TelemetryEvent(BaseModel):
    event_name: str = Field(..., min_length=1, description="Event name")
    client_ts: str | None = Field(None, description="Client ISO timestamp")
    session_id: str | None = Field(None, description="Client session id")
    condition: str | None = Field(None, description="Experiment condition")
    modality: str | None = Field(None, description="Input modality")
    task_id: str | None = Field(None, description="Experiment task id")
    message_id: str | None = Field(None, description="Message id")
    todo_count: int | None = Field(None, description="Todo count")
    duration_ms: float | None = Field(None, description="Duration in ms")
    success: bool | None = Field(None, description="Success flag")
    metadata: dict[str, Any] | None = Field(None, description="Extra metadata")


router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


@router.post("/event")
async def ingest_event(event: TelemetryEvent) -> dict[str, bool]:
    payload = event.model_dump()
    payload["server_ts"] = datetime.now(UTC).isoformat()

    telemetry_dir = get_user_data_dir() / "telemetry"
    telemetry_dir.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now(UTC).strftime("%Y-%m-%d")
    log_path = telemetry_dir / f"telemetry-{date_str}.jsonl"

    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")

    return {"ok": True}
