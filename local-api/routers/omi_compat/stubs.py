"""Omi-compatible stub endpoints (apps, payments, goals, folders, etc.).

These return minimal valid responses so the Omi Flutter App does not
encounter 404s for features not yet implemented in LifeTrace.
"""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from core.dependencies import get_chat_service, get_rag_service, get_todo_service
from routers.omi_compat.auth import verify_token
from schemas.todo import TodoCreate, TodoStatus, TodoUpdate

if TYPE_CHECKING:
    from services.chat_service import ChatService
    from services.todo_service import TodoService

router = APIRouter(tags=["omi-stubs"])


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _todo_to_action_item(todo: dict[str, Any]) -> dict[str, Any]:
    due_at = todo.get("due") or todo.get("deadline") or todo.get("start_time")
    status = str(todo.get("status") or "active").lower()
    return {
        "id": str(todo["id"]),
        "description": todo.get("name") or todo.get("summary") or "",
        "completed": status == "completed",
        "status": status,
        "created_at": _iso(todo.get("created_at")),
        "updated_at": _iso(todo.get("updated_at")),
        "due_at": _iso(due_at),
        "completed_at": _iso(todo.get("completed_at")),
        "conversation_id": None,
        "is_locked": False,
        "exported": False,
        "export_date": None,
        "export_platform": None,
        "sort_order": int(todo.get("order") or 0),
        "indent_level": 0,
    }


def _omi_session_id(uid: str, app_id: str | None) -> str:
    app = (app_id or "omi").strip() or "omi"
    return f"omi-mobile:{uid}:{app}"


def _resolve_omi_chat_session_id(uid: str, app_id: str | None, chat_service: ChatService) -> str:
    """Resolve a chat session for OMI mobile.

    - If `app_id` is explicitly provided, keep app-scoped session behavior.
    - Otherwise, prefer the latest non-omi-mobile event chat so web/app can share one thread.
    - Fallback to omi-mobile default session when nothing exists yet.
    """
    normalized_app = (app_id or "").strip()
    if normalized_app and normalized_app not in {"null", "no_selected"}:
        return _omi_session_id(uid, normalized_app)

    summaries = chat_service.get_chat_summaries(chat_type="event", limit=20)
    mobile_prefix = f"omi-mobile:{uid}:"
    for summary in summaries:
        session_id = str(summary.get("session_id") or "").strip()
        if session_id and not session_id.startswith(mobile_prefix):
            return session_id

    if summaries:
        session_id = str(summaries[0].get("session_id") or "").strip()
        if session_id:
            return session_id

    return _omi_session_id(uid, None)


def _chat_msg_to_omi(msg: dict[str, Any]) -> dict[str, Any]:
    role = (msg.get("role") or "").lower()
    sender = "human" if role == "user" else "ai"
    return {
        "id": str(msg.get("id", "")),
        "created_at": _iso(msg.get("created_at")) or _iso(datetime.now(UTC)),
        "text": msg.get("content", ""),
        "sender": sender,
        "type": "text",
        "plugin_id": None,
        "from_integration": False,
        "files": [],
        "files_id": [],
        "memories": [],
        "ask_for_nps": True,
        "rating": None,
        "chart_data": None,
    }


def _encode_done_line(message: dict[str, Any]) -> str:
    payload = base64.b64encode(json.dumps(message, ensure_ascii=False).encode("utf-8")).decode(
        "ascii"
    )
    return f"done: {payload}\n\n"


def _encode_data_line(text: str) -> str:
    return f"data: {text.replace(chr(10), '__CRLF__')}\n\n"


# -- Apps / plugins --------------------------------------------------------


@router.get("/v1/apps/enabled")
async def enabled_apps(uid: str = Depends(verify_token)):
    return []


@router.get("/v2/apps")
async def list_apps(uid: str = Depends(verify_token)):
    return []


@router.get("/v1/apps/popular")
async def popular_apps(uid: str = Depends(verify_token)):
    return []


@router.get("/v1/app-categories")
async def app_categories(uid: str = Depends(verify_token)):
    return []


@router.get("/v1/app-capabilities")
async def app_capabilities(uid: str = Depends(verify_token)):
    return []


@router.get("/v1/apps/proactive-notification-scopes")
async def proactive_scopes(uid: str = Depends(verify_token)):
    return []


@router.post("/v1/apps/enable")
async def enable_app(app_id: str = "", uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/apps/disable")
async def disable_app(app_id: str = "", uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/apps")
async def create_app(request: Request, uid: str = Depends(verify_token)):
    return {"id": "", "status": "created"}


@router.put("/v1/apps/{app_id}")
async def update_app(app_id: str, request: Request, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/apps/{app_id}")
async def get_app(app_id: str, uid: str = Depends(verify_token)):
    return {}


@router.delete("/v1/apps/{app_id}")
async def delete_app(app_id: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/apps/{app_id}/subscription")
async def get_app_sub(app_id: str, uid: str = Depends(verify_token)):
    return {}


@router.post("/v1/apps/{app_id}/subscription")
async def set_app_sub(app_id: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/apps/{app_id}/reviews")
async def get_app_reviews(app_id: str, uid: str = Depends(verify_token)):
    return []


@router.post("/v1/apps/{app_id}/review")
async def add_app_review(app_id: str, request: Request, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/apps/{app_id}/review/reply")
async def reply_review(app_id: str, request: Request, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/apps/{app_id}/keys")
async def list_app_keys(app_id: str, uid: str = Depends(verify_token)):
    return []


@router.post("/v1/apps/{app_id}/keys")
async def create_app_key(app_id: str, uid: str = Depends(verify_token)):
    return {}


@router.delete("/v1/apps/{app_id}/keys/{key_id}")
async def delete_app_key(app_id: str, key_id: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/apps/{app_id}/change-visibility")
async def change_app_visibility(app_id: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/apps/{app_id}/refresh-manifest")
async def refresh_manifest(app_id: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/app/plans")
async def app_plans(uid: str = Depends(verify_token)):
    return []


@router.post("/v1/app/generate-description")
async def gen_description(uid: str = Depends(verify_token)):
    return {"description": ""}


@router.post("/v1/app/generate-description-emoji")
async def gen_emoji(uid: str = Depends(verify_token)):
    return {"emoji": ""}


@router.post("/v1/app/generate-prompts")
async def gen_prompts(uid: str = Depends(verify_token)):
    return {"prompts": []}


@router.post("/v1/app/generate")
async def gen_app(uid: str = Depends(verify_token)):
    return {}


@router.post("/v1/app/generate-icon")
async def gen_icon(uid: str = Depends(verify_token)):
    return {"url": ""}


@router.post("/v1/app/thumbnails")
async def upload_thumbnails(uid: str = Depends(verify_token)):
    return {"urls": []}


@router.post("/v1/app/review")
async def review_app(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/apps/check-username")
async def check_username(username: str = "", uid: str = Depends(verify_token)):
    return {"available": True}


# -- Chat / messages -------------------------------------------------------


def _resolve_chat_session_id(
    uid: str,
    app_id: str | None,
    conversation_id: str | None,
    session_id: str | None,
    chat_service: ChatService,
) -> str:
    direct = (session_id or conversation_id or "").strip()
    if direct:
        return direct
    return _resolve_omi_chat_session_id(uid, app_id, chat_service)


@router.get("/v2/messages")
async def list_messages(
    app_id: str | None = None,
    conversation_id: str | None = None,
    session_id: str | None = None,
    uid: str = Depends(verify_token),
    chat_service: ChatService = Depends(get_chat_service),
):
    resolved_session_id = _resolve_chat_session_id(
        uid=uid,
        app_id=app_id,
        conversation_id=conversation_id,
        session_id=session_id,
        chat_service=chat_service,
    )
    messages = chat_service.get_messages(resolved_session_id)
    return JSONResponse(
        content=[_chat_msg_to_omi(m) for m in messages],
        headers={"X-Session-Id": resolved_session_id},
    )


@router.post("/v2/messages")
async def send_message(
    request: Request,
    app_id: str | None = None,
    conversation_id: str | None = None,
    session_id: str | None = None,
    uid: str = Depends(verify_token),
    chat_service: ChatService = Depends(get_chat_service),
):
    body = await request.json()
    text = str(body.get("text", "")).strip()
    if not text:
        return StreamingResponse(
            iter(["error: empty message\n\n"]),
            media_type="text/plain; charset=utf-8",
        )

    resolved_session_id = _resolve_chat_session_id(
        uid=uid,
        app_id=app_id,
        conversation_id=conversation_id,
        session_id=session_id,
        chat_service=chat_service,
    )
    chat_service.ensure_chat_exists(resolved_session_id, chat_type="event")
    chat_service.add_message(session_id=resolved_session_id, role="user", content=text)

    rag_service = get_rag_service()

    def _stream():
        answer_chunks: list[str] = []
        try:
            for chunk in rag_service.stream_query(text):
                piece = str(chunk or "")
                if not piece:
                    continue
                answer_chunks.append(piece)
                yield _encode_data_line(piece)
        except Exception as exc:
            yield f"error: {exc!s}\n\n"
            return

        answer = "".join(answer_chunks).strip()
        if not answer:
            answer = "暂时无法生成回复，请稍后重试。"

        persisted = chat_service.add_message(
            session_id=resolved_session_id, role="assistant", content=answer
        )
        assistant = _chat_msg_to_omi(
            {
                "id": (persisted or {}).get(
                    "id", f"assistant-{int(datetime.now(UTC).timestamp() * 1000)}"
                ),
                "role": "assistant",
                "content": answer,
                "created_at": (persisted or {}).get("created_at", datetime.now(UTC)),
            }
        )
        yield _encode_done_line(assistant)

    return StreamingResponse(
        _stream(),
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Session-Id": resolved_session_id,
        },
    )


@router.get("/v2/initial-message")
@router.post("/v2/initial-message")
async def initial_message(uid: str = Depends(verify_token)):
    now = datetime.now(UTC)
    return {
        "id": f"initial-{int(now.timestamp() * 1000)}",
        "created_at": _iso(now),
        "text": "你好，我已经连接到你的 LifeTrace 中心节点。",
        "sender": "ai",
        "type": "text",
        "plugin_id": None,
        "from_integration": False,
        "files": [],
        "files_id": [],
        "memories": [],
        "ask_for_nps": False,
        "rating": None,
        "chart_data": None,
    }


@router.delete("/v2/messages")
async def clear_messages(
    app_id: str | None = None,
    conversation_id: str | None = None,
    session_id: str | None = None,
    uid: str = Depends(verify_token),
    chat_service: ChatService = Depends(get_chat_service),
):
    resolved_session_id = _resolve_chat_session_id(
        uid=uid,
        app_id=app_id,
        conversation_id=conversation_id,
        session_id=session_id,
        chat_service=chat_service,
    )
    chat_service.delete_chat(resolved_session_id)
    now = datetime.now(UTC)
    return JSONResponse(
        content={
            "id": f"cleared-{int(now.timestamp() * 1000)}",
            "created_at": _iso(now),
            "text": "",
            "sender": "ai",
            "type": "text",
            "plugin_id": app_id,
            "from_integration": False,
            "files": [],
            "files_id": [],
            "memories": [],
            "ask_for_nps": False,
            "rating": None,
            "chart_data": None,
        },
        headers={"X-Session-Id": resolved_session_id},
    )


@router.post("/v2/voice-messages")
async def send_voice_message(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v2/files")
async def upload_files(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v2/messages/{message_id}/report")
async def report_message(message_id: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v2/voice-message/transcribe")
async def transcribe_voice(uid: str = Depends(verify_token)):
    return {"text": ""}


# -- Action items ----------------------------------------------------------


@router.get("/v1/action-items")
async def list_action_items(
    request: Request,
    limit: int = 25,
    offset: int = 0,
    completed: bool | None = None,
    status: str | None = None,
    uid: str = Depends(verify_token),
    service: TodoService = Depends(get_todo_service),
):
    if status:
        status = status.strip().lower()
    elif completed is True:
        status = "completed"
    elif completed is False:
        status = "active"

    _ = request.query_params.get("conversation_id")
    _ = request.query_params.get("start_date")
    _ = request.query_params.get("end_date")
    payload = service.list_todos(limit=limit, offset=offset, status=status)
    todos = [t.model_dump() if hasattr(t, "model_dump") else t for t in payload.get("todos", [])]
    total = int(payload.get("total", len(todos)))
    return {
        "action_items": [_todo_to_action_item(todo) for todo in todos],
        "has_more": offset + len(todos) < total,
    }


@router.get("/v1/action-items/{item_id}")
async def get_action_item(
    item_id: int, uid: str = Depends(verify_token), service: TodoService = Depends(get_todo_service)
):
    try:
        todo = service.get_todo(item_id)
    except Exception:
        return JSONResponse(status_code=404, content={"detail": "action item not found"})
    data = todo.model_dump() if hasattr(todo, "model_dump") else dict(todo)
    return _todo_to_action_item(data)


@router.post("/v1/action-items")
async def create_action_item_global(
    request: Request,
    uid: str = Depends(verify_token),
    service: TodoService = Depends(get_todo_service),
):
    body = await request.json()
    description = str(body.get("description") or "").strip()
    if not description:
        return JSONResponse(status_code=400, content={"detail": "description is required"})

    due_raw = body.get("due_at")
    due = (
        datetime.fromisoformat(due_raw.replace("Z", "+00:00"))
        if isinstance(due_raw, str) and due_raw
        else None
    )
    is_completed = bool(body.get("completed", False))
    raw_status = str(body.get("status") or "").strip().lower()
    if raw_status:
        try:
            status = TodoStatus(raw_status)
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": "invalid status"})
    else:
        status = TodoStatus.COMPLETED if is_completed else TodoStatus.ACTIVE

    todo_payload = TodoCreate.model_validate(
        {
            "name": description,
            "description": description,
            "deadline": due,
            "due": due,
            "status": status,
            "uid": f"omi-{uid}-{int(datetime.now(UTC).timestamp() * 1000)}",
        }
    )
    todo = service.create_todo(todo_payload)
    data = todo.model_dump() if hasattr(todo, "model_dump") else dict(todo)
    return _todo_to_action_item(data)


@router.patch("/v1/action-items/{item_id}")
async def patch_action_item_global(
    item_id: int,
    request: Request,
    uid: str = Depends(verify_token),
    service: TodoService = Depends(get_todo_service),
):
    body = await request.json()
    kwargs: dict[str, Any] = {}
    if "description" in body:
        value = (body.get("description") or "").strip()
        kwargs["name"] = value
        kwargs["description"] = value
    if "status" in body:
        raw_status = str(body.get("status") or "").strip().lower()
        if raw_status:
            try:
                kwargs["status"] = TodoStatus(raw_status)
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "invalid status"})
    elif "completed" in body:
        completed = bool(body.get("completed"))
        kwargs["status"] = TodoStatus.COMPLETED if completed else TodoStatus.ACTIVE
    if "due_at" in body:
        due_raw = body.get("due_at")
        if due_raw is None:
            kwargs["due"] = None
            kwargs["deadline"] = None
            kwargs["start_time"] = None
        elif isinstance(due_raw, str) and due_raw:
            due = datetime.fromisoformat(due_raw.replace("Z", "+00:00"))
            kwargs["due"] = due
            kwargs["deadline"] = due
            kwargs["start_time"] = due
    if "sort_order" in body:
        kwargs["order"] = int(body.get("sort_order") or 0)

    todo = service.update_todo(item_id, TodoUpdate.model_validate(kwargs))
    data = todo.model_dump() if hasattr(todo, "model_dump") else dict(todo)
    return _todo_to_action_item(data)


@router.patch("/v1/action-items/{item_id}/completed")
async def patch_action_item_completed(
    item_id: int,
    completed: bool,
    uid: str = Depends(verify_token),
    service: TodoService = Depends(get_todo_service),
):
    status = TodoStatus.COMPLETED if completed else TodoStatus.ACTIVE
    todo = service.update_todo(item_id, TodoUpdate.model_validate({"status": status}))
    data = todo.model_dump() if hasattr(todo, "model_dump") else dict(todo)
    return _todo_to_action_item(data)


@router.patch("/v1/action-items/batch")
async def patch_action_items_batch(
    request: Request,
    uid: str = Depends(verify_token),
    service: TodoService = Depends(get_todo_service),
):
    body = await request.json()
    items = body.get("items") if isinstance(body, dict) else None
    if not isinstance(items, list):
        return JSONResponse(status_code=400, content={"detail": "items must be a list"})

    for item in items:
        if not isinstance(item, dict):
            continue
        item_id = item.get("id")
        if item_id is None:
            continue
        kwargs: dict[str, Any] = {}
        if "sort_order" in item:
            kwargs["order"] = int(item.get("sort_order") or 0)
        if kwargs:
            service.update_todo(int(item_id), TodoUpdate.model_validate(kwargs))
    return {"status": "ok"}


@router.delete("/v1/action-items/{item_id}")
async def delete_action_item_global(
    item_id: int,
    uid: str = Depends(verify_token),
    service: TodoService = Depends(get_todo_service),
):
    service.delete_todo(item_id)
    return Response(status_code=204)
