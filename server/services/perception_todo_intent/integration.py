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
    "update_todo",
    "complete_todo",
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
                result = await _apply_direct_update(candidate, match_action, dedupe_key)
                results.append(result)
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
# Direct update (bypass Agno for update/complete/cancel)
# ---------------------------------------------------------------------------


def _resolve_todo_id_by_name(matched_name: str | None) -> int | None:
    """Resolve matched_todo_name to todo_id by searching active todos."""
    if not (matched_name or "").strip():
        return None
    try:
        from repositories.sql_todo_repository import SqlTodoRepository  # noqa: PLC0415
        from storage.database import db_base  # noqa: PLC0415

        repo = SqlTodoRepository(db_base)
        candidates = repo.search(
            keyword=matched_name.strip(),
            limit=10,
            offset=0,
            status="active",
        )
        if not candidates:
            return None
        normalized = _NON_WORD_RE.sub(" ", matched_name.lower())
        normalized = _MULTI_SPACE_RE.sub(" ", normalized).strip()
        for todo in candidates:
            name = (todo.get("name") or "").strip()
            if not name:
                continue
            todo_norm = _NON_WORD_RE.sub(" ", name.lower())
            todo_norm = _MULTI_SPACE_RE.sub(" ", todo_norm).strip()
            if todo_norm == normalized or normalized in todo_norm or todo_norm in normalized:
                return int(todo["id"])
        return int(candidates[0]["id"]) if candidates else None
    except Exception:
        logger.debug("Failed to resolve todo by name", exc_info=True)
        return None


def _candidate_to_update_kwargs(candidate: ExtractedTodoCandidate) -> dict:
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


async def _apply_direct_update(
    candidate: ExtractedTodoCandidate,
    match_action: MemoryMatchAction,
    dedupe_key: str,
) -> TodoIntegrationResult:
    """Apply direct todo update for update_existing / complete_existing / cancel_existing."""
    matched_name = candidate.memory_match.matched_todo_name
    todo_id = _resolve_todo_id_by_name(matched_name)
    if not todo_id:
        logger.warning(
            "[Integration] Direct update: cannot resolve todo for %r, falling back to Agno",
            matched_name,
        )
        return await _dispatch_to_agno(candidate, dedupe_key)

    try:
        from repositories.sql_todo_repository import SqlTodoRepository  # noqa: PLC0415
        from storage.database import db_base  # noqa: PLC0415

        repo = SqlTodoRepository(db_base)
        if match_action == MemoryMatchAction.COMPLETE_EXISTING:
            ok = repo.update(
                todo_id,
                status="completed",
                completed_at=get_utc_now(),
            )
            action_label = "completed"
        elif match_action == MemoryMatchAction.CANCEL_EXISTING:
            ok = repo.update(todo_id, status="canceled")
            action_label = "canceled"
        else:
            kwargs = _candidate_to_update_kwargs(candidate)
            # For update_existing the candidate name describes the change intent
            # (e.g. "调整截止时间到4月1日"), not a new todo name — drop it to
            # avoid silently renaming the existing todo.
            kwargs.pop("name", None)
            if not kwargs:
                logger.info(
                    "[Integration] update_existing: no fields to update for %r",
                    matched_name,
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
                "[Integration] Direct update OK: todo_id=%s action=%s",
                todo_id,
                action_label,
            )
            type_map = {
                "completed": "complete",
                "canceled": "cancel",
                "updated": "update",
            }
            _push_notification(
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
        logger.exception(
            "[Integration] Direct update failed for todo_id=%s",
            todo_id,
        )
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


# ---------------------------------------------------------------------------
# Agno dispatch
# ---------------------------------------------------------------------------


def _candidate_fields(candidate: ExtractedTodoCandidate) -> list[str]:
    """Format candidate metadata fields into lines."""
    parts: list[str] = [f"标题：{candidate.name}"]

    def add_opt(val: str | None, label: str) -> None:
        if val:
            parts.append(f"{label}：{val}")

    add_opt(candidate.who_founder, "发起人")
    add_opt(candidate.who_executor, "执行者")
    add_opt(candidate.description, "描述")
    if candidate.start_time:
        parts.append(f"开始时间：{candidate.start_time.isoformat()}")
    if candidate.due:
        parts.append(f"截止时间：{candidate.due.isoformat()}")
    if candidate.deadline:
        parts.append(f"最后期限：{candidate.deadline.isoformat()}")
    if candidate.priority and candidate.priority != "none":
        parts.append(f"优先级：{candidate.priority}")
    add_opt(candidate.where, "地点")
    clean_tags = [t for t in (candidate.tags or []) if t != "auto-detected"]
    if clean_tags:
        parts.append(f"标签：{', '.join(clean_tags)}")
    if candidate.source_text:
        parts.append(f"原文引用：「{candidate.source_text}」")
    return parts


def _memory_match_instruction(candidate: ExtractedTodoCandidate) -> str:
    """Return an action-specific instruction based on memory_match."""
    action = candidate.memory_match.action
    matched = candidate.memory_match.matched_todo_name or "未知"
    reason = candidate.memory_match.reason or ""
    if action == MemoryMatchAction.CONFLICT:
        return (
            f"\n注意：该意图与已有待办「{matched}」存在时间冲突。{reason}\n"
            "请先检查冲突情况，再决定是否创建待办，并在描述或 user_notes 中注明冲突。"
        )
    if action == MemoryMatchAction.CANCEL_EXISTING:
        return f"\n用户表示不再需要已有待办「{matched}」。\n请帮用户将该待办标记为取消。"
    if action == MemoryMatchAction.UPDATE_EXISTING:
        return (
            f"\n用户要求修改已有待办「{matched}」。{reason}\n"
            "请先用 search_todos 找到该待办，再用 update_todo 更新对应字段（如截止时间、描述、优先级等）。\n"
            "不要创建新待办。"
        )
    if action == MemoryMatchAction.COMPLETE_EXISTING:
        return (
            f"\n用户表示已有待办「{matched}」已完成。{reason}\n"
            "请先用 search_todos 找到该待办，再用 complete_todo 将其标记为完成。\n"
            "不要创建新待办。"
        )
    return (
        "\n**你必须调用 create_todo 工具来创建待办事项，这是强制要求。**"
        "\n若有发起人/执行者，请使用 create_todo 的 who_founder 和 who_executor 参数传入。"
    )


_USER_FACING_INSTRUCTION = (
    "\n\n重要：1) 你必须先调用 create_todo 工具创建待办，不能只输出文字而不调用工具。"
    "\n2) 工具调用完成后，你的文字回复将直接展示给用户看，请用简洁友好的语气告知用户待办已创建。"
)


def _build_agno_message(candidate: ExtractedTodoCandidate) -> str:
    """Build a message describing the detected intent for Agno to act on."""
    if candidate.intent_type == IntentType.INVITATION:
        return _build_invitation_message(candidate)
    lines = ["[自动意图识别] 系统从用户的感知流中检测到以下待办意图："]
    lines.extend(_candidate_fields(candidate))
    lines.append(_memory_match_instruction(candidate))
    lines.append(_USER_FACING_INSTRUCTION)
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
    if candidate.where:
        lines.append(f"地点：{candidate.where}")

    lines.append("")
    lines.append("请按以下步骤处理：")
    lines.append("1. 调用 check_schedule_conflict 检查用户该时段是否有冲突。")
    lines.append("2. 如果有冲突，调用 find_free_slots 找出当天的空闲时段。")
    if candidate.where:
        lines.append(f"3. 调用 search_nearby_places 搜索「{candidate.where}」附近的推荐地点。")
    else:
        lines.append("3. 如果邀约涉及餐饮，调用 search_nearby_places 搜索附近餐厅推荐。")
    lines.append("4. 综合以上信息，调用 draft_reply_message 为用户草拟一条得体的回复消息。")
    lines.append("5. 如果没有冲突，也请帮用户创建对应的待办事项。")
    lines.append(_USER_FACING_INSTRUCTION)
    return "\n".join(lines)


def _select_tools(candidate: ExtractedTodoCandidate) -> list[str]:
    if candidate.intent_type == IntentType.INVITATION:
        return list(_AGNO_TOOLS_FOR_INVITATION)
    return list(_AGNO_TOOLS_FOR_TODO)


_agno_cache: dict[tuple[str, ...], object] = {}
_agno_cache_lock = __import__("threading").Lock()


def _get_agno_service(tools: list[str]) -> object:
    """Return a cached AgnoAgentService for the given tool set."""
    from llm.agno_agent import AgnoAgentService  # noqa: PLC0415

    key = tuple(sorted(tools))
    with _agno_cache_lock:
        service = _agno_cache.get(key)
        if service is not None:
            return service

    logger.info("[Agno] Creating AgnoAgentService with tools=%s (first time)", tools)
    service = AgnoAgentService(lang="zh", selected_tools=tools)
    with _agno_cache_lock:
        _agno_cache[key] = service
    return service


def _run_agno_sync(message: str, tools: list[str]) -> str:
    """Run Agno agent synchronously and collect the full text response."""
    service = _get_agno_service(tools)
    logger.info("[Agno] Sending message (%d chars), streaming response...", len(message))
    response_parts: list[str] = []
    for chunk in service.stream_response(message, include_tool_events=False):
        response_parts.append(chunk)
    full_response = "".join(response_parts)
    logger.info("[Agno] Response complete: %d chars", len(full_response))
    return full_response


def _build_invitation_header(candidate: ExtractedTodoCandidate) -> list[str]:
    """Build header parts for invitation intent."""
    inviter = candidate.inviter or "对方"
    parts = [f"{inviter}邀请你：{candidate.name}"]
    if candidate.who_executor:
        parts.append(f"执行者：{candidate.who_executor}")
    if candidate.start_time:
        parts.append(f"时间：{candidate.start_time.strftime('%m月%d日 %H:%M')}")
    if candidate.where:
        parts.append(f"地点：{candidate.where}")
    return parts


def _build_todo_header(candidate: ExtractedTodoCandidate) -> list[str]:
    """Build header parts for todo intent."""
    parts: list[str] = []
    if candidate.who_founder:
        parts.append(f"发起人：{candidate.who_founder}")
    if candidate.who_executor:
        parts.append(f"执行者：{candidate.who_executor}")
    if candidate.description:
        parts.append(candidate.description)
    if candidate.start_time:
        parts.append(f"时间：{candidate.start_time.strftime('%m月%d日 %H:%M')}")
    if candidate.due:
        parts.append(f"截止：{candidate.due.strftime('%m月%d日 %H:%M')}")
    prio_map = {"high": "高", "medium": "中", "low": "低"}
    if candidate.priority and candidate.priority != "none":
        parts.append(f"优先级：{prio_map.get(candidate.priority, candidate.priority)}")
    return parts


def _build_user_facing_content(candidate: ExtractedTodoCandidate, agno_response: str) -> str:
    """Build user-facing notification: metadata header + Agno's full analysis."""
    if candidate.intent_type == IntentType.INVITATION:
        header_parts = _build_invitation_header(candidate)
    else:
        header_parts = _build_todo_header(candidate)
    header = "\n".join(header_parts) if header_parts else candidate.name
    analysis = agno_response.strip()
    return header if not analysis else f"{header}\n\n{analysis}"


_NOTIFICATION_TYPE_META: dict[str, tuple[str, str]] = {
    "auto_todo": ("自动待办", "auto_todo"),
    "invitation": ("邀约助手", "invitation"),
    "conflict": ("日程冲突", "conflict"),
    "update": ("待办调整", "update"),
    "complete": ("待办完成", "complete"),
    "cancel": ("待办取消", "cancel"),
}


def _push_notification(
    candidate: ExtractedTodoCandidate,
    response: str,
    *,
    notification_type: str | None = None,
) -> None:
    """Write user-facing notification into storage for signal-sensor popup display."""
    from storage.notification_storage import add_notification  # noqa: PLC0415

    if notification_type is None:
        if candidate.intent_type == IntentType.INVITATION:
            notification_type = "invitation"
        elif candidate.memory_match.action == MemoryMatchAction.CONFLICT:
            notification_type = "conflict"
        else:
            notification_type = "auto_todo"

    label, ntype = _NOTIFICATION_TYPE_META.get(notification_type, ("自动待办", "auto_todo"))
    title = f"{label}：{candidate.name}"
    content = _build_user_facing_content(candidate, response)
    notification_id = f"intent_{uuid4().hex[:12]}"

    logger.info(
        "[Notification] Writing notification: id=%s type=%s title=%r content_len=%d",
        notification_id,
        ntype,
        title,
        len(content),
    )
    added = add_notification(
        notification_id=notification_id,
        title=title,
        content=content,
        timestamp=get_utc_now(),
        notification_type=ntype,
    )
    if added:
        logger.info("[Notification] Notification %s stored successfully", notification_id)
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
