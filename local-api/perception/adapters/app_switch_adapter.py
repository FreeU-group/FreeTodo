from __future__ import annotations

from typing import TYPE_CHECKING

from perception.models import Modality, PerceptionEvent, SourceType
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable


class AppSwitchAdapter:
    """Adapter for foreground application switch events.

    Records which app the user switched to. These events are purely
    contextual — they are stored in Memory (L0/L1) for reference but
    do NOT trigger proactive intent recognition.
    """

    def __init__(self, publisher: Callable[[PerceptionEvent], Awaitable[None]]):
        self._publish = publisher
        self._last_app: str | None = None
        self._last_title: str | None = None

    def build_app_switch_event(
        self,
        app_name: str,
        window_title: str | None = None,
        *,
        metadata: dict | None = None,
    ) -> PerceptionEvent | None:
        app = (app_name or "").strip()
        if not app:
            return None
        title = (window_title or "").strip()

        if app == self._last_app and title == self._last_title:
            return None

        self._last_app = app
        self._last_title = title

        content = f"[切换应用] {app}"
        if title:
            content += f" — {title}"

        meta = dict(metadata or {})
        meta["app_name"] = app
        if title:
            meta["window_title"] = title

        return PerceptionEvent(
            timestamp=get_utc_now(),
            source=SourceType.APP_SWITCH,
            modality=Modality.TEXT,
            content_text=content,
            metadata=meta,
            priority=1,
        )

    async def on_app_switch(
        self,
        app_name: str,
        window_title: str | None = None,
        *,
        metadata: dict | None = None,
    ) -> None:
        event = self.build_app_switch_event(app_name, window_title, metadata=metadata)
        if event is None:
            return
        await self._publish(event)
