"""时间分配相关路由"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from lifetrace.schemas.stats import TimeAllocationResponse
from lifetrace.storage import event_mgr
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api", tags=["time-allocation"])


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

        # 计算总使用时间（秒）
        total_time = int(stats_data.get("total_time", 0))

        # 构建24小时分布数据
        hourly_usage = stats_data.get("hourly_usage", {})
        daily_distribution = []
        for hour in range(24):
            hour_data = {"hour": hour, "apps": {}}
            if hour in hourly_usage:
                # 转换秒为整数
                for app_name, duration in hourly_usage[hour].items():
                    hour_data["apps"][app_name] = int(duration)
            daily_distribution.append(hour_data)

        # 构建应用详情列表
        app_usage_summary = stats_data.get("app_usage_summary", {})
        app_details = []

        # 应用分类逻辑（优先匹配社交类应用）
        def categorize_app(app_name: str) -> str:
            if not app_name:
                return "other"

            app_lower = app_name.lower().strip()

            # 社交类应用（优先匹配，避免被其他类别误判）
            social_keywords = [
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
            ]
            if any(keyword in app_lower for keyword in social_keywords):
                return "social"

            # 浏览器
            browser_keywords = [
                "chrome",
                "msedge",
                "edge",
                "firefox",
                "browser",
                "浏览器",
                "safari",
                "opera",
                "brave",
            ]
            if any(keyword in app_lower for keyword in browser_keywords):
                return "browser"

            # 开发工具
            dev_keywords = [
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
            ]
            if any(keyword in app_lower for keyword in dev_keywords):
                return "development"

            # 文件管理
            file_keywords = ["explorer", "文件", "file", "finder", "nautilus", "dolphin", "thunar"]
            if any(keyword in app_lower for keyword in file_keywords):
                return "file_management"

            # Office 办公软件
            office_keywords = [
                "word",
                "excel",
                "powerpoint",
                "wps",
                "libreoffice",
                "office",
                "onenote",
                "outlook",
            ]
            if any(keyword in app_lower for keyword in office_keywords):
                return "office"

            # 其他
            return "other"

        for app_name, app_data in app_usage_summary.items():
            app_details.append(
                {
                    "app_name": app_name,
                    "total_time": int(app_data.get("total_time", 0)),
                    "category": categorize_app(app_name),
                }
            )

        # 按使用时间排序
        app_details.sort(key=lambda x: x["total_time"], reverse=True)

        return TimeAllocationResponse(
            total_time=total_time, daily_distribution=daily_distribution, app_details=app_details
        )

    except Exception as e:
        logger.error(f"获取时间分配数据失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取时间分配数据失败: {str(e)}") from e
