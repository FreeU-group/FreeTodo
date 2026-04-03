from __future__ import annotations

from datetime import datetime, timedelta, timezone

from llm.agno_tools.tools.time_tools import TimeTools


class _TestTimeTools(TimeTools):
    lang = "zh"


def test_parse_time_uses_local_day_and_returns_utc(monkeypatch) -> None:
    local_tz = timezone(timedelta(hours=8))
    frozen_local_now = datetime(2024, 3, 12, 10, 0, tzinfo=local_tz)

    monkeypatch.setattr(
        "llm.agno_tools.tools.time_tools.get_local_now",
        lambda: frozen_local_now,
    )

    result = _TestTimeTools().parse_time("今天早上8点")

    assert result == "解析结果: 2024-03-12T00:00:00+00:00"


def test_parse_time_handles_evening_hour_correctly(monkeypatch) -> None:
    local_tz = timezone(timedelta(hours=8))
    frozen_local_now = datetime(2024, 3, 12, 10, 0, tzinfo=local_tz)

    monkeypatch.setattr(
        "llm.agno_tools.tools.time_tools.get_local_now",
        lambda: frozen_local_now,
    )

    result = _TestTimeTools().parse_time("今天晚上9点")

    assert result == "解析结果: 2024-03-12T13:00:00+00:00"
