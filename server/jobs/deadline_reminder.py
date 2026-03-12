"""
Todo 提醒调度（基于 APScheduler 的按时触发）
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, cast

from sqlalchemy import or_

from jobs.scheduler import get_scheduler_manager
from storage import todo_mgr
from storage.models import Todo
from storage.notification_storage import add_notification, is_notification_dismissed
from storage.sql_utils import col
from storage.todo_manager_utils import _normalize_reminder_offsets
from util.logging_config import get_logger
from util.settings import settings
from util.time_utils import get_utc_now, naive_as_utc

logger = get_logger()

MINUTES_PER_HOUR = 60
HOURS_PER_DAY = 24
REMINDER_JOB_PREFIX = "todo_reminder"


def _normalize_offsets(value: object | None) -> list[int]:
    offsets = _normalize_reminder_offsets(value)
    if not offsets:
        return []
    return offsets


def _get_field(todo: object, name: str) -> Any:
    if isinstance(todo, dict):
        return todo.get(name)
    return getattr(todo, name, None)


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    return naive_as_utc(parsed)


def _coerce_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return _parse_datetime(value)
    return None


def _resolve_schedule_time(todo: object) -> datetime | None:
    item_type_raw = _get_field(todo, "item_type")
    item_type = item_type_raw.upper() if isinstance(item_type_raw, str) else "VTODO"
    if item_type == "VEVENT":
        return _coerce_datetime(
            _get_field(todo, "dtstart")
            or _get_field(todo, "start_time")
            or _get_field(todo, "due")
            or _get_field(todo, "deadline")
        )
    return _coerce_datetime(
        _get_field(todo, "due")
        or _get_field(todo, "deadline")
        or _get_field(todo, "dtstart")
        or _get_field(todo, "start_time")
    )


def _format_remaining(deadline: datetime, now: datetime) -> str:
    remaining_seconds = max(0, int((deadline - now).total_seconds()))
    minutes = remaining_seconds // MINUTES_PER_HOUR
    if minutes < MINUTES_PER_HOUR:
        return f"{minutes}分钟"
    hours = minutes // MINUTES_PER_HOUR
    if hours < HOURS_PER_DAY and minutes % MINUTES_PER_HOUR == 0:
        return f"{hours}小时"
    days = hours // HOURS_PER_DAY
    if days >= 1 and hours % HOURS_PER_DAY == 0:
        return f"{days}天"
    return f"{minutes}分钟"


def _build_reminder_job_id(todo_id: int, reminder_at: datetime) -> str:
    return f"{REMINDER_JOB_PREFIX}_{todo_id}_{int(reminder_at.timestamp())}"


def _build_notification_id(todo_id: int, reminder_at: datetime) -> str:
    return f"todo_{todo_id}_reminder_{int(reminder_at.timestamp())}"


def execute_todo_reminder_job(
    todo_id: int,
    reminder_at: str,
    reminder_offset: int | None = None,
) -> None:
    """按时触发的提醒任务（由 APScheduler 直接调度）"""
    try:
        todo = todo_mgr.get_todo(todo_id)
        if not todo:
            logger.info(f"提醒任务跳过：todo 不存在: {todo_id}")
            return

        if todo.get("status") != "active":
            logger.info(f"提醒任务跳过：todo 非 active: {todo_id}")
            return

        schedule_time = _resolve_schedule_time(todo)
        if not schedule_time:
            logger.info(f"提醒任务跳过：todo 无有效时间: {todo_id}")
            return

        schedule_utc = naive_as_utc(schedule_time)
        reminder_at_dt = _parse_datetime(reminder_at) or schedule_utc

        offset = reminder_offset
        if offset is None:
            offset = max(0, int((schedule_utc - reminder_at_dt).total_seconds() // 60))

        expected_reminder_at = schedule_utc - timedelta(minutes=offset)
        if abs((expected_reminder_at - reminder_at_dt).total_seconds()) >= 1:
            logger.info(
                "提醒任务跳过：时间不匹配 todo_id=%s expected=%s actual=%s",
                todo_id,
                expected_reminder_at,
                reminder_at_dt,
            )
            return

        if is_notification_dismissed(todo_id, reminder_at_dt):
            logger.debug(
                "提醒任务跳过：通知已取消 todo_id=%s reminder_at=%s",
                todo_id,
                reminder_at_dt,
            )
            return

        now = get_utc_now()
        remaining = _format_remaining(schedule_utc, now)
        notification_id = _build_notification_id(todo_id, reminder_at_dt)

        added = add_notification(
            notification_id=notification_id,
            title=todo.get("name") or "",
            content=f"还有 {remaining}",
            timestamp=now,
            todo_id=todo_id,
            schedule_time=schedule_utc,
            reminder_at=reminder_at_dt,
            reminder_offset=offset,
        )

        if added:
            logger.info(
                "生成提醒通知: todo_id=%s, name=%s, time=%s, offset=%s",
                todo_id,
                todo.get("name"),
                schedule_utc,
                offset,
            )
    except Exception as e:
        logger.error(f"执行提醒任务失败: {e}", exc_info=True)


def schedule_todo_reminders(todo: object) -> list[str]:
    """为单个 Todo 创建按时提醒任务"""
    todo_id = _get_field(todo, "id")
    schedule_time = _resolve_schedule_time(todo)
    offsets = _normalize_offsets(_get_field(todo, "reminder_offsets"))
    scheduler = get_scheduler_manager()
    can_schedule = (
        settings.get("jobs.deadline_reminder.enabled", False)
        and isinstance(todo_id, int)
        and _get_field(todo, "status") == "active"
        and schedule_time is not None
        and offsets
        and scheduler
        and scheduler.scheduler
    )
    if not can_schedule:
        if isinstance(todo_id, int) and scheduler and not scheduler.scheduler:
            logger.warning(f"调度器未初始化，跳过提醒任务创建: todo_id={todo_id}")
        return []

    todo_id = cast("int", todo_id)
    schedule_time = cast("datetime", schedule_time)

    schedule_utc = naive_as_utc(schedule_time)
    now = get_utc_now()
    grace_seconds = settings.get("scheduler.misfire_grace_time", 60)
    try:
        grace_seconds = int(grace_seconds)
    except (TypeError, ValueError):
        grace_seconds = 60

    created_jobs: list[str] = []
    for offset in offsets:
        reminder_at = schedule_utc - timedelta(minutes=offset)
        if reminder_at <= now:
            if (now - reminder_at).total_seconds() <= grace_seconds:
                reminder_at = now
            else:
                continue

        job_id = _build_reminder_job_id(todo_id, reminder_at)
        scheduler.add_date_job(
            func=execute_todo_reminder_job,
            job_id=job_id,
            name=f"todo_{todo_id}_reminder",
            run_date=reminder_at,
            replace_existing=True,
            todo_id=todo_id,
            reminder_at=reminder_at.isoformat(),
            reminder_offset=offset,
        )
        created_jobs.append(job_id)

    return created_jobs


def remove_todo_reminder_jobs(todo_id: int) -> int:
    """移除指定 Todo 的所有提醒任务"""
    scheduler = get_scheduler_manager()
    if not scheduler or not scheduler.scheduler:
        return 0

    prefix = f"{REMINDER_JOB_PREFIX}_{todo_id}_"
    removed = 0
    for job in scheduler.get_all_jobs():
        if job.id.startswith(prefix) and scheduler.remove_job(job.id):
            removed += 1

    if removed:
        logger.debug(f"已移除 {removed} 个提醒任务: todo_id={todo_id}")
    return removed


def refresh_todo_reminders(todo: object) -> list[str]:
    """刷新单个 Todo 的提醒任务（先清理再重建）"""
    todo_id = _get_field(todo, "id")
    if isinstance(todo_id, int):
        remove_todo_reminder_jobs(todo_id)
    return schedule_todo_reminders(todo)


def clear_all_todo_reminder_jobs() -> int:
    """清理所有按时提醒任务"""
    scheduler = get_scheduler_manager()
    if not scheduler or not scheduler.scheduler:
        return 0

    removed = 0
    for job in scheduler.get_all_jobs():
        if job.id.startswith(f"{REMINDER_JOB_PREFIX}_") and scheduler.remove_job(job.id):
            removed += 1

    if removed:
        logger.info(f"清理提醒任务: {removed}")
    return removed


def sync_all_todo_reminders() -> int:
    """同步所有待办的提醒任务（启动时调用）"""
    if not settings.get("jobs.deadline_reminder.enabled", False):
        logger.info("DDL 提醒未启用，跳过同步")
        return 0

    scheduler = get_scheduler_manager()
    if not scheduler or not scheduler.scheduler:
        logger.warning("调度器未初始化，跳过提醒同步")
        return 0

    clear_all_todo_reminder_jobs()

    with todo_mgr.db_base.get_session() as session:
        todos = (
            session.query(Todo)
            .filter(
                col(Todo.status) == "active",
                or_(
                    col(Todo.due).isnot(None),
                    col(Todo.dtstart).isnot(None),
                    col(Todo.deadline).isnot(None),
                    col(Todo.start_time).isnot(None),
                ),
            )
            .all()
        )

        created = 0
        for todo in todos:
            created += len(schedule_todo_reminders(todo))

    logger.info(f"提醒任务同步完成: {created}")
    return created


def execute_deadline_reminder_task() -> None:
    """兼容旧任务入口：执行一次提醒同步"""
    sync_all_todo_reminders()
