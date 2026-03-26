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
from services.perception_todo_intent.agno_dispatch import dispatch_to_agno, push_notification
from services.perception_todo_intent.direct_update import apply_direct_update
from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()

_NON_WORD_RE = re.compile(r"[^\w\s]", re.UNICODE)
_MULTI_SPACE_RE = re.compile(r"\s+")


class TodoIntentIntegrationService:
    """Integrate extracted todo candidates via Agno agent."""

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
            logger.info("[Integration] No candidates to integrate, skipping")
            return [
                TodoIntegrationResult(
                    action=IntegrationAction.SKIPPED,
                    reason="no_candidates",
                )
            ]

        logger.info(
            "[Integration] Processing %d candidate(s)",
            len(candidates),
        )
        now_ts = get_utc_now().timestamp()
        self._evict_expired(now_ts)

        results: list[TodoIntegrationResult] = []
        for i, candidate in enumerate(candidates):
            logger.info(
                "[Integration] Candidate %d/%d: name=%r founder=%s executor=%s "
                "intent_type=%s inviter=%s where=%s memory_match=%s confidence=%.2f",
                i + 1,
                len(candidates),
                candidate.name,
                candidate.who_founder or "-",
                candidate.who_executor or "-",
                candidate.intent_type.value,
                candidate.inviter,
                candidate.where,
                candidate.memory_match.action.value,
                candidate.confidence,
            )

            dedupe_key = self._candidate_dedupe_key(candidate)
            expires_at = self._cache.get(dedupe_key)
            if expires_at and expires_at > now_ts:
                self._cache.move_to_end(dedupe_key, last=True)
                logger.info(
                    "[Integration] SKIPPED (dedupe): %r key=%s",
                    candidate.name,
                    dedupe_key[:12],
                )
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

            if match_action == MemoryMatchAction.LINK_EXISTING:
                logger.info(
                    "[Integration] SKIPPED (link_existing): %r -> %s",
                    candidate.name,
                    candidate.memory_match.matched_todo_name or "?",
                )
                results.append(
                    TodoIntegrationResult(
                        action=IntegrationAction.SKIPPED,
                        dedupe_key=dedupe_key,
                        reason=f"link_existing:{candidate.memory_match.matched_todo_name or '?'}",
                    )
                )
                continue

            if match_action in (
                MemoryMatchAction.UPDATE_EXISTING,
                MemoryMatchAction.COMPLETE_EXISTING,
                MemoryMatchAction.CANCEL_EXISTING,
            ):
                result = await apply_direct_update(
                    candidate,
                    match_action,
                    dedupe_key,
                    dispatch_to_agno,
                    push_notification,
                )
                results.append(result)
                continue

            logger.info(
                "[Integration] Dispatching %r to Agno (intent_type=%s)...",
                candidate.name,
                candidate.intent_type.value,
            )
            result = await dispatch_to_agno(candidate, dedupe_key)
            results.append(result)

        return results
