from __future__ import annotations

from typing import TYPE_CHECKING

from perception.models import Modality, PerceptionEvent, SourceType
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable


class InputAdapter:
    def __init__(self, publisher: Callable[[PerceptionEvent], Awaitable[None]]):
        self._publish = publisher

    def build_user_input_event(
        self, text: str, metadata: dict | None = None
    ) -> PerceptionEvent | None:
        content = (text or "").strip()
        if not content:
            return None
        return PerceptionEvent(
            timestamp=get_utc_now(),
            source=SourceType.USER_INPUT,
            modality=Modality.TEXT,
            content_text=content,
            metadata=metadata or {},
            priority=3,
        )

    async def on_user_input(self, text: str, metadata: dict | None = None) -> None:
        event = self.build_user_input_event(text, metadata=metadata)
        if event is None:
            return
        await self._publish(event)
