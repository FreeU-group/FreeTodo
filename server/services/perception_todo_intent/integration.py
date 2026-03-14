from __future__ import annotations

import asyncio
import hashlib
import re
from collections import OrderedDict
from uuid import uuid4

from schemas.perception_todo_intent import (
    ExtractedTodoCandidate,
    IntegrationAction,
    IntentGateDecision,
    IntentType,
    MemoryMatchAction,
    TodoIntegrationResult,
    TodoIntentContext,
)
from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()

_NON_WORD_RE = re.compile(r"[^\w\s]", re.UNICODE)
_MULTI_SPACE_RE = re.compile(r"\s+")

_AGNO_TOOLS_FOR_TODO = [
    "create_todo",
    "list_todos",
    "search_todos",
    "check_schedule_conflict",
    "parse_time",
]

_AGNO_TOOLS_FOR_INVITATION = [
    *_AGNO_TOOLS_FOR_TODO,
    "find_free_slots",
    "search_nearby_places",
    "draft_reply_message",
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
                "[Integration] Candidate %d/%d: name=%r intent_type=%s inviter=%s "
                "location=%s memory_match=%s confidence=%.2f",
                i + 1,
                len(candidates),
                candidate.name,
                candidate.intent_type.value,
                candidate.inviter,
                candidate.location,
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

            logger.info(
                "[Integration] Dispatching %r to Agno (intent_type=%s)...",
                candidate.name,
                candidate.intent_type.value,
            )
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
    if candidate.intent_type == IntentType.INVITATION:
        return _build_invitation_message(candidate)
    lines = ["[自动意图识别] 系统从用户的感知流中检测到以下待办意图："]
    lines.extend(_candidate_fields(candidate))
    lines.append(_memory_match_instruction(candidate))
    return "\n".join(lines)


def _build_invitation_message(candidate: ExtractedTodoCandidate) -> str:
    """Build a scheduling-coordination prompt for invitation intents."""
    lines = [
        "[自动意图识别 — 邀约] 系统从用户的感知流中检测到一条邀约：",
        "",
    ]
    lines.extend(_candidate_fields(candidate))

    if candidate.inviter:
        lines.append(f"邀请人：{candidate.inviter}")
    if candidate.location:
        lines.append(f"地点：{candidate.location}")

    lines.append("")
    lines.append("请按以下步骤处理：")
    lines.append("1. 调用 check_schedule_conflict 检查用户该时段是否有冲突。")
    lines.append("2. 如果有冲突，调用 find_free_slots 找出当天的空闲时段。")
    if candidate.location:
        lines.append(f"3. 调用 search_nearby_places 搜索「{candidate.location}」附近的推荐地点。")
    else:
        lines.append("3. 如果邀约涉及餐饮，调用 search_nearby_places 搜索附近餐厅推荐。")
    lines.append("4. 综合以上信息，调用 draft_reply_message 为用户草拟一条得体的回复消息。")
    lines.append("5. 如果没有冲突，也请帮用户创建对应的待办事项。")
    lines.append("")
    lines.append("请用结构化的方式汇总所有分析结果。")
    return "\n".join(lines)


def _select_tools(candidate: ExtractedTodoCandidate) -> list[str]:
    if candidate.intent_type == IntentType.INVITATION:
        return list(_AGNO_TOOLS_FOR_INVITATION)
    return list(_AGNO_TOOLS_FOR_TODO)


def _run_agno_sync(message: str, tools: list[str]) -> str:
    """Run Agno agent synchronously and collect the full text response."""
    from llm.agno_agent import AgnoAgentService  # noqa: PLC0415

    logger.info("[Agno] Creating AgnoAgentService with tools=%s", tools)
    service = AgnoAgentService(
        lang="zh",
        selected_tools=tools,
    )
    logger.info("[Agno] Sending message (%d chars), streaming response...", len(message))
    response_parts: list[str] = []
    for chunk in service.stream_response(message, include_tool_events=False):
        response_parts.append(chunk)
    full_response = "".join(response_parts)
    logger.info("[Agno] Response complete: %d chars", len(full_response))
    return full_response


def _push_notification(candidate: ExtractedTodoCandidate, response: str) -> None:
    """Write Agno's response into the notification storage for frontend display."""
    from storage.notification_storage import add_notification  # noqa: PLC0415

    is_invitation = candidate.intent_type == IntentType.INVITATION
    title = f"📨 邀约助手：{candidate.name}" if is_invitation else f"✅ 自动待办：{candidate.name}"
    notification_id = f"intent_{uuid4().hex[:12]}"

    logger.info(
        "[Notification] Writing notification: id=%s title=%r content_len=%d",
        notification_id,
        title,
        len(response),
    )
    added = add_notification(
        notification_id=notification_id,
        title=title,
        content=response,
        timestamp=get_utc_now(),
    )
    if added:
        logger.info("[Notification] ✓ Notification %s stored successfully", notification_id)
    else:
        logger.warning("[Notification] Notification %s was duplicate, not stored", notification_id)


async def _dispatch_to_agno(
    candidate: ExtractedTodoCandidate,
    dedupe_key: str,
) -> TodoIntegrationResult:
    """Dispatch an extracted intent to Agno agent for execution."""
    try:
        message = _build_agno_message(candidate)
        tools = _select_tools(candidate)
        logger.info(
            "[Dispatch] Building Agno message for %r: intent_type=%s, tools=%s, msg_len=%d",
            candidate.name,
            candidate.intent_type.value,
            tools,
            len(message),
        )
        logger.debug("[Dispatch] Full message:\n%s", message)

        response = await asyncio.to_thread(_run_agno_sync, message, tools)

        logger.info(
            "[Dispatch] ✓ Agno completed for %r (type=%s): response=%d chars",
            candidate.name,
            candidate.intent_type.value,
            len(response),
        )
        logger.info("[Dispatch] Response preview: %s", response[:500])

        _push_notification(candidate, response)

        return TodoIntegrationResult(
            action=IntegrationAction.CREATED,
            dedupe_key=dedupe_key,
            reason="dispatched_to_agno",
        )
    except Exception:
        logger.exception("[Dispatch] ✗ FAILED to dispatch intent to Agno: %s", candidate.name)
        return TodoIntegrationResult(
            action=IntegrationAction.QUEUED_REVIEW,
            dedupe_key=dedupe_key,
            reason="agno_dispatch_failed",
        )
