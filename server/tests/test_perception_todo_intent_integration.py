from __future__ import annotations

from datetime import UTC, datetime

from perception.models import SourceType
from schemas.perception_todo_intent import (
    ExtractedTodoCandidate,
    IntentType,
    MemoryMatch,
    TodoIntentContext,
)
from services.perception_todo_intent.integration import _build_background_markdown


def test_background_markdown_includes_4w_why_and_sources() -> None:
    candidate = ExtractedTodoCandidate(
        name="和张三确认周会时间",
        description="需要把原定两点的周会改到三点，并同步给团队。",
        source_text="把周会改到明天下午三点，记得同步给大家",
        start_time=datetime(2026, 3, 17, 15, 0, tzinfo=UTC),
        intent_type=IntentType.TODO,
        inviter="张三",
        source_event_ids=["evt_1", "evt_2"],
        memory_match=MemoryMatch(),
    )
    context = TodoIntentContext(
        context_id="ctx_1",
        event_ids=["evt_1", "evt_2"],
        merged_text="[张三] 把周会改到明天下午三点，记得同步给大家",
        source_set=[SourceType.OCR_PROACTIVE],
        time_window_start=datetime(2026, 3, 16, 10, 0, tzinfo=UTC),
        time_window_end=datetime(2026, 3, 16, 10, 5, tzinfo=UTC),
        metadata={
            "app_name": "WeChat",
            "window_title": "张三",
            "speaker": "张三",
            "chat_type": "private",
            "event_refs": [
                {
                    "event_id": "evt_1",
                    "source": "ocr_proactive",
                    "timestamp": "2026-03-16T10:00:00+00:00",
                }
            ],
        },
    )

    background = _build_background_markdown(candidate, context)

    assert "## When" in background
    assert "## Who" in background
    assert "## What" in background
    assert "## Why" in background
    assert "## Message Sources" in background
    assert "应用：WeChat" in background
    assert "窗口：张三" in background
    assert "证据原文：把周会改到明天下午三点，记得同步给大家" in background
