from __future__ import annotations

from datetime import datetime  # noqa: TC003
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from perception.models import SourceType  # noqa: TC001


class MemoryMatchAction(str, Enum):
    """How a newly extracted intent relates to existing todos in Memory."""

    NEW = "new"
    LINK_EXISTING = "link_existing"
    CONFLICT = "conflict"
    CANCEL_EXISTING = "cancel_existing"


class MemoryMatch(BaseModel):
    """Result of matching a candidate against the existing Todo snapshot."""

    action: MemoryMatchAction = MemoryMatchAction.NEW
    matched_todo_name: str | None = None
    reason: str | None = None


class IntegrationAction(str, Enum):
    CREATED = "created"
    UPDATED = "updated"
    SKIPPED = "skipped"
    QUEUED_REVIEW = "queued_review"


class TodoIntentProcessingStatus(str, Enum):
    DEDUPE_HIT = "dedupe_hit"
    GATE_SKIPPED = "gate_skipped"
    EXTRACTED = "extracted"
    EXTRACT_FAILED = "extract_failed"
    PROCESSED = "processed"
    FAILED = "failed"


class TodoIntentContext(BaseModel):
    context_id: str
    event_ids: list[str] = Field(default_factory=list)
    merged_text: str = ""
    source_set: list[SourceType] = Field(default_factory=list)
    time_window_start: datetime
    time_window_end: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class IntentGateDecision(BaseModel):
    should_extract: bool
    reason: str
    raw: dict[str, Any] | None = None


class IntentType(str, Enum):
    """High-level intent category detected by the Extractor."""

    TODO = "todo"
    INVITATION = "invitation"


class ExtractedTodoCandidate(BaseModel):
    name: str
    description: str | None = None
    start_time: datetime | None = None
    due: datetime | None = None
    deadline: datetime | None = None
    time_zone: str | None = None
    priority: str = "none"
    tags: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    source_text: str | None = None
    source_event_ids: list[str] = Field(default_factory=list)
    memory_match: MemoryMatch = Field(default_factory=MemoryMatch)
    intent_type: IntentType = IntentType.TODO
    inviter: str | None = None
    location: str | None = None


class TodoIntegrationResult(BaseModel):
    action: IntegrationAction
    todo_id: int | None = None
    dedupe_key: str | None = None
    reason: str | None = None


class TodoIntentOrchestratorStats(BaseModel):
    contexts_total: int = 0
    dedupe_hits: int = 0
    gate_skips: int = 0
    extracted_candidates: int = 0
    integrated_total: int = 0


class TodoIntentSubscriberStatusResponse(BaseModel):
    enabled: bool
    running: bool
    queue_size: int
    queue_maxsize: int
    enqueued_total: int
    dropped_total: int
    processing_workers: int = 1
    running_workers: int = 0
    active_workers: int = 0
    active_worker_ids: list[int] = Field(default_factory=list)
    context_queue_size: int = 0
    context_queue_maxsize: int = 0
    contexts_enqueued_total: int = 0
    contexts_dropped_total: int = 0
    processed_total: int
    failed_total: int
    orchestrator: TodoIntentOrchestratorStats


class TodoIntentProcessingRecord(BaseModel):
    record_id: str
    context_id: str
    status: TodoIntentProcessingStatus
    created_at: datetime
    event_ids: list[str] = Field(default_factory=list)
    source_set: list[SourceType] = Field(default_factory=list)
    merged_text: str = ""
    time_window_start: datetime
    time_window_end: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)
    dedupe_hit: bool = False
    dedupe_key: str | None = None
    gate_decision: IntentGateDecision | None = None
    candidates: list[ExtractedTodoCandidate] = Field(default_factory=list)
    integration_results: list[TodoIntegrationResult] = Field(default_factory=list)
    error: str | None = None
