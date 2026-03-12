from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from schemas.perception_todo_intent import ExtractedTodoCandidate, TodoIntentContext


class TodoIntentPostProcessor:
    """Post extraction normalization and dedupe (lightweight MVP)."""

    def __init__(self, *, max_todos_per_context: int = 5):
        self._max_todos_per_context = max(1, int(max_todos_per_context))

    def normalize(
        self, candidates: list[ExtractedTodoCandidate], context: TodoIntentContext
    ) -> list[ExtractedTodoCandidate]:
        normalized: list[ExtractedTodoCandidate] = []
        dedupe: set[tuple[str, str | None, str | None]] = set()
        for candidate in candidates:
            name = (candidate.name or "").strip()
            if not name:
                continue
            candidate.name = name
            if candidate.confidence < 0:
                candidate.confidence = 0.0
            if candidate.confidence > 1:
                candidate.confidence = 1.0
            if not candidate.source_event_ids:
                candidate.source_event_ids = list(context.event_ids)
            key = (
                name.lower(),
                candidate.due.isoformat() if candidate.due else None,
                candidate.source_text,
            )
            if key in dedupe:
                continue
            dedupe.add(key)
            normalized.append(candidate)
            if len(normalized) >= self._max_todos_per_context:
                break
        return normalized
