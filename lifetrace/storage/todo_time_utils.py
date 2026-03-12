"""Todo 时间字段的 UTC 规范化工具。"""

from __future__ import annotations

from datetime import datetime

from lifetrace.util.time_utils import ensure_utc, naive_as_utc


def to_utc(value: datetime | None) -> datetime | None:
    return ensure_utc(value) if value is not None else None


def to_utc_output(value: datetime | None) -> datetime | None:
    return naive_as_utc(value) if value is not None else None


def normalize_update_datetime(
    value: datetime | None | object,
    unset: object,
) -> datetime | None | object:
    if value is unset or value is None:
        return value
    if isinstance(value, datetime):
        return ensure_utc(value)
    return value
