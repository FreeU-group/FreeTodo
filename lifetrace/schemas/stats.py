"""统计相关的 Pydantic 模型"""

from typing import Any

from pydantic import BaseModel


class StatisticsResponse(BaseModel):
    total_screenshots: int
    processed_screenshots: int
    pending_tasks: int
    today_screenshots: int
    processing_rate: float


class BehaviorStatsResponse(BaseModel):
    behavior_records: list[dict[str, Any]]
    daily_stats: list[dict[str, Any]]
    action_distribution: dict[str, int]
    hourly_activity: dict[int, int]
    total_records: int


class DashboardStatsResponse(BaseModel):
    today_activity: dict[str, int]
    weekly_trend: list[dict[str, Any]]
    top_actions: list[dict[str, Any]]
    performance_metrics: dict[str, float]


class AppUsageStatsResponse(BaseModel):
    app_usage_summary: list[dict[str, Any]]
    daily_app_usage: list[dict[str, Any]]
    hourly_app_distribution: dict[int, dict[str, int]]
    top_apps_by_time: list[dict[str, Any]]
    app_switching_patterns: list[dict[str, Any]]
    total_apps_used: int
    total_usage_time: float

    class Config:
        arbitrary_types_allowed = True
