"""用户行为统计相关路由"""

from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query

from lifetrace.routers import dependencies as deps
from lifetrace.schemas.stats import (
    AppUsageStatsResponse,
    BehaviorStatsResponse,
    DashboardStatsResponse,
)

router = APIRouter(prefix="/api", tags=["behavior"])


@router.get("/behavior-stats", response_model=BehaviorStatsResponse)
async def get_behavior_stats(
    days: int = Query(7, description="获取最近多少天的数据"),
    action_type: str | None = Query(None, description="行为类型过滤"),
    limit: int = Query(100, description="返回记录数限制"),
):
    """获取用户行为统计数据"""
    try:
        start_date = datetime.now() - timedelta(days=days)

        # 获取行为记录
        behavior_records = deps.behavior_tracker.get_behavior_stats(
            start_date=start_date, action_type=action_type, limit=limit
        )

        # 获取每日统计
        daily_stats = deps.behavior_tracker.get_daily_stats(days=days)

        # 获取行为类型分布
        action_distribution = deps.behavior_tracker.get_action_type_distribution(days=days)

        # 获取小时活动分布
        hourly_activity = deps.behavior_tracker.get_hourly_activity(days=days)

        return BehaviorStatsResponse(
            behavior_records=behavior_records,
            daily_stats=daily_stats,
            action_distribution=action_distribution,
            hourly_activity=hourly_activity,
            total_records=len(behavior_records),
        )
    except Exception as e:
        deps.logger.error(f"获取行为统计失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取行为统计失败: {str(e)}") from e


@router.get("/dashboard-stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats():
    """获取仪表板统计数据"""
    try:
        # 今日活动统计
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        today_records = deps.behavior_tracker.get_behavior_stats(start_date=today, limit=1000)

        today_activity = {}
        for record in today_records:
            action_type = record["action_type"]
            today_activity[action_type] = today_activity.get(action_type, 0) + 1

        # 一周趋势
        weekly_trend = []
        for i in range(7):
            day_start = today - timedelta(days=i)
            day_end = day_start + timedelta(days=1)
            day_records = deps.behavior_tracker.get_behavior_stats(
                start_date=day_start, end_date=day_end, limit=1000
            )
            weekly_trend.append(
                {
                    "date": day_start.strftime("%Y-%m-%d"),
                    "total_actions": len(day_records),
                    "searches": len([r for r in day_records if r["action_type"] == "search"]),
                    "chats": len([r for r in day_records if r["action_type"] == "chat"]),
                    "views": len([r for r in day_records if r["action_type"] == "view_screenshot"]),
                }
            )

        # 热门操作
        action_distribution = deps.behavior_tracker.get_action_type_distribution(days=7)
        top_actions = [
            {"action": action, "count": count}
            for action, count in sorted(
                action_distribution.items(), key=lambda x: x[1], reverse=True
            )[:5]
        ]

        # 性能指标
        performance_metrics = {
            "avg_response_time": sum(
                [r.get("response_time", 0) for r in today_records if r.get("response_time")]
            )
            / max(len([r for r in today_records if r.get("response_time")]), 1),
            "success_rate": len([r for r in today_records if r.get("success", True)])
            / max(len(today_records), 1)
            * 100,
            "total_sessions": len(
                {r.get("session_id") for r in today_records if r.get("session_id")}
            ),
        }

        return DashboardStatsResponse(
            today_activity=today_activity,
            weekly_trend=weekly_trend,
            top_actions=top_actions,
            performance_metrics=performance_metrics,
        )
    except Exception as e:
        deps.logger.error(f"获取仪表板统计失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取仪表板统计失败: {str(e)}") from e


@router.get("/app-usage-stats", response_model=AppUsageStatsResponse)
async def get_app_usage_stats(
    days: int = Query(7, description="统计天数", ge=1, le=365),
):
    """获取应用使用统计数据"""
    try:
        # 使用新的AppUsageLog表获取统计数据
        stats_data = deps.db_manager.get_app_usage_stats(days=days)

        # 转换数据格式以匹配前端期望
        app_usage_list = []
        for _app_name, app_data in stats_data["app_usage_summary"].items():
            formatted_data = {
                "app_name": app_data["app_name"],
                "total_time": app_data["total_time"],
                "session_count": app_data["session_count"],
                "avg_session_time": app_data["total_time"] / app_data["session_count"]
                if app_data["session_count"] > 0
                else 0,
                "first_used": app_data["last_used"].isoformat(),
                "last_used": app_data["last_used"].isoformat(),
                "total_time_formatted": f"{app_data['total_time'] / 3600:.1f}小时",
                "avg_session_time_formatted": f"{(app_data['total_time'] / app_data['session_count'] if app_data['session_count'] > 0 else 0) / 60:.1f}分钟",
            }
            app_usage_list.append(formatted_data)

        # 按使用时长排序
        app_usage_list.sort(key=lambda x: x["total_time"], reverse=True)

        # 前10个应用
        top_apps_by_time = app_usage_list[:10]

        # 每日应用使用数据格式化
        daily_app_usage_list = []
        for date, apps in stats_data["daily_usage"].items():
            daily_data = {"date": date, "apps": []}
            for app_name, duration in apps.items():
                daily_data["apps"].append(
                    {
                        "app_name": app_name,
                        "duration": duration,
                        "duration_formatted": f"{duration / 3600:.1f}小时",
                    }
                )
            daily_data["apps"].sort(key=lambda x: x["duration"], reverse=True)
            daily_app_usage_list.append(daily_data)

        daily_app_usage_list.sort(key=lambda x: x["date"])

        # 小时分布数据转换
        hourly_app_distribution = {}
        for hour in range(24):
            hourly_app_distribution[hour] = {}
            if hour in stats_data["hourly_usage"]:
                for app_name, duration in stats_data["hourly_usage"][hour].items():
                    hourly_app_distribution[hour][app_name] = int(duration)

        return AppUsageStatsResponse(
            app_usage_summary=app_usage_list,
            daily_app_usage=daily_app_usage_list,
            hourly_app_distribution=hourly_app_distribution,
            top_apps_by_time=top_apps_by_time,
            app_switching_patterns=[],  # 暂时为空，可以后续添加
            total_apps_used=stats_data["total_apps"],
            total_usage_time=stats_data["total_time"],
        )

    except Exception as e:
        deps.logger.error(f"获取应用使用统计失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取应用使用统计失败: {str(e)}") from e
