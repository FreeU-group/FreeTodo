from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from perception.models import Modality, PerceptionEvent, SourceType
from schemas.perception_todo_intent import (
    ExtractedTodoCandidate,
    IntegrationAction,
    IntentGateDecision,
    MemoryMatch,
    MemoryMatchAction,
    TodoIntegrationResult,
    TodoIntentProcessingStatus,
)
from services.perception_todo_intent.orchestrator import TodoIntentOrchestrator


class GateStub:
    def __init__(self):
        self.calls = 0

    async def decide(self, context):
        self.calls += 1
        return IntentGateDecision(should_extract=False, reason="should_not_run")


class ExtractorStub:
    def __init__(self, candidates: list[ExtractedTodoCandidate]):
        self.calls = 0
        self.candidates = candidates
        self.last_text = ""

    async def extract(self, context, **kwargs):
        self.calls += 1
        self.last_text = context.merged_text
        return list(self.candidates)


class PostProcessorStub:
    def normalize(self, candidates, context):
        return candidates


class IntegrationStub:
    def __init__(self):
        self.calls = 0
        self.last_candidates = []

    async def integrate(self, **kwargs):
        self.calls += 1
        self.last_candidates = kwargs["candidates"]
        return [TodoIntegrationResult(action=IntegrationAction.UPDATED, reason="agno_crud")]


def _build_event(text: str) -> PerceptionEvent:
    return PerceptionEvent(
        sequence_id=1,
        timestamp=datetime.now(UTC),
        source=SourceType.OCR_PROACTIVE,
        modality=Modality.TEXT,
        content_text=text,
        metadata={"app_name": "WeChat", "chat_type": "private"},
    )


@pytest.mark.asyncio
async def test_pipeline_extracts_without_gate_or_dedupe_short_circuit():
    candidate = ExtractedTodoCandidate(
        name="给小王发项目计划",
        source_text="帮我明天下午给小王发项目计划",
        memory_match=MemoryMatch(action=MemoryMatchAction.NEW),
    )
    gate = GateStub()
    extractor = ExtractorStub([candidate])
    integration = IntegrationStub()
    gate_any: Any = gate
    extractor_any: Any = extractor
    post_processor_any: Any = PostProcessorStub()
    integration_any: Any = integration
    orchestrator = TodoIntentOrchestrator(
        gate=gate_any,
        extractor=extractor_any,
        post_processor=post_processor_any,
        integration=integration_any,
    )

    result = await orchestrator.process_event(_build_event("帮我明天下午给小王发项目计划"))

    assert result.status == TodoIntentProcessingStatus.EXTRACTED
    assert gate.calls == 0
    assert extractor.calls == 1
    assert integration.calls == 1
    assert result.candidates[0].name == "给小王发项目计划"


@pytest.mark.asyncio
async def test_pipeline_skips_when_agno_finds_no_todo():
    gate = GateStub()
    extractor = ExtractorStub([])
    integration = IntegrationStub()
    gate_any: Any = gate
    extractor_any: Any = extractor
    post_processor_any: Any = PostProcessorStub()
    integration_any: Any = integration
    orchestrator = TodoIntentOrchestrator(
        gate=gate_any,
        extractor=extractor_any,
        post_processor=post_processor_any,
        integration=integration_any,
    )

    result = await orchestrator.process_event(_build_event("哈哈好的，收到"))

    assert result.status == TodoIntentProcessingStatus.PROCESSED
    assert gate.calls == 0
    assert extractor.calls == 1
    assert integration.calls == 0


@pytest.mark.asyncio
async def test_pipeline_keeps_memory_match_for_crud_reconciliation():
    candidate = ExtractedTodoCandidate(
        name="周会时间调整",
        source_text="把周会改到明天下午三点",
        memory_match=MemoryMatch(
            action=MemoryMatchAction.LINK_EXISTING,
            matched_todo_name="明天下午两点周会",
            reason="同一会议时间变更",
        ),
    )
    extractor = ExtractorStub([candidate])
    integration = IntegrationStub()
    gate_any: Any = GateStub()
    extractor_any: Any = extractor
    post_processor_any: Any = PostProcessorStub()
    integration_any: Any = integration
    orchestrator = TodoIntentOrchestrator(
        gate=gate_any,
        extractor=extractor_any,
        post_processor=post_processor_any,
        integration=integration_any,
    )

    result = await orchestrator.process_event(_build_event("把周会改到明天下午三点"))

    assert result.status == TodoIntentProcessingStatus.EXTRACTED
    assert integration.calls == 1
    assert integration.last_candidates[0].memory_match.action == MemoryMatchAction.LINK_EXISTING
    assert integration.last_candidates[0].memory_match.matched_todo_name == "明天下午两点周会"
