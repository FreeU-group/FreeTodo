from __future__ import annotations

import re

from schemas.perception_todo_intent import (
    ExtractedTodoCandidate,
    IntegrationAction,
    MemoryMatchAction,
    TodoIntegrationResult,
)
from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()

_NON_WORD_RE = re.compile(r"[^\w\s]", re.UNICODE)
_MULTI_SPACE_RE = re.compile(r"\s+")


def resolve_todo_id_by_name(matched_name: str | None) -> int | None:
    """Resolve matched_todo_name to todo_id by searching active todos."""
    if not (matched_name or "").strip():
        return None
    try:
        from repositories.sql_todo_repository import SqlTodoRepository  # noqa: PLC0415
        from storage.database import db_base  # noqa: PLC0415

        repo = SqlTodoRepository(db_base)
        candidates = repo.search(keyword=matched_name.strip(), limit=10, offset=0, status="active")
        if not candidates:
            return None
        normalized = _MULTI_SPACE_RE.sub(" ", _NON_WORD_RE.sub(" ", matched_name.lower())).strip()
        for todo in candidates:
            name = (todo.get("name") or "").strip()
            if not name:
                continue
            todo_norm = _MULTI_SPACE_RE.sub(" ", _NON_WORD_RE.sub(" ", name.lower())).strip()
            if todo_norm == normalized or normalized in todo_norm or todo_norm in normalized:
                return int(todo["id"])
        return int(candidates[0]["id"]) if candidates else None
    except Exception:
        logger.debug("Failed to resolve todo by name", exc_info=True)
        return None


def candidate_to_update_kwargs(candidate: ExtractedTodoCandidate) -> dict:
    """Build update kwargs from candidate fields (only non-empty values)."""
    kwargs: dict = {}
    if candidate.name:
        kwargs["name"] = candidate.name.strip()
    for val, store_field in [
        (candidate.description, "description"),
        (candidate.who_founder, "who_founder"),
        (candidate.who_executor, "who_executor"),
        (candidate.where, "location"),
    ]:
        if val is not None:
            stripped = val.strip() if isinstance(val, str) else val
            kwargs[store_field] = stripped or None
    for field, val in [
        ("start_time", candidate.start_time),
        ("due", candidate.due),
        ("deadline", candidate.deadline),
    ]:
        if val is not None:
            kwargs[field] = val
    if candidate.priority and candidate.priority != "none":
        kwargs["priority"] = candidate.priority
    if candidate.tags:
        kwargs["tags"] = candidate.tags
    return kwargs


async def apply_direct_update(
    candidate: ExtractedTodoCandidate,
    match_action: MemoryMatchAction,
    dedupe_key: str,
    dispatch_fallback,
    push_notification,
) -> TodoIntegrationResult:
    """Apply direct todo update for update_existing / complete_existing / cancel_existing."""
    matched_name = candidate.memory_match.matched_todo_name
    todo_id = resolve_todo_id_by_name(matched_name)
    if not todo_id:
        logger.warning(
            "[Integration] Direct update: cannot resolve todo for %r, falling back to Agno",
            matched_name,
        )
        return await dispatch_fallback(candidate, dedupe_key)

    try:
        from repositories.sql_todo_repository import SqlTodoRepository  # noqa: PLC0415
        from storage.database import db_base  # noqa: PLC0415

        repo = SqlTodoRepository(db_base)
        if match_action == MemoryMatchAction.COMPLETE_EXISTING:
            ok = repo.update(todo_id, status="completed", completed_at=get_utc_now())
            action_label = "completed"
        elif match_action == MemoryMatchAction.CANCEL_EXISTING:
            ok = repo.update(todo_id, status="canceled")
            action_label = "canceled"
        else:
            kwargs = candidate_to_update_kwargs(candidate)
            kwargs.pop("name", None)
            if not kwargs:
                logger.info(
                    "[Integration] update_existing: no fields to update for %r", matched_name
                )
                return TodoIntegrationResult(
                    action=IntegrationAction.SKIPPED,
                    todo_id=todo_id,
                    dedupe_key=dedupe_key,
                    reason="update_existing_no_changes",
                )
            ok = repo.update(todo_id, **kwargs)
            action_label = "updated"

        if ok:
            logger.info(
                "[Integration] Direct update OK: todo_id=%s action=%s", todo_id, action_label
            )
            type_map = {"completed": "complete", "canceled": "cancel", "updated": "update"}
            push_notification(
                candidate,
                f"已{action_label}待办：{matched_name or candidate.name}",
                notification_type=type_map.get(action_label, "update"),
            )
            return TodoIntegrationResult(
                action=IntegrationAction.UPDATED,
                todo_id=todo_id,
                dedupe_key=dedupe_key,
                reason=f"direct_{action_label}",
            )
    except Exception:
        logger.exception("[Integration] Direct update failed for todo_id=%s", todo_id)
        return TodoIntegrationResult(
            action=IntegrationAction.QUEUED_REVIEW,
            todo_id=todo_id,
            dedupe_key=dedupe_key,
            reason="direct_update_failed",
        )

    return TodoIntegrationResult(
        action=IntegrationAction.QUEUED_REVIEW,
        todo_id=todo_id,
        dedupe_key=dedupe_key,
        reason="direct_update_no_effect",
    )
