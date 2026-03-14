from __future__ import annotations

import asyncio
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

_AGNO_TOOLS_FOR_INTENT = [
    "create_todo",
    "list_todos",
    "search_todos",
    "check_schedule_conflict",
    "parse_time",
]


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

            if match_action == MemoryMatchAction.LINK_EXISTING:
                results.append(
                    TodoIntegrationResult(
                        action=IntegrationAction.SKIPPED,
                        dedupe_key=dedupe_key,
                        reason=f"link_existing:{candidate.memory_match.matched_todo_name or '?'}",
                    )
                )
                continue

            result = await _dispatch_to_agno(candidate, dedupe_key)
            results.append(result)

        return results


# ---------------------------------------------------------------------------
# Agno dispatch
# ---------------------------------------------------------------------------


def _candidate_fields(candidate: ExtractedTodoCandidate) -> list[str]:
    """Format candidate metadata fields into lines."""
    parts: list[str] = [f"标题：{candidate.name}"]
    if candidate.description:
        parts.append(f"描述：{candidate.description}")
    if candidate.start_time:
        parts.append(f"开始时间：{candidate.start_time.isoformat()}")
    if candidate.due:
        parts.append(f"截止时间：{candidate.due.isoformat()}")
    if candidate.deadline:
        parts.append(f"最后期限：{candidate.deadline.isoformat()}")
    if candidate.priority and candidate.priority != "none":
        parts.append(f"优先级：{candidate.priority}")
    clean_tags = [t for t in (candidate.tags or []) if t != "auto-detected"]
    if clean_tags:
        parts.append(f"标签：{', '.join(clean_tags)}")
    if candidate.source_text:
        parts.append(f"原文引用：「{candidate.source_text}」")
    return parts


def _memory_match_instruction(candidate: ExtractedTodoCandidate) -> str:
    """Return an action-specific instruction based on memory_match."""
    action = candidate.memory_match.action
    if action == MemoryMatchAction.CONFLICT:
        matched = candidate.memory_match.matched_todo_name or "未知"
        reason = candidate.memory_match.reason or ""
        return (
            f"\n注意：该意图与已有待办「{matched}」存在时间冲突。{reason}\n"
            "请先检查冲突情况，再决定是否创建待办，并在描述中注明冲突。"
        )
    if action == MemoryMatchAction.CANCEL_EXISTING:
        matched = candidate.memory_match.matched_todo_name or "未知"
        return f"\n用户表示不再需要已有待办「{matched}」。\n请帮用户将该待办标记为取消。"
    return "\n请根据以上信息为用户创建待办事项。"


def _build_agno_message(candidate: ExtractedTodoCandidate) -> str:
    """Build a message describing the detected intent for Agno to act on."""
    lines = ["[自动意图识别] 系统从用户的感知流中检测到以下待办意图："]
    lines.extend(_candidate_fields(candidate))
    lines.append(_memory_match_instruction(candidate))
    return "\n".join(lines)


def _run_agno_sync(message: str) -> str:
    """Run Agno agent synchronously and collect the full text response."""
    from llm.agno_agent import AgnoAgentService  # noqa: PLC0415

    service = AgnoAgentService(
        lang="zh",
        selected_tools=list(_AGNO_TOOLS_FOR_INTENT),
    )
    response_parts: list[str] = []
    for chunk in service.stream_response(message, include_tool_events=False):
        response_parts.append(chunk)
    return "".join(response_parts)


async def _dispatch_to_agno(
    candidate: ExtractedTodoCandidate,
    dedupe_key: str,
) -> TodoIntegrationResult:
    """Dispatch an extracted intent to Agno agent for execution."""
    try:
        message = _build_agno_message(candidate)
        response = await asyncio.to_thread(_run_agno_sync, message)
        logger.info(
            "Agno handled intent %r (action=%s): %s",
            candidate.name,
            candidate.memory_match.action.value,
            response[:300],
        )
        return TodoIntegrationResult(
            action=IntegrationAction.CREATED,
            dedupe_key=dedupe_key,
            reason="dispatched_to_agno",
        )
    except Exception:
        logger.exception("Failed to dispatch intent to Agno: %s", candidate.name)
        return TodoIntegrationResult(
            action=IntegrationAction.QUEUED_REVIEW,
            dedupe_key=dedupe_key,
            reason="agno_dispatch_failed",
        )
