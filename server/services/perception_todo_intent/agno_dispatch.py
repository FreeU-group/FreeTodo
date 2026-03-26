from __future__ import annotations

import asyncio
from threading import Lock
from uuid import uuid4

from schemas.perception_todo_intent import (
    ExtractedTodoCandidate,
    IntegrationAction,
    IntentType,
    MemoryMatchAction,
    TodoIntegrationResult,
)
from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()

AGNO_TOOLS_FOR_TODO = [
    "create_todo",
    "update_todo",
    "complete_todo",
    "list_todos",
    "search_todos",
    "check_schedule_conflict",
    "parse_time",
]
AGNO_TOOLS_FOR_INVITATION = [
    *AGNO_TOOLS_FOR_TODO,
    "find_free_slots",
    "search_nearby_places",
    "draft_reply_message",
]
USER_FACING_INSTRUCTION = (
    "\n\n重要：1) 你必须先调用 create_todo 工具创建待办，不能只输出文字而不调用工具。"
    "\n2) 工具调用完成后，你的文字回复将直接展示给用户看，请用简洁友好的语气告知用户待办已创建。"
)
NOTIFICATION_TYPE_META: dict[str, tuple[str, str]] = {
    "auto_todo": ("自动待办", "auto_todo"),
    "invitation": ("邀约助手", "invitation"),
    "conflict": ("日程冲突", "conflict"),
    "update": ("待办调整", "update"),
    "complete": ("待办完成", "complete"),
    "cancel": ("待办取消", "cancel"),
}
_agno_cache: dict[tuple[str, ...], object] = {}
_agno_cache_lock = Lock()


def candidate_fields(candidate: ExtractedTodoCandidate) -> list[str]:
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


def memory_match_instruction(candidate: ExtractedTodoCandidate) -> str:
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


def build_invitation_message(candidate: ExtractedTodoCandidate) -> str:
    lines = ["[自动意图识别 — 邀约] 系统从用户的感知流中检测到一条邀约：", ""]
    lines.extend(candidate_fields(candidate))
    if candidate.inviter:
        lines.append(f"邀请人：{candidate.inviter}")
    if candidate.where:
        lines.append(f"地点：{candidate.where}")
    lines.extend(
        [
            "",
            "请按以下步骤处理：",
            "1. 调用 check_schedule_conflict 检查用户该时段是否有冲突。",
            "2. 如果有冲突，调用 find_free_slots 找出当天的空闲时段。",
            f"3. 调用 search_nearby_places 搜索「{candidate.where}」附近的推荐地点。"
            if candidate.where
            else "3. 如果邀约涉及餐饮，调用 search_nearby_places 搜索附近餐厅推荐。",
            "4. 综合以上信息，调用 draft_reply_message 为用户草拟一条得体的回复消息。",
            "5. 如果没有冲突，也请帮用户创建对应的待办事项。",
            USER_FACING_INSTRUCTION,
        ]
    )
    return "\n".join(lines)


def build_agno_message(candidate: ExtractedTodoCandidate) -> str:
    if candidate.intent_type == IntentType.INVITATION:
        return build_invitation_message(candidate)
    lines = ["[自动意图识别] 系统从用户的感知流中检测到以下待办意图："]
    lines.extend(candidate_fields(candidate))
    lines.append(memory_match_instruction(candidate))
    lines.append(USER_FACING_INSTRUCTION)
    return "\n".join(lines)


def select_tools(candidate: ExtractedTodoCandidate) -> list[str]:
    return list(
        AGNO_TOOLS_FOR_INVITATION
        if candidate.intent_type == IntentType.INVITATION
        else AGNO_TOOLS_FOR_TODO
    )


def get_agno_service(tools: list[str]) -> object:
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


def run_agno_sync(message: str, tools: list[str]) -> str:
    service = get_agno_service(tools)
    logger.info("[Agno] Sending message (%d chars), streaming response...", len(message))
    response_parts: list[str] = []
    for chunk in service.stream_response(message, include_tool_events=False):
        response_parts.append(chunk)
    full_response = "".join(response_parts)
    logger.info("[Agno] Response complete: %d chars", len(full_response))
    return full_response


def build_user_facing_content(  # noqa: C901
    candidate: ExtractedTodoCandidate, agno_response: str
) -> str:
    if candidate.intent_type == IntentType.INVITATION:
        inviter = candidate.inviter or "对方"
        header_parts = [f"{inviter}邀请你：{candidate.name}"]
        if candidate.who_executor:
            header_parts.append(f"执行者：{candidate.who_executor}")
        if candidate.start_time:
            header_parts.append(f"时间：{candidate.start_time.strftime('%m月%d日 %H:%M')}")
        if candidate.where:
            header_parts.append(f"地点：{candidate.where}")
    else:
        header_parts: list[str] = []
        if candidate.who_founder:
            header_parts.append(f"发起人：{candidate.who_founder}")
        if candidate.who_executor:
            header_parts.append(f"执行者：{candidate.who_executor}")
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
    return header if not analysis else f"{header}\n\n{analysis}"


def push_notification(
    candidate: ExtractedTodoCandidate,
    response: str,
    *,
    notification_type: str | None = None,
) -> None:
    from storage.notification_storage import add_notification  # noqa: PLC0415

    if notification_type is None:
        if candidate.intent_type == IntentType.INVITATION:
            notification_type = "invitation"
        elif candidate.memory_match.action == MemoryMatchAction.CONFLICT:
            notification_type = "conflict"
        else:
            notification_type = "auto_todo"
    label, ntype = NOTIFICATION_TYPE_META.get(notification_type, ("自动待办", "auto_todo"))
    title = f"{label}：{candidate.name}"
    content = build_user_facing_content(candidate, response)
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


async def dispatch_to_agno(
    candidate: ExtractedTodoCandidate, dedupe_key: str
) -> TodoIntegrationResult:
    try:
        message = build_agno_message(candidate)
        tools = select_tools(candidate)
        logger.info(
            "[Dispatch] Building Agno message for %r: intent_type=%s, tools=%s, msg_len=%d",
            candidate.name,
            candidate.intent_type.value,
            tools,
            len(message),
        )
        logger.debug("[Dispatch] Full message:\n%s", message)
        response = await asyncio.to_thread(run_agno_sync, message, tools)
        logger.info(
            "[Dispatch] ✓ Agno completed for %r (type=%s): response=%d chars",
            candidate.name,
            candidate.intent_type.value,
            len(response),
        )
        logger.info("[Dispatch] Response preview: %s", response[:500])
        push_notification(candidate, response)
        return TodoIntegrationResult(
            action=IntegrationAction.CREATED, dedupe_key=dedupe_key, reason="dispatched_to_agno"
        )
    except Exception:
        logger.exception("[Dispatch] ✗ FAILED to dispatch intent to Agno: %s", candidate.name)
        return TodoIntegrationResult(
            action=IntegrationAction.QUEUED_REVIEW,
            dedupe_key=dedupe_key,
            reason="agno_dispatch_failed",
        )
