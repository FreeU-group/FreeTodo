"""
DDL 提醒任务
定期检查待办事项的截止日期，在 DDL 前 5 分钟生成通知
"""

from datetime import datetime, timedelta

from lifetrace.storage import todo_mgr
from lifetrace.storage.models import Todo
from lifetrace.storage.notification_storage import (
    add_notification,
    clear_dismissed_mark,
    clear_notification_by_todo_id,
    get_notification_by_todo_id,
    is_notification_dismissed,
)
from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings
from lifetrace.util.time_utils import get_utc_now, naive_as_utc

logger = get_logger()


def execute_deadline_reminder_task():  # noqa: C901
    """
    执行 DDL 提醒任务
    检查即将到期的待办事项（5 分钟内），生成通知
    """
    try:
        # 获取提醒时间窗口（默认 5 分钟）
        reminder_window_minutes = settings.get(
            "jobs.deadline_reminder.params.reminder_window_minutes", 5
        )

        # 计算时间范围
        now = get_utc_now()
        deadline_threshold = now + timedelta(minutes=reminder_window_minutes)

        logger.debug(
            f"检查 DDL 提醒: 当前时间 {now}, "
            f"提醒窗口 {reminder_window_minutes} 分钟, "
            f"截止时间阈值 {deadline_threshold}"
        )

        # 查询即将到期的待办事项
        # 条件：status == "active", deadline IS NOT NULL, deadline <= now + 5分钟, deadline > now
        # 注意：SQLite 存储 datetime 为字符串，SQLAlchemy 读取时为 naive datetime
        # 在查询比较时，SQLAlchemy 会将 timezone-aware datetime 转换为 naive 进行比较
        # 但在 Python 代码中处理时，需要确保转换为 UTC timezone-aware
        with todo_mgr.db_base.get_session() as session:
            todos = (
                session.query(Todo)
                .filter(
                    Todo.status == "active",
                    Todo.deadline.isnot(None),
                    Todo.deadline <= deadline_threshold,
                    Todo.deadline > now,
                )
                .all()
            )

            if not todos:
                logger.debug("没有即将到期的待办事项")
                return

            logger.info(f"找到 {len(todos)} 个即将到期的待办事项")

            # 为每个待办生成通知
            for todo in todos:
                if not todo.deadline:
                    continue

                # 确保 deadline 是 UTC timezone-aware
                # SQLite 存储 datetime 为字符串，SQLAlchemy 读取时为 naive datetime
                # 由于我们统一使用 UTC 存储，数据库中的 naive datetime 就是 UTC 时间
                deadline_utc = naive_as_utc(todo.deadline)

                # 生成唯一通知 ID：todo_{todo_id}
                # 每个待办只有一个通知ID，用户取消后不会再提示（除非deadline更新）
                notification_id = f"todo_{todo.id}"

                # 首先检查该deadline是否已被用户取消
                if is_notification_dismissed(todo.id, deadline_utc):
                    logger.debug(f"待办 {todo.id} 的deadline {deadline_utc} 已被用户取消，跳过提醒")
                    continue

                # 检查是否已存在该待办的通知
                existing_notification = get_notification_by_todo_id(todo.id)
                if existing_notification:
                    # 检查deadline是否相同
                    # 如果deadline相同，说明已经通知过且用户没有取消，跳过
                    # 如果deadline不同，说明deadline已更新，删除旧通知并创建新通知
                    existing_deadline_str = existing_notification.get("deadline")
                    if existing_deadline_str:
                        # 解析已存在的deadline（ISO格式字符串）
                        try:
                            existing_deadline_naive = datetime.fromisoformat(existing_deadline_str)
                            # 如果解析出来的是naive datetime，假设为UTC
                            existing_deadline = naive_as_utc(existing_deadline_naive)
                            # 比较deadline（忽略微秒级别的差异）
                            if abs((deadline_utc - existing_deadline).total_seconds()) < 1:
                                # deadline相同，跳过
                                logger.debug(
                                    f"待办 {todo.id} 已有通知且deadline未更新，跳过: {deadline_utc}"
                                )
                                continue
                        except (ValueError, TypeError):
                            # 解析失败，继续创建新通知
                            pass

                    # deadline不同，删除旧通知并清除已取消标记（允许新deadline提醒）
                    clear_notification_by_todo_id(todo.id)
                    clear_dismissed_mark(todo.id)
                    logger.debug(
                        f"待办 {todo.id} 的deadline已更新，删除旧通知: {existing_notification.get('deadline')} -> {deadline_utc}"
                    )

                # 计算剩余时间
                time_remaining = deadline_utc - now
                minutes_remaining = int(time_remaining.total_seconds() / 60)

                # 生成通知标题和内容
                # title: 待办名称
                # content: 剩余时间信息（用于前端显示）
                title = todo.name
                content = f"{minutes_remaining}分钟内"

                # 添加通知
                # 注意：由于notification_id基于todo_id，如果通知已存在（不应该发生），add_notification会去重
                added = add_notification(
                    notification_id=notification_id,
                    title=title,
                    content=content,
                    timestamp=now,
                    todo_id=todo.id,
                    deadline=deadline_utc,
                )

                if added:
                    logger.info(
                        f"生成 DDL 提醒通知: todo_id={todo.id}, "
                        f"name={todo.name}, "
                        f"deadline={deadline_utc}, "
                        f"剩余时间={minutes_remaining}分钟"
                    )
                else:
                    logger.debug(f"通知已存在，跳过: todo_id={todo.id}, deadline={deadline_utc}")

    except Exception as e:
        logger.error(f"执行 DDL 提醒任务失败: {e}", exc_info=True)
