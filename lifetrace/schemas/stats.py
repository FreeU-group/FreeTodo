"""统计相关的 Pydantic 模型"""

from typing import Any

from pydantic import BaseModel


class StatisticsResponse(BaseModel):
    total_screenshots: int
    processed_screenshots: int
    today_screenshots: int
    processing_rate: float


class TimeAllocationResponse(BaseModel):
    """时间分配响应模型"""

    total_time: int  # 总使用时间（秒）
    daily_distribution: list[
        dict[str, Any]
    ]  # 24小时分布，格式: [{"hour": 0, "apps": {"app_name": seconds}}, ...]
    app_details: list[
        dict[str, Any]
    ]  # 应用详情，格式: [{"app_name": "xxx.exe", "total_time": seconds, "category": "社交"}, ...]

    class Config:
        arbitrary_types_allowed = True
