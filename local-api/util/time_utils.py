"""时间工具函数模块.

提供 UTC 时间处理相关的工具函数，确保项目中所有时间都使用 UTC 存储和处理。
面向用户的日期/时间使用东八区（Asia/Shanghai）。
"""

from __future__ import annotations

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
        - 如果 dt 是 naive datetime（无时区信息），假设为用户时区时间并转换为 UTC
        - 如果 dt 已经是 timezone-aware，则转换为 UTC
    """
    if dt.tzinfo is None:
        dt_with_tz = dt.replace(tzinfo=USER_TIMEZONE)
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


def utc_to_storage(dt: datetime | None) -> datetime | None:
    """将时间规范化为 UTC，并去掉 tzinfo 以兼容 SQLite 的 naive 存储。"""
    normalized = ensure_utc(dt)
    if normalized is None:
        return None
    return normalized.replace(tzinfo=None)


def db_datetime_as_utc(dt: datetime | None) -> datetime | None:
    """将数据库中的 datetime 统一视为 UTC。

    SQLite 读出的时间通常是 naive datetime。项目约定数据库统一存 UTC，
    所以这里将 naive 值直接补成 UTC；若已带时区则统一转换为 UTC。
    """
    if dt is None:
        return None
    return naive_as_utc(dt)


def to_local(dt: datetime | None) -> datetime | None:
    """将 datetime 转换为用户本地时间（timezone-aware）。"""
    if dt is None:
        return None
    return db_datetime_as_utc(dt).astimezone(USER_TIMEZONE)
