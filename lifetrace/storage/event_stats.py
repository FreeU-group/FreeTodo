"""
事件统计模块
包含应用使用统计相关方法
"""

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.models import Event
from lifetrace.util.logging_config import get_logger

logger = get_logger()


def get_app_usage_stats(
    db_base: DatabaseBase,
    days: int = None,
    start_date: datetime = None,
    end_date: datetime = None,
) -> dict[str, Any]:
    """基于 Event 表获取应用使用统计数据

    相比 AppUsageLog 表，使用 Event 表统计有以下优势：
    1. 更准确：使用真实的 start_time 和 end_time 计算持续时间
    2. 数据量更小：不需要每次截图都记录
    3. 逻辑更简单：减少冗余表和存储逻辑

    Args:
        db_base: 数据库基类实例
        days: 统计最近多少天（默认7天）
        start_date: 开始日期
        end_date: 结束日期

    Returns:
        包含应用使用统计的字典
    """
    try:
        with db_base.get_session() as session:
            # 计算时间范围
            if start_date and end_date:
                dt_start = start_date
                dt_end = end_date + timedelta(days=1) - timedelta(seconds=1)
            else:
                dt_end = datetime.now()
                use_days = days if days else 7
                dt_start = dt_end - timedelta(days=use_days)

            # 查询已结束的事件
            events = (
                session.query(Event)
                .filter(
                    Event.start_time >= dt_start,
                    Event.start_time <= dt_end,
                    Event.end_time.isnot(None),
                )
                .all()
            )

            # 聚合统计数据
            app_usage_summary = {}
            daily_usage = {}
            hourly_usage = {}

            for event in events:
                app_name = event.app_name
                if not app_name:
                    continue

                duration = (event.end_time - event.start_time).total_seconds()
                date_str = event.start_time.strftime("%Y-%m-%d")
                hour = event.start_time.hour

                # 应用使用汇总
                if app_name not in app_usage_summary:
                    app_usage_summary[app_name] = {
                        "app_name": app_name,
                        "total_time": 0,
                        "session_count": 0,
                        "last_used": event.end_time,
                    }

                app_usage_summary[app_name]["total_time"] += duration
                app_usage_summary[app_name]["session_count"] += 1
                app_usage_summary[app_name]["last_used"] = max(
                    app_usage_summary[app_name]["last_used"], event.end_time
                )

                # 每日使用统计
                if date_str not in daily_usage:
                    daily_usage[date_str] = {}
                if app_name not in daily_usage[date_str]:
                    daily_usage[date_str][app_name] = 0
                daily_usage[date_str][app_name] += duration

                # 小时使用统计
                if hour not in hourly_usage:
                    hourly_usage[hour] = {}
                if app_name not in hourly_usage[hour]:
                    hourly_usage[hour][app_name] = 0
                hourly_usage[hour][app_name] += duration

            return {
                "app_usage_summary": app_usage_summary,
                "daily_usage": daily_usage,
                "hourly_usage": hourly_usage,
                "total_apps": len(app_usage_summary),
                "total_time": sum(app["total_time"] for app in app_usage_summary.values()),
            }

    except SQLAlchemyError as e:
        logger.error(f"从Event表获取应用使用统计失败: {e}")
        return {
            "app_usage_summary": {},
            "daily_usage": {},
            "hourly_usage": {},
            "total_apps": 0,
            "total_time": 0,
        }
