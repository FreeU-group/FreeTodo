from __future__ import annotations

from typing import TYPE_CHECKING

from perception.models import Modality, PerceptionEvent, SourceType
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable


class AIOutputAdapter:
    def __init__(self, publisher: Callable[[PerceptionEvent], Awaitable[None]]):
        self._publish = publisher

    def build_ai_output_event(
        self, text: str, metadata: dict | None = None
    ) -> PerceptionEvent | None:
        content = (text or "").strip()
        if not content:
            return None
        return PerceptionEvent(
            timestamp=get_utc_now(),
            source=SourceType.AI_OUTPUT,
            modality=Modality.TEXT,
            content_text=content,
            metadata=metadata or {},
            priority=2,
        )

    async def on_ai_output(self, text: str, metadata: dict | None = None) -> None:
        event = self.build_ai_output_event(text, metadata=metadata)
        if event is None:
            return
        await self._publish(event)
