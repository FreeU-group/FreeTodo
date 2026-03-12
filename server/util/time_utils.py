"""时间工具函数模块

提供 UTC 时间处理相关的工具函数，确保项目中所有时间都使用 UTC 存储和处理。
面向用户的日期/时间使用东八区（Asia/Shanghai）。
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta, timezone

USER_TIMEZONE = timezone(timedelta(hours=8))
"""用户时区：固定为 UTC+8（Asia/Shanghai），所有面向用户的日期都基于此。"""


def get_utc_now() -> datetime:
    """获取当前 UTC 时间（timezone-aware）

    Returns:
        datetime: 当前 UTC 时间，带时区信息
    """
    return datetime.now(UTC)


def get_local_now() -> datetime:
    """获取当前用户本地时间（UTC+8）。

    用于所有面向用户的日期计算：Memory 文件命名、AI 聊天日期感知等。
    """
    return datetime.now(USER_TIMEZONE)


def local_today_str() -> str:
    """返回用户本地日期字符串，格式 ``YYYY-MM-DD``。"""
    return get_local_now().strftime("%Y-%m-%d")


def local_yesterday_str() -> str:
    """返回用户本地昨天的日期字符串。"""
    return (get_local_now() - timedelta(days=1)).strftime("%Y-%m-%d")


def to_utc(dt: datetime) -> datetime:
    """将 datetime 转换为 UTC 时间

    Args:
        dt: 要转换的 datetime 对象（可以是 naive 或 timezone-aware）

    Returns:
        datetime: UTC 时间（timezone-aware）

    注意：
        - 如果 dt 是 naive datetime（无时区信息），假设为本地时间并转换为 UTC
        - 如果 dt 已经是 timezone-aware，则转换为 UTC
    """
    if dt.tzinfo is None:
        # naive datetime 假设为本地时间，转换为 UTC
        # 使用 local timezone 转换
        local_tz = timezone(
            timedelta(seconds=-time.timezone if time.daylight == 0 else -time.altzone)
        )
        dt_with_tz = dt.replace(tzinfo=local_tz)
        return dt_with_tz.astimezone(UTC)
    return dt.astimezone(UTC)


def naive_as_utc(dt: datetime) -> datetime:
    """将 naive datetime 视为 UTC 时间（用于 SQLite 数据库读取）

    注意：SQLite 存储 datetime 为字符串，SQLAlchemy 读取时为 naive datetime。
    由于我们的代码统一使用 UTC 时间存储，数据库中的 naive datetime 实际上就是 UTC 时间。

    Args:
        dt: naive datetime 对象

    Returns:
        datetime: UTC timezone-aware datetime

    Raises:
        ValueError: 如果 dt 不是 naive datetime（已经有 tzinfo）
    """
    if dt.tzinfo is not None:
        # 如果已经有时区信息，直接返回
        return dt.astimezone(UTC)
    # 假设 naive datetime 就是 UTC 时间，直接添加 UTC 时区信息
    return dt.replace(tzinfo=UTC)


def ensure_utc(dt: datetime | None) -> datetime | None:
    """确保 datetime 是 UTC，如果是 None 则返回 None

    Args:
        dt: 要处理的 datetime 对象或 None

    Returns:
        datetime | None: UTC 时间（timezone-aware）或 None
    """
    return to_utc(dt) if dt is not None else None


def to_local(dt: datetime | None) -> datetime | None:
    """将 datetime 转换为本地时间（timezone-aware）。

    如果 dt 为 naive，则视为本地时间并补充本地时区；如果已有 tzinfo，则转换到本地时区。
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        offset = -time.timezone if time.daylight == 0 else -time.altzone
        local_tz = timezone(timedelta(seconds=offset))
        return dt.replace(tzinfo=local_tz)
    return dt.astimezone()
