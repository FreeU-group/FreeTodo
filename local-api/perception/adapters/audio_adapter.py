from __future__ import annotations

from typing import TYPE_CHECKING

from perception.models import Modality, PerceptionEvent, SourceType
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable


class AudioAdapter:
    def __init__(
        self,
        publisher: Callable[[PerceptionEvent], Awaitable[None]],
        source: SourceType = SourceType.MIC_PC,
    ):
        self._publish = publisher
        self._source = source

    @property
    def source(self) -> SourceType:
        return self._source

    def build_transcription_event(
        self,
        text: str,
        metadata: dict | None = None,
        *,
        source: SourceType | None = None,
    ) -> PerceptionEvent | None:
        content = (text or "").strip()
        if not content:
            return None
        resolved_source = source or self._source
        return PerceptionEvent(
            timestamp=get_utc_now(),
            source=resolved_source,
            modality=Modality.AUDIO,
            content_text=content,
            metadata=metadata or {},
            priority=2,
        )

    async def on_transcription(self, text: str, metadata: dict | None = None) -> None:
        event = self.build_transcription_event(text, metadata=metadata)
        if event is None:
            return
        await self._publish(event)
