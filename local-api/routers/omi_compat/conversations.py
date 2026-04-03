"""Omi-compatible conversation (memory/event) API.

Maps omi's ``/v1/conversations`` endpoints to LifeTrace's internal
Event + Memory systems.
"""

from __future__ import annotations

import functools
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.dependencies import get_chat_service
from routers.omi_compat.auth import verify_token
from util.logging_config import get_logger

if TYPE_CHECKING:
    from services.chat_service import ChatService

logger = get_logger()

router = APIRouter(tags=["omi-conversations"])


@functools.lru_cache(maxsize=1)
def _get_event_repo():
    """Lazy-init a cached SqlEventRepository."""
    from repositories.sql_event_repository import SqlEventRepository
    from storage.database_base import DatabaseBase

    return SqlEventRepository(DatabaseBase())


# ---------------------------------------------------------------------------
# Pydantic models (omi-compatible response shapes)
# ---------------------------------------------------------------------------


class TranscriptSegment(BaseModel):
    id: int = 0
    text: str = ""
    speaker_id: str = "SPEAKER_00"
    is_user: bool = True
    person_id: str | None = None
    start: float = 0.0
    end: float = 0.0


class ActionItem(BaseModel):
    description: str = ""
    completed: bool = False


class Structured(BaseModel):
    title: str = ""
    overview: str = ""
    emoji: str = ""
    action_items: list[ActionItem] = Field(default_factory=list)
    events: list[dict] = Field(default_factory=list)


class Geolocation(BaseModel):
    latitude: float = 0.0
    longitude: float = 0.0
    address: str | None = None


class OmiConversation(BaseModel):
    """Trimmed omi Conversation model for list/detail responses."""

    id: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    status: str = "completed"
    structured: Structured = Field(default_factory=Structured)
    transcript_segments: list[TranscriptSegment] = Field(default_factory=list)
    geolocation: Geolocation | None = None
    source: str = "omi"
    visibility: str = "private"
    discarded: bool = False
    deleted: bool = False
    starred: bool = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _iso(dt: datetime | None) -> str:
    if dt is None:
        return datetime.now(tz=UTC).isoformat()
    return dt.isoformat() if dt.tzinfo else dt.replace(tzinfo=UTC).isoformat()


def _event_to_conversation(row: dict[str, Any]) -> OmiConversation:
    """Convert a LifeTrace Event dict into an omi-compatible Conversation."""
    meta = row.get("metadata") or {}
    segments_raw = meta.get("segments", [])
    segments = [TranscriptSegment(**s) if isinstance(s, dict) else s for s in segments_raw]

    structured_raw = meta.get("structured")
    structured = (
        Structured(**structured_raw)
        if isinstance(structured_raw, dict)
        else Structured(
            title=row.get("title", ""),
            overview=row.get("content", ""),
        )
    )

    ts = row.get("timestamp") or row.get("created_at")
    ts_str = _iso(ts) if isinstance(ts, datetime) else str(ts) if ts else _iso(None)

    return OmiConversation(
        id=str(row.get("event_id", row.get("id", ""))),
        created_at=ts_str,
        started_at=ts_str,
        finished_at=ts_str,
        status="completed",
        structured=structured,
        transcript_segments=segments,
        source=row.get("source", "omi"),
        starred=bool(row.get("starred", False)),
    )


def _chat_summary_to_conversation(
    summary: dict[str, Any], chat_service: ChatService
) -> OmiConversation:
    session_id = str(summary.get("session_id", ""))
    title = str(summary.get("title") or "会话")
    overview = ""
    try:
        messages = chat_service.get_messages(session_id=session_id, limit=50, offset=0)
        for msg in reversed(messages):
            if str(msg.get("role", "")).lower() in {"assistant", "ai"}:
                overview = str(msg.get("content", "") or "")
                break
        if not overview and messages:
            overview = str(messages[-1].get("content", "") or "")
    except Exception:
        overview = ""

    last_active = summary.get("last_active")
    ts_str = _iso(last_active) if isinstance(last_active, datetime) else _iso(None)

    return OmiConversation(
        id=session_id,
        created_at=ts_str,
        started_at=ts_str,
        finished_at=ts_str,
        status="completed",
        structured=Structured(
            title=title,
            overview=overview,
            emoji="",
            action_items=[],
            events=[],
        ),
        transcript_segments=[],
        source="omi",
        starred=False,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/v1/conversations", response_model=list[OmiConversation])
async def list_conversations(
    limit: int = 100,
    offset: int = 0,
    statuses: str | None = "processing,completed",
    uid: str = Depends(verify_token),
    chat_service: ChatService = Depends(get_chat_service),
):
    """Return conversations (mapped from LifeTrace Events)."""
    try:
        repo = _get_event_repo()
        rows = repo.list_events(
            limit=limit,
            offset=offset,
            start_date=None,
            end_date=None,
            app_name=None,
        )
        if rows:
            return [_event_to_conversation(r) for r in rows]

        summaries = chat_service.get_chat_summaries(chat_type="event", limit=limit)
        sliced = summaries[offset : offset + limit]
        return [_chat_summary_to_conversation(s, chat_service) for s in sliced]
    except Exception as e:
        logger.error(f"[omi-compat] list_conversations error: {e}")
        return []


@router.get("/v1/conversations/{conversation_id}", response_model=OmiConversation)
async def get_conversation(
    conversation_id: str,
    uid: str = Depends(verify_token),
    chat_service: ChatService = Depends(get_chat_service),
):
    try:
        chat = chat_service.get_chat_by_session_id(conversation_id)
        if chat:
            summary = {
                "session_id": conversation_id,
                "title": chat.get("title") or "会话",
                "last_active": chat.get("last_message_at") or chat.get("created_at"),
            }
            return _chat_summary_to_conversation(summary, chat_service)

        try:
            event_id = int(conversation_id)
        except ValueError:
            raise HTTPException(status_code=404, detail="Conversation not found") from None

        repo = _get_event_repo()
        row = repo.get_summary(event_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return _event_to_conversation(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[omi-compat] get_conversation error: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from None


@router.delete("/v1/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    uid: str = Depends(verify_token),
    chat_service: ChatService = Depends(get_chat_service),
):
    # Prefer deleting chat session directly so app/web stay in sync.
    deleted = chat_service.delete_chat(conversation_id)
    if deleted:
        return {"status": "ok"}
    return {"status": "not_found"}


# ---------------------------------------------------------------------------
# Sub-resource stubs (action-items, segments, etc.)
# ---------------------------------------------------------------------------


@router.get("/v1/conversations/{conversation_id}/action-items")
async def conversation_action_items(
    conversation_id: str,
    uid: str = Depends(verify_token),
):
    return []


@router.get("/v1/conversations/{conversation_id}/segments/text")
async def conversation_segments_text(
    conversation_id: str,
    uid: str = Depends(verify_token),
):
    return ""


@router.get("/v1/conversations/{conversation_id}/transcripts")
async def conversation_transcripts(
    conversation_id: str,
    uid: str = Depends(verify_token),
):
    return []


@router.get("/v1/conversations/{conversation_id}/events")
async def conversation_events(
    conversation_id: str,
    uid: str = Depends(verify_token),
):
    return []


@router.get("/v1/conversations/{conversation_id}/suggested-apps")
async def conversation_suggested_apps(
    conversation_id: str,
    uid: str = Depends(verify_token),
):
    return []


@router.post("/v1/conversations/search")
async def search_conversations(uid: str = Depends(verify_token)):
    return []


@router.post("/v1/conversations")
async def create_conversation(
    uid: str = Depends(verify_token),
    chat_service: ChatService = Depends(get_chat_service),
):
    session_id = f"omi-mobile:{uid}:{int(datetime.now(UTC).timestamp() * 1000)}"
    chat_service.ensure_chat_exists(session_id=session_id, chat_type="event", title="新会话")
    return {"id": session_id, "status": "created"}
