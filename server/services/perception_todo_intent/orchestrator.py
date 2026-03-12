from __future__ import annotations

from collections import Counter
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from perception.models import SourceType
from schemas.perception_todo_intent import (
    TodoIntentContext,
    TodoIntentOrchestratorStats,
    TodoIntentProcessingRecord,
    TodoIntentProcessingStatus,
)
from services.perception_todo_intent.dedupe import PreGateDedupeCache
from services.perception_todo_intent.extractor import TodoIntentExtractor
from services.perception_todo_intent.gate import TodoIntentGate
from services.perception_todo_intent.integration import TodoIntentIntegrationService
from services.perception_todo_intent.normalizer import TodoIntentPostProcessor
from util.logging_config import get_logger
from util.settings import settings
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from perception.models import PerceptionEvent

logger = get_logger()


class TodoIntentOrchestrator:
    """Orchestrates pre-gate dedupe -> gate -> extract -> integrate."""

    def __init__(
        self,
        *,
        config: dict[str, Any] | None = None,
        dedupe: PreGateDedupeCache | None = None,
        gate: TodoIntentGate | None = None,
        extractor: TodoIntentExtractor | None = None,
        post_processor: TodoIntentPostProcessor | None = None,
        integration: TodoIntentIntegrationService | None = None,
    ):
        cfg = config
        if cfg is None:
            loaded = settings.get("perception.todo_intent", {}) or {}
            cfg = dict(loaded) if isinstance(loaded, dict) else {}
        self._config = cfg

        pre_gate_cfg = cfg.get("pre_gate_dedupe", {})
        if not isinstance(pre_gate_cfg, dict):
            pre_gate_cfg = {}
        gate_cfg = cfg.get("gate", {})
        if not isinstance(gate_cfg, dict):
            gate_cfg = {}
        extractor_cfg = cfg.get("extractor", {})
        if not isinstance(extractor_cfg, dict):
            extractor_cfg = {}
        integration_cfg = cfg.get("integration", {})
        if not isinstance(integration_cfg, dict):
            integration_cfg = {}

        self._max_context_chars = max(200, int(cfg.get("max_context_chars", 2500)))
        self._dedupe_enabled = bool(pre_gate_cfg.get("enabled", True))
        self._dedupe = dedupe or PreGateDedupeCache(
            ttl_seconds=int(pre_gate_cfg.get("exact_window_seconds", 90)),
            max_cache_size=int(pre_gate_cfg.get("max_cache_size", 5000)),
        )
        self._gate = gate or TodoIntentGate(
            min_text_length=int(gate_cfg.get("min_text_length", 8)),
            model=str(gate_cfg.get("model", "")).strip() or None,
            temperature=float(gate_cfg.get("temperature", 0.0)),
            max_tokens=int(gate_cfg.get("max_tokens", 160)),
        )
        self._extractor = extractor or TodoIntentExtractor(
            model=str(extractor_cfg.get("model", "")).strip() or None,
            temperature=float(extractor_cfg.get("temperature", 0.2)),
            max_tokens=int(extractor_cfg.get("max_tokens", 800)),
        )
        self._post_processor = post_processor or TodoIntentPostProcessor(
            max_todos_per_context=int(cfg.get("max_todos_per_context", 5)),
        )
        self._integration = integration or TodoIntentIntegrationService(
            dedupe_window_seconds=int(
                integration_cfg.get("post_extract_dedupe_window_seconds", 600)
            ),
        )
        self._counters: Counter[str] = Counter()

    @staticmethod
    def _modality_sort_key(modality: str) -> int:
        order = {
            "audio": 0,
            "image": 1,
            "text": 2,
        }
        return order.get(modality, 99)

    @staticmethod
    def _source_label(source: SourceType) -> str:
        if source in {SourceType.MIC_PC, SourceType.MIC_HARDWARE}:
            return "音频"
        if source in {SourceType.OCR_SCREEN, SourceType.OCR_PROACTIVE}:
            return "OCR"
        if source == SourceType.USER_INPUT:
            return "输入"
        return "文本"

    @staticmethod
    def _resolve_extract_error(exc: Exception) -> str:
        message = " ".join(str(exc).strip().split())
        if message:
            return message[:120]
        return f"extractor_{exc.__class__.__name__.lower()}"

    def _format_event_markdown(self, event: PerceptionEvent, text: str) -> str:
        label = self._source_label(event.source)
        metadata = event.metadata if isinstance(event.metadata, dict) else {}
        app_name = str(metadata.get("app_name") or "").strip()
        window_title = str(metadata.get("window_title") or "").strip()
        speaker = str(metadata.get("speaker") or "").strip()
        meta_parts: list[str] = []
        if app_name:
            meta_parts.append(f"应用: {app_name}")
        if window_title:
            meta_parts.append(f"窗口: {window_title}")
        if speaker:
            meta_parts.append(f"说话人: {speaker}")

        lines = [f"### {label}"]
        if meta_parts:
            lines.append(" | ".join(meta_parts))
        lines.append(text)
        return "\n".join(lines)

    def _build_record(  # noqa: PLR0913
        self,
        *,
        context: TodoIntentContext,
        status: TodoIntentProcessingStatus,
        dedupe_hit: bool = False,
        dedupe_key: str | None = None,
        gate_decision=None,
        candidates=None,
        integration_results=None,
        error: str | None = None,
    ) -> TodoIntentProcessingRecord:
        return TodoIntentProcessingRecord(
            record_id=f"tir_{uuid4().hex}",
            context_id=context.context_id,
            status=status,
            created_at=get_utc_now(),
            event_ids=list(context.event_ids),
            source_set=list(context.source_set),
            merged_text=context.merged_text,
            time_window_start=context.time_window_start,
            time_window_end=context.time_window_end,
            metadata=dict(context.metadata),
            dedupe_hit=dedupe_hit,
            dedupe_key=dedupe_key,
            gate_decision=gate_decision,
            candidates=list(candidates or []),
            integration_results=list(integration_results or []),
            error=error,
        )

    def build_context_from_event(self, event: PerceptionEvent) -> TodoIntentContext:
        return self.build_context_from_events([event])

    def build_context_from_events(self, events: list[PerceptionEvent]) -> TodoIntentContext:
        if not events:
            raise ValueError("empty_todo_intent_events")

        ordered_events = list(events)
        ordered_events.sort(key=lambda item: (int(item.sequence_id), item.timestamp))

        event_ids: list[str] = []
        source_set: list[SourceType] = []
        source_seen: set[SourceType] = set()
        metadata: dict[str, Any] = {}
        merged_blocks: list[str] = []
        event_refs: list[dict[str, Any]] = []

        time_window_start = min(event.timestamp for event in ordered_events)
        time_window_end = max(event.timestamp for event in ordered_events)

        for event in ordered_events:
            text = (event.content_text or "").strip()
            if text:
                merged_blocks.append(self._format_event_markdown(event, text))

            event_ids.append(event.event_id)
            if event.source not in source_seen:
                source_seen.add(event.source)
                source_set.append(event.source)

            raw_metadata = event.metadata if isinstance(event.metadata, dict) else {}
            for key, value in raw_metadata.items():
                if value is None:
                    continue
                if isinstance(value, str) and not value.strip():
                    continue
                metadata[key] = value

            event_refs.append(
                {
                    "event_id": event.event_id,
                    "source": event.source.value,
                    "modality": event.modality.value,
                    "sequence_id": int(event.sequence_id),
                    "timestamp": event.timestamp.isoformat(),
                }
            )

        event_refs.sort(
            key=lambda item: (
                self._modality_sort_key(str(item.get("modality", ""))),
                int(item.get("sequence_id", 0)),
                str(item.get("timestamp", "")),
                str(item.get("event_id", "")),
            )
        )

        merged_text = "\n\n".join(merged_blocks).strip()
        metadata["event_count"] = len(event_ids)
        metadata["event_refs"] = event_refs

        return TodoIntentContext(
            context_id=f"ctx_{uuid4().hex}",
            event_ids=event_ids,
            merged_text=merged_text,
            source_set=source_set,
            time_window_start=time_window_start,
            time_window_end=time_window_end,
            metadata=metadata,
        )

    async def process_event(self, event: PerceptionEvent) -> TodoIntentProcessingRecord:
        context = self.build_context_from_event(event)
        return await self.process_context(context)

    @staticmethod
    def _load_memory_context() -> tuple[str, str]:
        """Load L3 active todos snapshot and L4 user profile from Memory.

        Returns (active_todos, user_profile). Both default to empty string
        if MemoryManager is unavailable.
        """
        try:
            from memory.manager import try_get_memory_manager  # noqa: PLC0415

            mgr = try_get_memory_manager()
            if mgr is None:
                return "", ""
            reader = mgr.reader
            active_todos = reader.get_active_todos_snapshot()
            user_profile = reader.get_user_profile()
            return active_todos, user_profile
        except Exception:
            logger.debug("Failed to load memory context for intent extraction", exc_info=True)
            return "", ""

    async def process_context(self, context: TodoIntentContext) -> TodoIntentProcessingRecord:
        self._counters["contexts_total"] += 1
        dedupe_hit = False
        dedupe_key: str | None = None
        if self._dedupe_enabled:
            dedupe_hit, dedupe_key = self._dedupe.check_and_record(context)
        if dedupe_hit:
            self._counters["dedupe_hits"] += 1
            return self._build_record(
                context=context,
                status=TodoIntentProcessingStatus.DEDUPE_HIT,
                dedupe_hit=True,
                dedupe_key=dedupe_key,
            )

        gate_decision = await self._gate.decide(context)
        if not gate_decision.should_extract:
            self._counters["gate_skips"] += 1
            return self._build_record(
                context=context,
                status=TodoIntentProcessingStatus.GATE_SKIPPED,
                dedupe_key=dedupe_key,
                gate_decision=gate_decision,
            )

        active_todos, user_profile = self._load_memory_context()

        try:
            candidates = await self._extractor.extract(
                context,
                active_todos=active_todos,
                user_profile=user_profile,
            )
        except Exception:
            try:
                candidates = await self._extractor.extract(
                    context,
                    strict_json=True,
                    active_todos=active_todos,
                    user_profile=user_profile,
                )
            except Exception as exc:
                return self._build_record(
                    context=context,
                    status=TodoIntentProcessingStatus.EXTRACT_FAILED,
                    dedupe_key=dedupe_key,
                    gate_decision=gate_decision,
                    error=self._resolve_extract_error(exc),
                )

        normalized = self._post_processor.normalize(candidates, context)
        self._counters["extracted_candidates"] += len(normalized)

        results = await self._integration.integrate(
            context=context,
            gate_decision=gate_decision,
            candidates=normalized,
        )
        self._counters["integrated_total"] += len(results)
        return self._build_record(
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

    def get_stats(self) -> TodoIntentOrchestratorStats:
        return TodoIntentOrchestratorStats(
            contexts_total=int(self._counters.get("contexts_total", 0)),
            dedupe_hits=int(self._counters.get("dedupe_hits", 0)),
            gate_skips=int(self._counters.get("gate_skips", 0)),
            extracted_candidates=int(self._counters.get("extracted_candidates", 0)),
            integrated_total=int(self._counters.get("integrated_total", 0)),
        )
