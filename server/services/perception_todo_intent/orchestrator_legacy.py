"""Legacy pipeline helpers for TodoIntentOrchestrator.

Extracted to keep the main orchestrator module under the 500-line limit.
Used only when ``intent_mode == "legacy"``.
"""

from __future__ import annotations

import re as _re
from typing import TYPE_CHECKING, Any

from schemas.perception_todo_intent import TodoIntentProcessingStatus
from util.logging_config import get_logger
from util.settings import settings

if TYPE_CHECKING:
    from schemas.perception_todo_intent import (
        TodoIntentContext,
        TodoIntentProcessingRecord,
    )

logger = get_logger()


def extract_keywords(text: str, metadata: dict[str, object] | None = None) -> list[str]:
    """Extract search keywords from text and metadata using rules (no LLM)."""
    keywords: list[str] = []
    seen: set[str] = set()
    meta = metadata or {}

    def _add(kw: str) -> None:
        kw = kw.strip()
        if kw and kw not in seen and kw not in ("我", "对方", "unknown", ""):
            seen.add(kw)
            keywords.append(kw)

    window_title = str(meta.get("window_title") or "").strip()
    if window_title:
        _add(window_title)

    speaker = str(meta.get("speaker") or "").strip()
    if speaker:
        _add(speaker)

    for m in _re.finditer(r"\[(?:私聊|群聊)\]\[([^\]]+)\]", text):
        _add(m.group(1))

    for m in _re.finditer(r"^\[([^\]]{1,10})\]\s", text, _re.MULTILINE):
        name = m.group(1)
        if name not in ("我", "时间"):
            _add(name)

    return keywords[:5]


_MIN_KEYWORD_BUDGET = 200


def load_memory_context(
    context: TodoIntentContext | None = None,
) -> tuple[str, str, str, str]:
    """Load memory context for legacy intent extraction.

    Returns (active_todos, user_profile, recent_context, keyword_context).
    """
    try:
        from memory.manager import try_get_memory_manager  # noqa: PLC0415

        mgr = try_get_memory_manager()
        if mgr is None:
            return "", "", "", ""

        reader = mgr.reader
        active_todos = reader.get_active_todos_snapshot()
        user_profile = reader.get_user_profile()

        enrich_cfg = settings.get("perception.todo_intent.memory_enrichment", {}) or {}
        if not isinstance(enrich_cfg, dict):
            enrich_cfg = {}
        enrichment_enabled = bool(enrich_cfg.get("enabled", True))

        recent_context = ""
        keyword_context = ""

        if enrichment_enabled and context is not None:
            total_max = int(enrich_cfg.get("total_max_chars", 3500))

            recent_cfg = enrich_cfg.get("recent", {}) or {}
            window_min = float(recent_cfg.get("window_minutes", 10.0))
            recent_max = int(recent_cfg.get("max_chars", 2000))

            exclude_ids = {ev.event_id for ev in (context.events or []) if hasattr(ev, "event_id")}
            deduper = getattr(mgr, "deduper", None)
            recent_context = reader.get_recent_context(
                deduper,
                window_minutes=window_min,
                max_chars=min(recent_max, total_max),
                exclude_event_ids=exclude_ids,
            )

            remaining = total_max - len(recent_context)
            if remaining > _MIN_KEYWORD_BUDGET:
                kw_cfg = enrich_cfg.get("keyword", {}) or {}
                search_days = int(kw_cfg.get("search_days", 3))
                kw_max = min(int(kw_cfg.get("max_chars", 1500)), remaining)
                max_kw = int(kw_cfg.get("max_keywords", 5))

                keywords = extract_keywords(
                    context.merged_text or "",
                    context.metadata,
                )[:max_kw]

                if keywords:
                    keyword_context = reader.search_relevant_context(
                        keywords,
                        days=search_days,
                        max_chars=kw_max,
                    )

        return active_todos, user_profile, recent_context, keyword_context
    except Exception:
        logger.debug("Failed to load memory context for intent extraction", exc_info=True)
        return "", "", "", ""


async def process_legacy_mode(
    orchestrator: Any,
    *,
    rid: str,
    context: TodoIntentContext,
    dedupe_key: str | None,
    gate_decision: object,
    on_progress: Any,
) -> TodoIntentProcessingRecord:
    """Legacy mode: Extractor -> PostProcessor -> Integration pipeline."""
    await on_progress(
        orchestrator._build_record(
            record_id=rid,
            context=context,
            status=TodoIntentProcessingStatus.EXTRACTING,
            dedupe_key=dedupe_key,
            gate_decision=gate_decision,
        )
    )

    active_todos, user_profile, recent_context, keyword_context = load_memory_context(context)
    logger.info(
        "[Orchestrator] Memory context loaded: active_todos=%d chars, user_profile=%d chars, "
        "recent_context=%d chars, keyword_context=%d chars",
        len(active_todos),
        len(user_profile),
        len(recent_context),
        len(keyword_context),
    )

    try:
        candidates = await orchestrator._extractor.extract(
            context,
            active_todos=active_todos,
            user_profile=user_profile,
            recent_context=recent_context,
            keyword_context=keyword_context,
        )
    except Exception:
        logger.warning("[Orchestrator] Extractor failed, retrying with strict_json...")
        try:
            candidates = await orchestrator._extractor.extract(
                context,
                strict_json=True,
                active_todos=active_todos,
                user_profile=user_profile,
                recent_context=recent_context,
                keyword_context=keyword_context,
            )
        except Exception as exc:
            logger.exception("[Orchestrator] Extractor failed twice")
            rec = orchestrator._build_record(
                record_id=rid,
                context=context,
                status=TodoIntentProcessingStatus.EXTRACT_FAILED,
                dedupe_key=dedupe_key,
                gate_decision=gate_decision,
                error=orchestrator._resolve_extract_error(exc),
            )
            await on_progress(rec)
            return rec

    normalized = orchestrator._post_processor.normalize(candidates, context)
    orchestrator._counters["extracted_candidates"] += len(normalized)
    logger.info(
        "[Orchestrator] Extractor returned %d candidate(s), %d after normalization",
        len(candidates),
        len(normalized),
    )
    for c in normalized:
        logger.info(
            "[Orchestrator]   -> %r  intent_type=%s  inviter=%s  confidence=%.2f",
            c.name,
            c.intent_type.value,
            c.inviter,
            c.confidence,
        )

    await on_progress(
        orchestrator._build_record(
            record_id=rid,
            context=context,
            status=TodoIntentProcessingStatus.INTEGRATING,
            dedupe_key=dedupe_key,
            gate_decision=gate_decision,
            candidates=normalized,
        )
    )

    results = await orchestrator._integration.integrate(
        context=context,
        gate_decision=gate_decision,
        candidates=normalized,
    )
    orchestrator._counters["integrated_total"] += len(results)
    for r in results:
        logger.info(
            "[Orchestrator]   Integration result: action=%s reason=%s",
            r.action.value,
            r.reason,
        )
    rec = orchestrator._build_record(
        record_id=rid,
        context=context,
        status=(
            TodoIntentProcessingStatus.EXTRACTED
            if normalized
            else TodoIntentProcessingStatus.PROCESSED
        ),
        dedupe_key=dedupe_key,
        gate_decision=gate_decision,
        candidates=normalized,
        integration_results=results,
    )
    await on_progress(rec)
    return rec
