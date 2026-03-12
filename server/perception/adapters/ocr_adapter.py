from __future__ import annotations

from typing import TYPE_CHECKING

from perception.models import Modality, PerceptionEvent, SourceType
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable


class OCRAdapter:
    def __init__(self, publisher: Callable[[PerceptionEvent], Awaitable[None]]):
        self._publish = publisher

    def build_screen_ocr_event(
        self, text: str, *, content_raw: str, metadata: dict | None = None
    ) -> PerceptionEvent | None:
        content = (text or "").strip()
        if not content:
            return None
        return PerceptionEvent(
            timestamp=get_utc_now(),
            source=SourceType.OCR_SCREEN,
            modality=Modality.IMAGE,
            content_text=content,
            content_raw=content_raw,
            metadata=metadata or {},
            priority=0,
        )

    async def on_screen_ocr(
        self, text: str, screenshot_path: str, metadata: dict | None = None
    ) -> None:
        event = self.build_screen_ocr_event(
            text,
            content_raw=screenshot_path,
            metadata=metadata,
        )
        if event is None:
            return
        await self._publish(event)

    def build_proactive_ocr_event(
        self, text: str, *, content_raw: str | None = None, metadata: dict | None = None
    ) -> PerceptionEvent | None:
        content = (text or "").strip()
        if not content:
            return None
        return PerceptionEvent(
            timestamp=get_utc_now(),
            source=SourceType.OCR_PROACTIVE,
            modality=Modality.IMAGE,
            content_text=content,
            content_raw=content_raw,
            metadata=metadata or {},
            priority=1,
        )

    async def on_proactive_ocr(self, text: str, metadata: dict | None = None) -> None:
        event = self.build_proactive_ocr_event(text, metadata=metadata)
        if event is None:
            return
        await self._publish(event)
