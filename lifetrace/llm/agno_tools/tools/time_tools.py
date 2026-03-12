"""Time Parsing Tools

Natural language time expression parsing.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta

from lifetrace.llm.agno_tools.base import get_message
from lifetrace.util.logging_config import get_logger
from lifetrace.util.time_utils import get_local_now, to_utc

logger = get_logger()

# Constants for time parsing
PM_HOUR_OFFSET = 12
DAYS_IN_WEEK = 7

# Date format patterns
DATE_FORMATS = [
    ("%Y-%m-%d %H:%M:%S", True),
    ("%Y-%m-%d %H:%M", True),
    ("%Y-%m-%d", False),
    ("%Y/%m/%d %H:%M", True),
    ("%Y/%m/%d", False),
]

# Chinese weekday mapping
CHINESE_WEEKDAY_MAP = {
    "一": 0,
    "二": 1,
    "三": 2,
    "四": 3,
    "五": 4,
    "六": 5,
    "日": 6,
    "天": 6,
}

# English weekday mapping
ENGLISH_WEEKDAY_MAP = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}

# Time patterns: (regex_pattern, hour_offset)
CHINESE_TIME_PATTERNS = [
    (r"下午\s*(\d{1,2})\s*[点:：时]?\s*(\d{0,2})", PM_HOUR_OFFSET),
    (r"晚上\s*(\d{1,2})\s*[点:：时]?\s*(\d{0,2})", PM_HOUR_OFFSET),
    (r"上午\s*(\d{1,2})\s*[点:：时]?\s*(\d{0,2})", 0),
    (r"早上\s*(\d{1,2})\s*[点:：时]?\s*(\d{0,2})", 0),
    (r"中午\s*(\d{1,2})\s*[点:：时]?\s*(\d{0,2})", 0),
    (r"(\d{1,2})\s*[点:：时]\s*(\d{0,2})", 0),
]


def _parse_iso_format(time_expression: str) -> tuple[datetime | None, bool]:
    """Try to parse as ISO format."""
    try:
        result = datetime.fromisoformat(time_expression.replace("Z", "+00:00"))
        time_already_set = "T" in time_expression or " " in time_expression
        return to_utc(result), time_already_set
    except ValueError:
        return None, False


def _parse_date_formats(time_expression: str) -> tuple[datetime | None, bool]:
    """Try common date formats."""
    for fmt, has_time in DATE_FORMATS:
        try:
            result = datetime.strptime(time_expression, fmt).astimezone()
            return to_utc(result), has_time
        except ValueError:
            continue
    return None, False


def _parse_relative_day(expr: str, now: datetime) -> datetime | None:
    """Parse relative day expressions like 今天, 明天, 后天."""
    if "今天" in expr or "today" in expr:
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if "明天" in expr or "tomorrow" in expr:
        return (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    if "后天" in expr:
        return (now + timedelta(days=2)).replace(hour=0, minute=0, second=0, microsecond=0)
    return None


def _parse_days_offset(expr: str, now: datetime) -> datetime | None:
    """Parse N天后 / in N days patterns."""
    days_match = re.search(r"(\d+)\s*天后", expr) or re.search(r"in\s*(\d+)\s*days?", expr)
    if days_match:
        days = int(days_match.group(1))
        return (now + timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
    return None


def _parse_chinese_weekday(expr: str, now: datetime) -> datetime | None:
    """Parse 下周一/二/.../日 patterns."""
    weekday_match = re.search(r"下周([一二三四五六日天])", expr)
    if weekday_match:
        target_weekday = CHINESE_WEEKDAY_MAP[weekday_match.group(1)]
        days_ahead = target_weekday - now.weekday()
        if days_ahead <= 0:
            days_ahead += DAYS_IN_WEEK
        days_ahead += DAYS_IN_WEEK
        return (now + timedelta(days=days_ahead)).replace(hour=0, minute=0, second=0, microsecond=0)
    return None


def _parse_english_weekday(expr: str, now: datetime) -> datetime | None:
    """Parse next Monday/Tuesday/etc patterns."""
    for day_name, day_num in ENGLISH_WEEKDAY_MAP.items():
        if f"next {day_name}" in expr:
            days_ahead = day_num - now.weekday()
            if days_ahead <= 0:
                days_ahead += DAYS_IN_WEEK
            days_ahead += DAYS_IN_WEEK
            return (now + timedelta(days=days_ahead)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
    return None


def _parse_relative_time(expr: str, now: datetime) -> datetime | None:
    """Parse all relative time expressions."""
    result = _parse_relative_day(expr, now)
    if result:
        return result

    result = _parse_days_offset(expr, now)
    if result:
        return result

    result = _parse_chinese_weekday(expr, now)
    if result:
        return result

    return _parse_english_weekday(expr, now)


def _apply_chinese_time(time_expression: str, result: datetime) -> datetime:
    """Apply Chinese time patterns like 下午3点."""
    for pattern, offset in CHINESE_TIME_PATTERNS:
        match = re.search(pattern, time_expression)
        if match:
            hour = int(match.group(1))
            minute = int(match.group(2)) if match.group(2) else 0
            if offset == PM_HOUR_OFFSET and hour < PM_HOUR_OFFSET:
                hour += PM_HOUR_OFFSET
            return result.replace(hour=hour, minute=minute)
    return result


def _apply_english_time(expr: str, result: datetime) -> datetime:
    """Apply English time patterns like 3pm, 3:30pm."""
    en_time_match = re.search(r"(\d{1,2}):?(\d{2})?\s*(am|pm)?", expr, re.IGNORECASE)
    if en_time_match:
        hour = int(en_time_match.group(1))
        minute = int(en_time_match.group(2)) if en_time_match.group(2) else 0
        ampm = en_time_match.group(3)
        if ampm and ampm.lower() == "pm" and hour < PM_HOUR_OFFSET:
            hour += PM_HOUR_OFFSET
        elif ampm and ampm.lower() == "am" and hour == PM_HOUR_OFFSET:
            hour = 0
        return result.replace(hour=hour, minute=minute)
    return result


def _extract_time_of_day(time_expression: str, expr: str, result: datetime) -> datetime:
    """Extract and apply time of day from expression."""
    result = _apply_chinese_time(time_expression, result)
    return _apply_english_time(expr, result)


class TimeTools:
    """Time parsing tools mixin"""

    lang: str

    def _msg(self, key: str, **kwargs) -> str:
        return get_message(self.lang, key, **kwargs)

    def parse_time(self, time_expression: str) -> str:
        """Parse natural language time expression to ISO format

        Args:
            time_expression: Natural language time like '明天下午3点', 'next Monday',
                           '三天后', '2024-01-20 14:00'

        Returns:
            Parsed ISO format datetime or error message
        """
        try:
            # Relative dates should be based on user's local day, then converted to UTC.
            now = get_local_now()
            expr = time_expression.lower()
            time_already_set = False

            # Try ISO format first
            result, time_already_set = _parse_iso_format(time_expression)

            # Try common date formats
            if not result:
                result, time_already_set = _parse_date_formats(time_expression)

            # Try relative time patterns
            if not result:
                result = _parse_relative_time(expr, now)

            # Extract time of day (only if not already set)
            if result and not time_already_set:
                result = _extract_time_of_day(time_expression, expr, result)

            if result:
                result = to_utc(result)
                return self._msg("parse_time_success", result=result.isoformat())

            return self._msg(
                "parse_time_failed",
                expression=time_expression,
                error="Unrecognized format",
            )

        except Exception as e:
            logger.error(f"Failed to parse time: {e}")
            return self._msg("parse_time_failed", expression=time_expression, error=str(e))
