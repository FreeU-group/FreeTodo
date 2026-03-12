"""Omi-compatible memory API.

Maps omi's ``/v3/memories`` to LifeTrace's Memory system.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from routers.omi_compat.auth import verify_token
from util.logging_config import get_logger

logger = get_logger()

router = APIRouter(tags=["omi-memories"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class OmiMemory(BaseModel):
    id: str
    content: str
    category: str = "core"
    created_at: str
    updated_at: str | None = None
    reviewed: bool = False
    user_review: bool | None = None
    visibility: str = "private"


class CreateMemoryRequest(BaseModel):
    content: str
    category: str = "core"
    visibility: str = "private"


class EditMemoryRequest(BaseModel):
    value: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _iso(dt: datetime | None) -> str:
    if dt is None:
        return datetime.now(tz=UTC).isoformat()
    return dt.isoformat() if dt.tzinfo else dt.replace(tzinfo=UTC).isoformat()


def _row_to_omi(row: dict[str, Any]) -> OmiMemory:
    ts = row.get("created_at") or row.get("timestamp")
    ts_str = _iso(ts) if isinstance(ts, datetime) else str(ts) if ts else _iso(None)
    return OmiMemory(
        id=str(row.get("memory_id", row.get("id", ""))),
        content=row.get("content", ""),
        category=row.get("category", "core"),
        created_at=ts_str,
        updated_at=ts_str,
        reviewed=bool(row.get("reviewed", False)),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/v3/memories", response_model=list[OmiMemory])
async def list_memories(
    limit: int = 100,
    offset: int = 0,
    uid: str = Depends(verify_token),
):
    try:
        from memory.manager import MemoryManager

        mgr = MemoryManager()
        dates = mgr.reader.list_available_dates()
        results: list[OmiMemory] = []
        for date_str in dates[offset : offset + limit]:
            content = mgr.reader.read_by_date(date_str)
            if content:
                results.append(
                    OmiMemory(
                        id=date_str,
                        content=content[:500],
                        category="core",
                        created_at=f"{date_str}T00:00:00Z",
                        updated_at=f"{date_str}T00:00:00Z",
                    )
                )
        return results
    except Exception as e:
        logger.error(f"[omi-compat] list_memories error: {e}")
        return []


@router.post("/v3/memories", response_model=OmiMemory)
async def create_memory(
    body: CreateMemoryRequest,
    uid: str = Depends(verify_token),
):
    now = _iso(None)
    return OmiMemory(
        id="stub-memory",
        content=body.content,
        category=body.category,
        created_at=now,
        updated_at=now,
    )


@router.delete("/v3/memories/{memory_id}")
async def delete_memory(
    memory_id: str,
    uid: str = Depends(verify_token),
):
    return {"status": "ok"}


@router.patch("/v3/memories/{memory_id}")
async def edit_memory(
    memory_id: str,
    body: EditMemoryRequest,
    uid: str = Depends(verify_token),
):
    return {"status": "ok"}


@router.get("/v3/memories/{memory_id}", response_model=OmiMemory)
async def get_memory(
    memory_id: str,
    uid: str = Depends(verify_token),
):
    try:
        from memory.manager import MemoryManager

        mgr = MemoryManager()
        content = mgr.reader.read_by_date(memory_id)
        if content:
            return OmiMemory(
                id=memory_id,
                content=content[:500],
                category="core",
                created_at=f"{memory_id}T00:00:00Z",
                updated_at=f"{memory_id}T00:00:00Z",
            )
    except Exception as e:
        logger.error(f"[omi-compat] get_memory error: {e}")
    raise HTTPException(status_code=404, detail="Memory not found")


@router.patch("/v3/memories/{memory_id}/visibility")
async def set_memory_visibility(
    memory_id: str,
    value: str = "private",
    uid: str = Depends(verify_token),
):
    return {"status": "ok"}


@router.delete("/v3/memories")
async def delete_all_memories(
    uid: str = Depends(verify_token),
):
    return {"status": "ok"}


@router.post("/v3/upload-audio")
async def upload_audio_stub(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v3/speech-profile/expand")
async def expand_speech_profile(uid: str = Depends(verify_token)):
    return {"status": "ok"}
