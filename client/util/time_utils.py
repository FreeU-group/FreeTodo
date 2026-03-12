"""时间工具函数模块"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta, timezone

USER_TIMEZONE = timezone(timedelta(hours=8))


def get_utc_now() -> datetime:
    return datetime.now(UTC)


def get_local_now() -> datetime:
    return datetime.now(USER_TIMEZONE)


def local_today_str() -> str:
    return get_local_now().strftime("%Y-%m-%d")


def to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        local_tz = timezone(
            timedelta(seconds=-time.timezone if time.daylight == 0 else -time.altzone)
        )
        dt_with_tz = dt.replace(tzinfo=local_tz)
        return dt_with_tz.astimezone(UTC)
    return dt.astimezone(UTC)
