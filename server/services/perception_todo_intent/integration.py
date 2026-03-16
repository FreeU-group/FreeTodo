from __future__ import annotations

import asyncio
import hashlib
import re
from collections import OrderedDict
from threading import Lock
from typing import TYPE_CHECKING
from uuid import uuid4

from schemas.perception_todo_intent import (
    ExtractedTodoCandidate,
    IntegrationAction,
    IntentType,
    MemoryMatchAction,
    TodoIntegrationResult,
    TodoIntentContext,
)
from util.logging_config import get_logger
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from llm.agno_agent import AgnoAgentService

logger = get_logger()

_NON_WORD_RE = re.compile(r"[^\w\s]", re.UNICODE)
_MULTI_SPACE_RE = re.compile(r"\s+")

_AGNO_TOOLS_FOR_TODO = [
    "create_todo",
    "update_todo",
    "delete_todo",
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
        candidates: list[ExtractedTodoCandidate],
    ) -> list[TodoIntegrationResult]:
        _ = context
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
            self._cache[dedupe_key] = now_ts + self._dedupe_window_seconds
            self._cache.move_to_end(dedupe_key, last=True)
            self._evict_overflow()

            logger.info(
                "[Integration] Dispatching %r to Agno for CRUD reconciliation (intent_type=%s, match=%s)...",
                candidate.name,
                candidate.intent_type.value,
                candidate.memory_match.action.value,
            )
            result = await _dispatch_to_agno(context, candidate, dedupe_key)
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


def _format_when(candidate: ExtractedTodoCandidate, context: TodoIntentContext) -> str:
    time_parts: list[str] = []
    if candidate.start_time:
        time_parts.append(f"开始：{candidate.start_time.isoformat()}")
    if candidate.due:
        time_parts.append(f"截止：{candidate.due.isoformat()}")
    if candidate.deadline:
        time_parts.append(f"最后期限：{candidate.deadline.isoformat()}")
    if time_parts:
        return "；".join(time_parts)
    return (
        f"上下文时间窗：{context.time_window_start.isoformat()} ~ "
        f"{context.time_window_end.isoformat()}"
    )


def _format_who(candidate: ExtractedTodoCandidate, context: TodoIntentContext) -> str:
    who_parts = ["执行人：用户本人"]
    speaker = str(context.metadata.get("speaker") or "").strip()
    if candidate.inviter:
        who_parts.append(f"相关人：{candidate.inviter}")
    elif speaker:
        who_parts.append(f"相关人：{speaker}")
    app_name = str(context.metadata.get("app_name") or "").strip()
    if app_name:
        who_parts.append(f"来源应用：{app_name}")
    return "；".join(who_parts)


def _format_why(candidate: ExtractedTodoCandidate) -> str:
    if candidate.description:
        return candidate.description
    if candidate.intent_type == IntentType.INVITATION:
        return "因为感知流识别到一条需要回应或安排的邀约，需要进一步跟进。"
    if candidate.source_text:
        return f"因为原始消息中出现了明确待办信号：{candidate.source_text}"
    return "因为感知流自动识别到一条需要跟进的待办意图。"


def _build_message_sources(
    candidate: ExtractedTodoCandidate, context: TodoIntentContext
) -> list[str]:
    metadata = context.metadata if isinstance(context.metadata, dict) else {}
    sources: list[str] = []
    app_name = str(metadata.get("app_name") or "").strip()
    if app_name:
        sources.append(f"- 应用：{app_name}")
    window_title = str(metadata.get("window_title") or "").strip()
    if window_title:
        sources.append(f"- 窗口：{window_title}")
    speaker = str(metadata.get("speaker") or "").strip()
    if speaker:
        sources.append(f"- 说话人：{speaker}")
    chat_type = str(metadata.get("chat_type") or "").strip()
    if chat_type:
        sources.append(f"- 聊天类型：{chat_type}")
    if candidate.source_text:
        sources.append(f"- 证据原文：{candidate.source_text}")
    if candidate.source_event_ids:
        sources.append(f"- 事件ID：{', '.join(candidate.source_event_ids)}")

    event_refs = metadata.get("event_refs")
    if isinstance(event_refs, list):
        for ref in event_refs[:5]:
            if not isinstance(ref, dict):
                continue
            source = str(ref.get("source") or "unknown")
            timestamp = str(ref.get("timestamp") or "")
            event_id = str(ref.get("event_id") or "")
            sources.append(f"- 事件来源：{source} | 时间：{timestamp} | ID：{event_id}")
    return sources or ["- 暂无来源信息，请保留原始消息作为后续补充依据"]


def _build_background_markdown(
    candidate: ExtractedTodoCandidate, context: TodoIntentContext
) -> str:
    what = candidate.description or candidate.source_text or candidate.name
    sections = [
        "## When",
        _format_when(candidate, context),
        "",
        "## Who",
        _format_who(candidate, context),
        "",
        "## What",
        f"任务：{candidate.name}",
        what if what != candidate.name else "请根据原始消息继续补充更细的动作描述。",
        "",
        "## Why",
        _format_why(candidate),
        "",
        "## Message Sources",
        *(_build_message_sources(candidate, context)),
    ]
    return "\n".join(sections).strip()


def _memory_match_instruction(candidate: ExtractedTodoCandidate) -> str:
    """Return an action-specific instruction based on memory_match."""
    action = candidate.memory_match.action
    matched = candidate.memory_match.matched_todo_name or "未知"
    reason = candidate.memory_match.reason or ""
    if action == MemoryMatchAction.LINK_EXISTING:
        return (
            f"\n注意：这条意图与已有待办「{matched}」高度相关。{reason}\n"
            "请先搜索并核对该待办；若只是同一事项，请更新或补充已有待办，不要重复创建。"
        )
    if action == MemoryMatchAction.CONFLICT:
        return (
            f"\n注意：该意图与已有待办「{matched}」存在时间冲突。{reason}\n"
            "请先检查冲突情况，再决定是更新已有待办、创建新待办，还是仅提示用户。"
        )
    if action == MemoryMatchAction.CANCEL_EXISTING:
        return (
            f"\n用户表示不再需要已有待办「{matched}」。{reason}\n"
            "请搜索该待办，并优先将其标记为取消、完成或删除，而不是新建。"
        )
    return "\n请结合现有待办列表执行增删改查：新任务才创建，已有任务优先更新。"


_USER_FACING_INSTRUCTION = (
    "\n\n重要：你的回复将直接展示给用户看，请直接输出结论和建议，"
    "不要输出你的思考过程、推理步骤或工具调用说明。用简洁友好的语气。"
)


def _build_agno_message(candidate: ExtractedTodoCandidate, context: TodoIntentContext) -> str:
    """Build a message describing the detected intent for Agno to act on."""
    if candidate.intent_type == IntentType.INVITATION:
        return _build_invitation_message(candidate, context)
    background_markdown = _build_background_markdown(candidate, context)
    lines = ["[自动意图识别] 系统从用户的感知流中检测到以下待办意图："]
    lines.extend(_candidate_fields(candidate))
    lines.append(_memory_match_instruction(candidate))
    lines.append(
        "请先调用 `search_todos` 或 `list_todos` 核对现有待办，再决定 create/update/delete/complete。"
    )
    lines.append(
        "无论是创建还是更新，最终待办的 `description` 必须完整保留下列 5 个小节：When、Who、What、Why、Message Sources。"
    )
    lines.append("建议写入 description 的背景模板：")
    lines.append(background_markdown)
    lines.append(_USER_FACING_INSTRUCTION)
    return "\n".join(lines)


def _build_invitation_message(
    candidate: ExtractedTodoCandidate,
    context: TodoIntentContext,
) -> str:
    """Build a scheduling-coordination prompt for invitation intents."""
    background_markdown = _build_background_markdown(candidate, context)
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
    lines.append("1. 先调用 search_todos 或 list_todos 核对是否已有相关待办，并按需更新。")
    lines.append("2. 调用 check_schedule_conflict 检查用户该时段是否有冲突。")
    lines.append("3. 如果有冲突，调用 find_free_slots 找出当天的空闲时段。")
    if candidate.location:
        lines.append(f"4. 调用 search_nearby_places 搜索「{candidate.location}」附近的推荐地点。")
    else:
        lines.append("4. 如果邀约涉及餐饮，调用 search_nearby_places 搜索附近餐厅推荐。")
    lines.append("5. 综合以上信息，调用 draft_reply_message 为用户草拟一条得体的回复消息。")
    lines.append("6. 如果没有冲突，也请按实际情况创建或更新对应待办事项。")
    lines.append(
        "7. 无论创建还是更新，description 中必须完整写入 When、Who、What、Why、Message Sources 五个小节。"
    )
    lines.append("建议写入 description 的背景模板：")
    lines.append(background_markdown)
    lines.append(_USER_FACING_INSTRUCTION)
    return "\n".join(lines)


def _select_tools(candidate: ExtractedTodoCandidate) -> list[str]:
    if candidate.intent_type == IntentType.INVITATION:
        return list(_AGNO_TOOLS_FOR_INVITATION)
    return list(_AGNO_TOOLS_FOR_TODO)


_agno_cache: dict[tuple[str, ...], AgnoAgentService] = {}
_agno_cache_lock = Lock()


def _get_agno_service(tools: list[str]) -> AgnoAgentService:
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


def _build_user_facing_content(candidate: ExtractedTodoCandidate, agno_response: str) -> str:
    """Build user-facing notification: metadata header + Agno's full analysis."""
    is_invitation = candidate.intent_type == IntentType.INVITATION
    header_parts: list[str] = []

    if is_invitation:
        inviter = candidate.inviter or "对方"
        header_parts.append(f"{inviter}邀请你：{candidate.name}")
        if candidate.start_time:
            header_parts.append(f"时间：{candidate.start_time.strftime('%m月%d日 %H:%M')}")
        if candidate.location:
            header_parts.append(f"地点：{candidate.location}")
    else:
        if candidate.description:
            header_parts.append(candidate.description)
        if candidate.start_time:
            header_parts.append(f"时间：{candidate.start_time.strftime('%m月%d日 %H:%M')}")
        if candidate.due:
            header_parts.append(f"截止：{candidate.due.strftime('%m月%d日 %H:%M')}")
        prio_map = {"high": "高", "medium": "中", "low": "低"}
        if candidate.priority and candidate.priority != "none":
            header_parts.append(f"优先级：{prio_map.get(candidate.priority, candidate.priority)}")

    header = "\n".join(header_parts) if header_parts else candidate.name
    analysis = agno_response.strip()
    if not analysis:
        return header
    return f"{header}\n\n{analysis}"


def _push_notification(candidate: ExtractedTodoCandidate, response: str) -> None:
    """Write user-facing notification into storage for signal-sensor popup display."""
    from storage.notification_storage import add_notification  # noqa: PLC0415

    is_invitation = candidate.intent_type == IntentType.INVITATION
    title = f"📨 邀约助手：{candidate.name}" if is_invitation else f"✅ 自动待办：{candidate.name}"
    content = _build_user_facing_content(candidate, response)
    notification_id = f"intent_{uuid4().hex[:12]}"

    logger.info(
        "[Notification] Writing notification: id=%s title=%r content_len=%d",
        notification_id,
        title,
        len(content),
    )
    added = add_notification(
        notification_id=notification_id,
        title=title,
        content=content,
        timestamp=get_utc_now(),
    )
    if added:
        logger.info("[Notification] ✓ Notification %s stored successfully", notification_id)
    else:
        logger.warning("[Notification] Notification %s was duplicate, not stored", notification_id)


async def _dispatch_to_agno(
    context: TodoIntentContext,
    candidate: ExtractedTodoCandidate,
    dedupe_key: str,
) -> TodoIntegrationResult:
    """Dispatch an extracted intent to Agno agent for execution."""
    try:
        message = _build_agno_message(candidate, context)
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
