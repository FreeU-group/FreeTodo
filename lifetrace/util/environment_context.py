"""环境上下文工具模块

为 Agent 提供环境上下文信息，主要用于时间相关的查询理解
"""

from datetime import datetime

from lifetrace.util.logging_config import get_logger

logger = get_logger()


def get_environment_context() -> str:
    """
    获取环境上下文信息

    返回包含当前日期和时间的上下文字符串，用于帮助 Agent 理解时间相关查询
    如"今天"、"本周"、"最近3天"等。

    Returns:
        环境上下文字符串，格式：当前日期和时间信息

    Note:
        仅收集业务相关的日期时间信息，不收集技术信息（Python版本、操作系统等）
    """
    try:
        # 获取当前日期和时间（本地化格式）
        now = datetime.now()

        # 格式化日期：年月日 星期
        date_str = now.strftime("%Y年%m月%d日")

        # 获取星期几（中文）
        weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
        weekday_str = weekdays[now.weekday()]

        # 格式化时间：时分
        time_str = now.strftime("%H:%M")

        # 构建环境上下文
        context = f"""当前日期和时间信息：
- 日期：{date_str} {weekday_str}
- 时间：{time_str}

此信息用于帮助你理解用户查询中的时间概念，如"今天"、"本周"、"最近3天"等。"""

        return context
    except Exception as e:
        logger.warning(f"获取环境上下文失败: {e}")
        # 失败时返回最小化信息
        return f"当前日期：{datetime.now().strftime('%Y-%m-%d')}"
