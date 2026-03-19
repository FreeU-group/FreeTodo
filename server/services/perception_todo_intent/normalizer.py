from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from schemas.perception_todo_intent import ExtractedTodoCandidate, TodoIntentContext

_EMOJI_RE = re.compile(
    "["
    "\U0001f600-\U0001f64f"  # emoticons
    "\U0001f300-\U0001f5ff"  # symbols & pictographs
    "\U0001f680-\U0001f6ff"  # transport & map
    "\U0001f1e0-\U0001f1ff"  # flags
    "\U0001f900-\U0001f9ff"  # supplemental symbols
    "\U0001fa00-\U0001fa6f"  # chess symbols
    "\U0001fa70-\U0001faff"  # symbols extended-A
    "\U00002702-\U000027b0"  # dingbats
    "\U0000fe00-\U0000fe0f"  # variation selectors
    "\U0000200d"  # ZWJ
    "\U000020e3"  # combining enclosing keycap
    "\U00002600-\U000026ff"  # misc symbols
    "\U00002b50-\U00002b55"  # stars
    "\U0000231a-\U0000231b"  # watch/hourglass
    "\U00002934-\U00002935"  # arrows
    "\U000025aa-\U000025ab"  # squares
    "\U000025fb-\U000025fe"  # squares
    "\U00003030\U0000303d"  # wavy dash / part alternation
    "\U0000200b"  # ZWSP
    "]+",
    flags=re.UNICODE,
)
_MULTI_SPACE = re.compile(r"\s+")


def _strip_emoji(text: str) -> str:
    """Remove emoji characters and collapse resulting whitespace."""
    cleaned = _EMOJI_RE.sub(" ", text)
    return _MULTI_SPACE.sub(" ", cleaned).strip()


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
            name = _strip_emoji(candidate.name or "").strip()
            if not name:
                continue
            candidate.name = name
            if candidate.description:
                candidate.description = _strip_emoji(candidate.description)
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
