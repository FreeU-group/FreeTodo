from __future__ import annotations

import hashlib
import re
from collections import OrderedDict

from schemas.perception_todo_intent import (
    ExtractedTodoCandidate,
    IntegrationAction,
    IntentGateDecision,
    MemoryMatchAction,
    TodoIntegrationResult,
    TodoIntentContext,
)
from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()

_NON_WORD_RE = re.compile(r"[^\w\s]", re.UNICODE)
_MULTI_SPACE_RE = re.compile(r"\s+")


class TodoIntentIntegrationService:
    """Integrate extracted todo candidates into the real Todo system."""

    def __init__(
        self,
        *,
        dedupe_window_seconds: int = 600,
        max_cache_size: int = 5000,
    ):
        self._dedupe_window_seconds = max(1, int(dedupe_window_seconds))
        self._max_cache_size = max(1, int(max_cache_size))
        self._cache: OrderedDict[str, float] = OrderedDict()

    @staticmethod
    def _normalize_text(text: str | None) -> str:
        normalized = _NON_WORD_RE.sub(" ", (text or "").lower())
        return _MULTI_SPACE_RE.sub(" ", normalized).strip()

    def _candidate_dedupe_key(self, candidate: ExtractedTodoCandidate) -> str:
        raw = "|".join(
            [
                self._normalize_text(candidate.name),
                candidate.due.isoformat() if candidate.due else "",
                self._normalize_text(candidate.source_text),
            ]
        )
        return hashlib.sha1(raw.encode("utf-8"), usedforsecurity=False).hexdigest()

    def _evict_expired(self, now_ts: float) -> None:
        for key, expires_at in list(self._cache.items()):
            if expires_at <= now_ts:
                self._cache.pop(key, None)

    def _evict_overflow(self) -> None:
        while len(self._cache) > self._max_cache_size:
            self._cache.popitem(last=False)

    async def integrate(
        self,
        *,
        context: TodoIntentContext,
        gate_decision: IntentGateDecision,
        candidates: list[ExtractedTodoCandidate],
    ) -> list[TodoIntegrationResult]:
        _ = context
        _ = gate_decision
        if not candidates:
            return [
                TodoIntegrationResult(
                    action=IntegrationAction.SKIPPED,
                    reason="no_candidates",
                )
            ]

        now_ts = get_utc_now().timestamp()
        self._evict_expired(now_ts)

        results: list[TodoIntegrationResult] = []
        for candidate in candidates:
            dedupe_key = self._candidate_dedupe_key(candidate)
            expires_at = self._cache.get(dedupe_key)
            if expires_at and expires_at > now_ts:
                self._cache.move_to_end(dedupe_key, last=True)
                results.append(
                    TodoIntegrationResult(
                        action=IntegrationAction.SKIPPED,
                        dedupe_key=dedupe_key,
                        reason="duplicate_in_memory_window",
                    )
                )
                continue

            self._cache[dedupe_key] = now_ts + self._dedupe_window_seconds
            self._cache.move_to_end(dedupe_key, last=True)
            self._evict_overflow()

            match_action = candidate.memory_match.action
            result = self._apply_memory_match(candidate, dedupe_key, match_action)
            results.append(result)

        return results

    @staticmethod
    def _apply_memory_match(
        candidate: ExtractedTodoCandidate,
        dedupe_key: str,
        match_action: MemoryMatchAction,
    ) -> TodoIntegrationResult:
        """Route based on MemoryMatchAction: create, skip, or queue for review."""
        if match_action == MemoryMatchAction.LINK_EXISTING:
            return TodoIntegrationResult(
                action=IntegrationAction.SKIPPED,
                dedupe_key=dedupe_key,
                reason=f"link_existing:{candidate.memory_match.matched_todo_name or '?'}",
            )

        if match_action == MemoryMatchAction.CANCEL_EXISTING:
            logger.info(
                f"Intent requests cancellation of existing todo: {candidate.memory_match.matched_todo_name}"
            )
            return TodoIntegrationResult(
                action=IntegrationAction.QUEUED_REVIEW,
                dedupe_key=dedupe_key,
                reason=f"cancel_existing:{candidate.memory_match.matched_todo_name or '?'}",
            )

        if match_action == MemoryMatchAction.CONFLICT:
            return TodoIntegrationResult(
                action=IntegrationAction.QUEUED_REVIEW,
                dedupe_key=dedupe_key,
                reason=(
                    f"conflict:{candidate.memory_match.matched_todo_name or '?'}"
                    f" — {candidate.memory_match.reason or ''}"
                ),
            )

        # NEW — actually create the todo in DB
        return _create_todo_from_candidate(candidate, dedupe_key)


def _build_todo_service():
    """Build a TodoService instance outside of FastAPI dependency injection."""
    from repositories.sql_todo_repository import SqlTodoRepository  # noqa: PLC0415
    from services.todo_service import TodoService  # noqa: PLC0415
    from storage.database import db_base  # noqa: PLC0415

    repo = SqlTodoRepository(db_base)
    return TodoService(repo)


_PRIORITY_MAP = {
    "high": "high",
    "medium": "medium",
    "low": "low",
}


def _create_todo_from_candidate(
    candidate: ExtractedTodoCandidate,
    dedupe_key: str,
) -> TodoIntegrationResult:
    """Convert an ExtractedTodoCandidate to a real Todo via TodoService."""
    try:
        from schemas.todo import TodoCreate, TodoPriority, TodoStatus  # noqa: PLC0415

        priority_str = (candidate.priority or "none").lower()
        priority = TodoPriority(_PRIORITY_MAP.get(priority_str, "none"))

        tags = list(candidate.tags) if candidate.tags else []
        tags.append("auto-detected")

        create_data = TodoCreate.model_validate(
            {
                "name": candidate.name,
                "description": candidate.description,
                "start_time": candidate.start_time,
                "due": candidate.due,
                "deadline": candidate.deadline,
                "time_zone": candidate.time_zone,
                "priority": priority,
                "tags": tags,
                "status": TodoStatus.DRAFT,
            }
        )

        service = _build_todo_service()
        todo_resp = service.create_todo(create_data)

        logger.info(
            f"Auto-created todo id={todo_resp.id} name={candidate.name!r} from intent extraction"
        )
        return TodoIntegrationResult(
            action=IntegrationAction.CREATED,
            todo_id=todo_resp.id,
            dedupe_key=dedupe_key,
            reason="auto_created",
        )
    except Exception:
        logger.exception(f"Failed to create todo from candidate: {candidate.name}")
        return TodoIntegrationResult(
            action=IntegrationAction.QUEUED_REVIEW,
            dedupe_key=dedupe_key,
            reason="create_failed_queued_review",
        )
