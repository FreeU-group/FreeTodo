"""时间解析工具函数"""

import re
from datetime import datetime, time, timedelta

from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 常量定义
MAX_HOUR = 23
MAX_MINUTE = 59
NOON_HOUR = 12


def _parse_24h_time(time_str: str) -> tuple[int, int] | None:
    """解析24小时制时间格式"""
    pattern_24h = r"(\d{1,2}):?(\d{2})"
    match = re.match(pattern_24h, time_str.strip())
    if match:
        hour = int(match.group(1))
        minute = int(match.group(2))
        if 0 <= hour <= MAX_HOUR and 0 <= minute <= MAX_MINUTE:
            return (hour, minute)
    return None


def _parse_12h_time(time_str: str) -> tuple[int, int] | None:
    """解析12小时制时间格式（如：下午3点）"""
    time_str_lower = time_str.lower()
    hour_map = {
        "凌晨": 0,
        "早上": 6,
        "上午": 9,
        "中午": 12,
        "下午": 13,
        "傍晚": 18,
        "晚上": 20,
        "深夜": 23,
    }

    for period in hour_map:
        if period in time_str_lower:
            # 提取数字
            numbers = re.findall(r"\d+", time_str)
            if numbers:
                hour = int(numbers[0])
                if period in ["下午", "傍晚", "晚上"] and hour < NOON_HOUR:
                    hour += NOON_HOUR
                elif period == "中午" and hour == NOON_HOUR:
                    hour = NOON_HOUR
                elif period in ["凌晨", "早上", "上午"] and hour == NOON_HOUR:
                    hour = 0
                minute = int(numbers[1]) if len(numbers) > 1 else 0
                if 0 <= hour <= MAX_HOUR and 0 <= minute <= MAX_MINUTE:
                    return (hour, minute)
    return None


def parse_time_string(time_str: str) -> tuple[int, str] | None:
    """
    解析时间字符串，提取小时和分钟

    Args:
        time_str: 时间字符串，如 "13:00", "下午3点", "15:30"

    Returns:
        (小时, 分钟) 元组，如果解析失败返回None
    """
    if not time_str:
        return None

    # 先尝试24小时制格式
    result = _parse_24h_time(time_str)
    if result:
        return result

    # 再尝试12小时制格式
    result = _parse_12h_time(time_str)
    if result:
        return result

    logger.warning(f"无法解析时间字符串: {time_str}")
    return None


def normalize_time_string(time_str: str) -> str:
    """
    标准化时间字符串为24小时制格式

    Args:
        time_str: 原始时间字符串

    Returns:
        标准化后的时间字符串（HH:MM格式），如果解析失败返回原字符串
    """
    result = parse_time_string(time_str)
    if result:
        hour, minute = result
        return f"{hour:02d}:{minute:02d}"
    return time_str


def parse_relative_time(
    relative_days: int,
    relative_time_str: str,
    reference_time: datetime,
) -> datetime | None:
    """
    解析相对时间并转换为绝对时间

    Args:
        relative_days: 相对天数（0=今天，1=明天，2=后天，-1=昨天）
        relative_time_str: 相对时间点字符串（如 "13:00"）
        reference_time: 参考时间（通常是事件的开始时间或结束时间）

    Returns:
        解析后的绝对时间，如果解析失败返回None
    """
    try:
        # 解析时间字符串
        time_result = parse_time_string(relative_time_str)
        if not time_result:
            logger.warning(f"无法解析相对时间字符串: {relative_time_str}")
            return None

        hour, minute = time_result

        # 计算目标日期
        target_date = reference_time.date() + timedelta(days=relative_days)

        # 组合日期和时间
        target_datetime = datetime.combine(target_date, time(hour, minute))

        # 如果目标时间早于参考时间，且relative_days为0，可能需要调整到明天
        if relative_days == 0 and target_datetime < reference_time:
            # 可能是"今天下午1点"，但现在已经过了，可能指的是明天
            # 这里保持原逻辑，由调用方决定是否调整
            pass

        return target_datetime

    except Exception as e:
        logger.error(f"解析相对时间失败: {e}")
        return None


def parse_absolute_time(absolute_time_str: str | datetime) -> datetime | None:
    """
    解析绝对时间

    Args:
        absolute_time_str: 绝对时间字符串（ISO格式）或datetime对象

    Returns:
        解析后的datetime对象，如果解析失败返回None
    """
    if isinstance(absolute_time_str, datetime):
        return absolute_time_str

    if not absolute_time_str:
        return None

    try:
        # 尝试解析ISO格式
        if "T" in absolute_time_str or " " in absolute_time_str:
            # ISO格式：2024-01-15T13:00:00 或 2024-01-15 13:00:00
            dt = datetime.fromisoformat(absolute_time_str.replace(" ", "T"))
            return dt
        else:
            # 日期格式：2024-01-15
            dt = datetime.fromisoformat(absolute_time_str)
            return dt

    except Exception as e:
        logger.warning(f"解析绝对时间失败: {absolute_time_str}, 错误: {e}")
        return None


def calculate_scheduled_time(time_info: dict, reference_time: datetime) -> datetime | None:
    """
    根据时间信息计算计划时间

    Args:
        time_info: 时间信息字典，包含time_type、relative_days、relative_time、absolute_time等
        reference_time: 参考时间（事件开始时间或结束时间）

    Returns:
        计算后的绝对时间，如果计算失败返回None
    """
    time_type = time_info.get("time_type")

    if time_type == "absolute":
        absolute_time = time_info.get("absolute_time")
        if absolute_time:
            return parse_absolute_time(absolute_time)
        return None

    elif time_type == "relative":
        relative_days = time_info.get("relative_days")
        relative_time_str = time_info.get("relative_time")

        if relative_days is not None and relative_time_str:
            return parse_relative_time(relative_days, relative_time_str, reference_time)

        return None

    else:
        logger.warning(f"未知的时间类型: {time_type}")
        return None
