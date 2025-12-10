"""
活动聚合任务
定时聚合15分钟内的事件，使用LLM总结，存储到活动表
"""

from datetime import datetime, timedelta

from lifetrace.llm.activity_summary_service import activity_summary_service
from lifetrace.storage import activity_mgr
from lifetrace.storage.models import Event
from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 常量定义
LONG_EVENT_DURATION_MINUTES = 30  # 长事件判断标准（分钟）
QUERY_LOOKBACK_HOURS = 1  # 查询回溯时间（小时）


def is_long_event(event: Event) -> bool:
    """判断是否为长事件（>=30分钟）

    Args:
        event: 事件对象

    Returns:
        是否为长事件
    """
    if not event.end_time:
        return False
    duration = (event.end_time - event.start_time).total_seconds()
    return duration >= LONG_EVENT_DURATION_MINUTES * 60


def round_to_15_minutes(dt: datetime) -> datetime:
    """将时间向下取整到最近的15分钟边界

    Args:
        dt: 原始时间

    Returns:
        取整后的时间
    """
    minutes = dt.minute
    rounded_minutes = (minutes // 15) * 15
    return dt.replace(minute=rounded_minutes, second=0, microsecond=0)


def group_short_events_by_window(
    events: list[Event],
) -> dict[datetime, list[Event]]:
    """将短事件按15分钟窗口分组

    Args:
        events: 事件列表

    Returns:
        按窗口分组的字典，key为窗口开始时间，value为事件列表
    """
    grouped: dict[datetime, list[Event]] = {}
    for event in events:
        window_start = round_to_15_minutes(event.start_time)
        if window_start not in grouped:
            grouped[window_start] = []
        grouped[window_start].append(event)
    return grouped


def create_activity_for_long_event(event: Event) -> bool:
    """为长事件单独创建活动

    Args:
        event: 长事件对象

    Returns:
        是否成功
    """
    try:
        # 检查是否已存在重叠的活动
        if activity_mgr.activity_overlaps_with_event(event):
            logger.debug(f"事件 {event.id} 已存在重叠的活动，跳过")
            return False

        # 准备事件数据
        event_data = {
            "ai_title": event.ai_title or "",
            "ai_summary": event.ai_summary or "",
        }

        # 生成活动摘要
        result = activity_summary_service.generate_activity_summary(
            events=[event_data],
            start_time=event.start_time,
            end_time=event.end_time,
        )

        if not result:
            logger.warning(f"为长事件 {event.id} 生成摘要失败")
            return False

        # 创建活动记录
        activity_id = activity_mgr.create_activity(
            start_time=event.start_time,
            end_time=event.end_time,
            ai_title=result["title"],
            ai_summary=result["summary"],
            event_ids=[event.id],
        )

        if activity_id:
            logger.info(f"为长事件 {event.id} 创建活动 {activity_id}: {result['title']}")
            return True
        else:
            logger.error(f"为长事件 {event.id} 创建活动失败")
            return False

    except Exception as e:
        logger.error(f"为长事件 {event.id} 创建活动时出错: {e}", exc_info=True)
        return False


def create_activity_for_window(window_start: datetime, window_events: list[Event]) -> bool:
    """为15分钟窗口内的短事件创建活动

    Args:
        window_start: 窗口开始时间
        window_events: 窗口内的事件列表

    Returns:
        是否成功
    """
    try:
        # 检查是否已存在活动记录
        window_end = window_start + timedelta(minutes=15)
        if activity_mgr.activity_exists_for_time_window(window_start, window_end):
            logger.debug(f"窗口 {window_start} 已存在活动记录，跳过")
            return False

        # 准备事件数据
        events_data = []
        for event in window_events:
            events_data.append(
                {
                    "ai_title": event.ai_title or "",
                    "ai_summary": event.ai_summary or "",
                }
            )

        # 生成活动摘要
        result = activity_summary_service.generate_activity_summary(
            events=events_data,
            start_time=window_start,
            end_time=window_end,
        )

        if not result:
            logger.warning(f"为窗口 {window_start} 生成摘要失败")
            return False

        # 创建活动记录
        event_ids = [e.id for e in window_events]
        activity_id = activity_mgr.create_activity(
            start_time=window_start,
            end_time=window_end,
            ai_title=result["title"],
            ai_summary=result["summary"],
            event_ids=event_ids,
        )

        if activity_id:
            logger.info(
                f"为窗口 {window_start} 创建活动 {activity_id}: {result['title']}，包含 {len(event_ids)} 个事件"
            )
            return True
        else:
            logger.error(f"为窗口 {window_start} 创建活动失败")
            return False

    except Exception as e:
        logger.error(f"为窗口 {window_start} 创建活动时出错: {e}", exc_info=True)
        return False


def execute_activity_aggregation_task():
    """执行活动聚合任务"""
    try:
        logger.info("开始执行活动聚合任务")

        # 1. 计算查询时间范围（过去一段时间，确保覆盖所有待处理事件）
        now = datetime.now()
        query_start_time = now - timedelta(hours=QUERY_LOOKBACK_HOURS)

        # 2. 查询已完成且有AI总结且未关联到活动的事件
        events = activity_mgr.get_unprocessed_events(query_start_time)

        # 3. 边界情况检查
        if not events:
            logger.debug("无待处理事件，跳过")
            return

        logger.info(f"找到 {len(events)} 个待处理事件")

        # 4. 分离长事件和短事件
        long_events = [e for e in events if is_long_event(e)]  # >= 30分钟
        short_events = [e for e in events if not is_long_event(e)]  # < 30分钟

        logger.info(f"长事件: {len(long_events)} 个，短事件: {len(short_events)} 个")

        # 5. 处理长事件（单独创建活动）
        long_event_count = 0
        for event in long_events:
            # 检查是否已关联
            if activity_mgr.activity_exists_for_event(event):
                logger.debug(f"长事件 {event.id} 已关联到活动，跳过")
                continue

            if create_activity_for_long_event(event):
                long_event_count += 1

        logger.info(f"成功处理 {long_event_count} 个长事件")

        # 6. 处理短事件（按15分钟窗口聚合）
        # 先过滤掉已关联的短事件
        unprocessed_short_events = [
            e for e in short_events if not activity_mgr.activity_exists_for_event(e)
        ]

        if unprocessed_short_events:
            # 按窗口分组
            grouped_events = group_short_events_by_window(unprocessed_short_events)

            # 对每个窗口进行处理
            window_count = 0
            for window_start, window_events in grouped_events.items():
                if create_activity_for_window(window_start, window_events):
                    window_count += 1

            logger.info(
                f"成功处理 {window_count} 个时间窗口，包含 {len(unprocessed_short_events)} 个短事件"
            )

        logger.info("活动聚合任务执行完成")

    except Exception as e:
        logger.error(f"执行活动聚合任务失败: {e}", exc_info=True)


# 全局单例（用于延迟初始化）
_aggregator_instance = None


def get_aggregator_instance():
    """获取聚合器实例（用于初始化）"""
    global _aggregator_instance
    if _aggregator_instance is None:
        _aggregator_instance = True  # 不需要实际实例，只是占位
    return _aggregator_instance
