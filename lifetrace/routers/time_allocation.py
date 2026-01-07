"""时间分配相关路由"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from lifetrace.schemas.stats import TimeAllocationResponse
from lifetrace.storage import event_mgr
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api", tags=["time-allocation"])

# 应用分类关键词映射
_APP_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "social": [
        "qq",
        "wechat",
        "weixin",
        "微信",
        "telegram",
        "discord",
        "slack",
        "dingtalk",
        "钉钉",
        "wxwork",
        "企业微信",
        "feishu",
        "飞书",
        "lark",
        "whatsapp",
        "line",
        "skype",
        "zoom",
        "teams",
        "腾讯会议",
    ],
    "browser": [
        "chrome",
        "msedge",
        "edge",
        "firefox",
        "browser",
        "浏览器",
        "safari",
        "opera",
        "brave",
    ],
    "development": [
        "code",
        "vscode",
        "visual studio code",
        "pycharm",
        "idea",
        "intellij",
        "webstorm",
        "editor",
        "开发工具",
        "sublime",
        "atom",
        "vim",
        "neovim",
        "github desktop",
        "git",
        "github",
        "gitkraken",
        "sourcetree",
    ],
    "file_management": [
        "explorer",
        "文件",
        "file",
        "finder",
        "nautilus",
        "dolphin",
        "thunar",
    ],
    "office": [
        "word",
        "excel",
        "powerpoint",
        "wps",
        "libreoffice",
        "office",
        "onenote",
        "outlook",
    ],
}


def _categorize_app(app_name: str) -> str:
    """应用分类逻辑（优先匹配社交类应用）"""
    if not app_name:
        return "other"

    app_lower = app_name.lower().strip()

    # 按优先级顺序检查各分类
    for category, keywords in _APP_CATEGORY_KEYWORDS.items():
        if any(keyword in app_lower for keyword in keywords):
            return category

    return "other"


def _build_daily_distribution(hourly_usage: dict[int, dict[str, float]]) -> list[dict]:
    """构建24小时分布数据"""
    daily_distribution = []
    for hour in range(24):
        hour_data: dict = {"hour": hour, "apps": {}}
        if hour in hourly_usage:
            for app_name, duration in hourly_usage[hour].items():
                hour_data["apps"][app_name] = int(duration)
        daily_distribution.append(hour_data)
    return daily_distribution


def _build_app_details(app_usage_summary: dict[str, dict]) -> list[dict]:
    """构建应用详情列表"""
    app_details = [
        {
            "app_name": app_name,
            "total_time": int(app_data.get("total_time", 0)),
            "category": _categorize_app(app_name),
        }
        for app_name, app_data in app_usage_summary.items()
    ]
    app_details.sort(key=lambda x: x["total_time"], reverse=True)
    return app_details


@router.get("/time-allocation", response_model=TimeAllocationResponse)
async def get_time_allocation(
    start_date: str | None = Query(None, description="开始日期, YYYY-MM-DD 格式"),
    end_date: str | None = Query(None, description="结束日期, YYYY-MM-DD 格式"),
    days: int = Query(None, description="统计天数 (弃用, 仅用于兼容)", ge=1, le=365),
):
    """获取时间分配数据（支持日期区间或天数）"""
    try:
        if start_date and end_date:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
            stats_data = event_mgr.get_app_usage_stats(start_date=start_dt, end_date=end_dt)
        else:
            use_days = days if days else 7
            stats_data = event_mgr.get_app_usage_stats(days=use_days)

        total_time = int(stats_data.get("total_time", 0))
        daily_distribution = _build_daily_distribution(stats_data.get("hourly_usage", {}))
        app_details = _build_app_details(stats_data.get("app_usage_summary", {}))

        return TimeAllocationResponse(
            total_time=total_time, daily_distribution=daily_distribution, app_details=app_details
        )

    except Exception as e:
        logger.error(f"获取时间分配数据失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取时间分配数据失败: {str(e)}") from e
