"""Helper utilities for TodoManager."""

from __future__ import annotations

import contextlib
import json
from typing import Any


def _safe_int_list(value: Any) -> list[int]:
    if value is None:
        return []
    if isinstance(value, list):
        out: list[int] = []
        for item in value:
            with contextlib.suppress(Exception):
                out.append(int(item))
        return out
    # 兼容数据库中存的 JSON 字符串
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return _safe_int_list(parsed)
        except Exception:
            return []
    return []


def _normalize_reminder_offsets(value: Any) -> list[int] | None:
    if value is None:
        return None
    offsets = _safe_int_list(value)
    cleaned = sorted({offset for offset in offsets if offset >= 0})
    return cleaned


def _serialize_reminder_offsets(value: Any) -> str | None:
    normalized = _normalize_reminder_offsets(value)
    if normalized is None:
        return None
    return json.dumps(normalized)


def _normalize_percent(value: Any) -> int:
    if value is None:
        return 0
    try:
        percent = int(value)
    except Exception:
        return 0
    return max(0, min(100, percent))
