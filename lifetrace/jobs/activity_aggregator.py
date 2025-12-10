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

        # 准备事件数据（包含时间信息以支持时间线呈现）
        event_data = {
            "ai_title": event.ai_title or "",
            "ai_summary": event.ai_summary or "",
            "start_time": event.start_time,  # 添加时间信息
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

        # 准备事件数据（包含时间信息以支持时间线呈现）
        events_data = []
        for event in window_events:
            events_data.append(
                {
                    "ai_title": event.ai_title or "",
                    "ai_summary": event.ai_summary or "",
                    "start_time": event.start_time,  # 添加时间信息
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


def _calculate_target_window(now: datetime) -> tuple[datetime, datetime] | None:
    """计算目标处理窗口

    Args:
        now: 当前时间

    Returns:
        (window_start, window_end) 或 None（如果窗口尚未完成）
    """
    window_end = round_to_15_minutes(now)
    window_start = window_end - timedelta(minutes=15)
    safety_gap = timedelta(minutes=1)  # 留出1分钟缓冲，避免正在结束的事件

    if now < window_end + safety_gap:
        logger.info("当前窗口尚未完全结束，跳过本次聚合")
        return None

    return window_start, window_end


def _filter_events_in_window(
    events: list[Event], window_start: datetime, window_end: datetime
) -> list[Event]:
    """过滤出落在目标窗口内的事件

    Args:
        events: 事件列表
        window_start: 窗口开始时间
        window_end: 窗口结束时间

    Returns:
        窗口内的事件列表
    """
    events_in_window = []
    for e in events:
        if not e.end_time:
            continue
        # 事件结束时间必须在窗口内；开始时间只需早于窗口结束即可
        if window_start <= e.end_time <= window_end and e.start_time < window_end:
            events_in_window.append(e)
    return events_in_window


def _separate_long_and_short_events(
    events: list[Event],
) -> tuple[list[Event], list[Event]]:
    """分离长事件和短事件

    Args:
        events: 事件列表

    Returns:
        (长事件列表, 短事件列表)
    """
    long_events = [e for e in events if is_long_event(e)]
    short_events = [e for e in events if not is_long_event(e)]
    return long_events, short_events


def _process_long_events(long_events: list[Event]) -> int:
    """处理长事件，为每个长事件单独创建活动

    Args:
        long_events: 长事件列表

    Returns:
        成功处理的长事件数量
    """
    long_event_count = 0
    for event in long_events:
        if activity_mgr.activity_exists_for_event(event):
            logger.debug(f"长事件 {event.id} 已关联到活动，跳过")
            continue

        if create_activity_for_long_event(event):
            long_event_count += 1

    return long_event_count


def _process_short_events(short_events: list[Event], window_start: datetime) -> tuple[int, int]:
    """处理短事件，按窗口聚合

    Args:
        short_events: 短事件列表
        window_start: 窗口开始时间

    Returns:
        (成功处理的窗口数, 处理的事件数)
    """
    unprocessed_short_events = [
        e for e in short_events if not activity_mgr.activity_exists_for_event(e)
    ]

    if not unprocessed_short_events:
        return 0, 0

    grouped_events = {window_start: unprocessed_short_events}
    window_count = 0
    for ws, window_events in grouped_events.items():
        if create_activity_for_window(ws, window_events):
            window_count += 1

    return window_count, len(unprocessed_short_events)


def execute_activity_aggregation_task():
    """执行活动聚合任务

    只处理“已结束的15分钟窗口”，避免在窗口刚开始时就生成活动导致未来事件无法合并。
    """
    try:
        logger.info("开始执行活动聚合任务")

        now = datetime.now()
        window_result = _calculate_target_window(now)
        if not window_result:
            return

        window_start, window_end = window_result

        # 查询近1小时未处理事件
        query_start_time = now - timedelta(hours=QUERY_LOOKBACK_HOURS)
        events = activity_mgr.get_unprocessed_events(query_start_time)

        if not events:
            logger.debug("无待处理事件，跳过")
            return

        # 过滤窗口内的事件
        events_in_window = _filter_events_in_window(events, window_start, window_end)
        if not events_in_window:
            logger.debug(f"窗口 {window_start} ~ {window_end} 内无可处理事件，跳过")
            return

        logger.info(f"窗口 {window_start} ~ {window_end} 待处理事件 {len(events_in_window)} 个")

        # 分离长事件和短事件
        long_events, short_events = _separate_long_and_short_events(events_in_window)
        logger.info(f"长事件: {len(long_events)} 个，短事件: {len(short_events)} 个")

        # 处理长事件
        long_event_count = _process_long_events(long_events)
        logger.info(f"成功处理 {long_event_count} 个长事件")

        # 处理短事件
        window_count, processed_event_count = _process_short_events(short_events, window_start)
        if processed_event_count > 0:
            logger.info(
                f"成功处理 {window_count} 个时间窗口，包含 {processed_event_count} 个短事件"
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
