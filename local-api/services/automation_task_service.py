"""自动化任务服务 - 负责调度同步与执行"""

from __future__ import annotations

import json
import urllib.request
from datetime import datetime
from typing import TYPE_CHECKING, Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

from jobs.scheduler import get_scheduler_manager
from storage import automation_task_mgr
from storage.notification_storage import add_notification
from util.logging_config import get_logger
from util.time_utils import get_utc_now, naive_as_utc

logger = get_logger()

TASK_JOB_PREFIX = "automation_task_"
DEFAULT_FETCH_TIMEOUT = 10
DEFAULT_FETCH_MAX_CHARS = 2000

if TYPE_CHECKING:
    from schemas.automation import AutomationAction, AutomationSchedule


class AutomationTaskService:
    """自动化任务调度与执行服务"""

    def list_tasks(self) -> list[dict[str, Any]]:
        tasks = automation_task_mgr.list_tasks()
        return [self._hydrate_task(task) for task in tasks]

    def get_task(self, task_id: int) -> dict[str, Any] | None:
        task = automation_task_mgr.get_task(task_id)
        if not task:
            return None
        return self._hydrate_task(task)

    def create_task(
        self,
        *,
        name: str,
        description: str | None,
        enabled: bool,
        schedule: AutomationSchedule,
        action: AutomationAction,
    ) -> dict[str, Any] | None:
        schedule_type, schedule_config = self._serialize_schedule(schedule)
        action_type, action_payload = self._serialize_action(action)
        task_id = automation_task_mgr.create_task(
            name=name,
            description=description,
            enabled=enabled,
            schedule_type=schedule_type,
            schedule_config=schedule_config,
            action_type=action_type,
            action_payload=action_payload,
        )
        if task_id is None:
            return None
        task = automation_task_mgr.get_task(task_id)
        if not task:
            return None
        self.sync_task(task)
        return self._hydrate_task(task)

    def update_task(
        self,
        task_id: int,
        *,
        name: str | None,
        description: str | None,
        enabled: bool | None,
        schedule: AutomationSchedule | None,
        action: AutomationAction | None,
    ) -> dict[str, Any] | None:
        updates: dict[str, Any] = {}
        if name is not None:
            updates["name"] = name
        if description is not None:
            updates["description"] = description
        if enabled is not None:
            updates["enabled"] = enabled
        if schedule is not None:
            schedule_type, schedule_config = self._serialize_schedule(schedule)
            updates["schedule_type"] = schedule_type
            updates["schedule_config"] = schedule_config
        if action is not None:
            action_type, action_payload = self._serialize_action(action)
            updates["action_type"] = action_type
            updates["action_payload"] = action_payload

        success = automation_task_mgr.update_task(task_id, **updates)
        if not success:
            return None

        task = automation_task_mgr.get_task(task_id)
        if not task:
            return None
        self.sync_task(task)
        return self._hydrate_task(task)

    def delete_task(self, task_id: int) -> bool:
        removed = automation_task_mgr.delete_task(task_id)
        if removed:
            self._remove_job(task_id)
        return removed

    def run_task(self, task_id: int) -> bool:
        task = automation_task_mgr.get_task(task_id)
        if not task:
            return False
        return self._execute_task(task)

    def sync_all_tasks(self) -> None:
        tasks = automation_task_mgr.list_tasks()
        for task in tasks:
            self.sync_task(task)

    def sync_task(self, task: dict[str, Any]) -> None:
        if not task.get("id"):
            return
        if not task.get("enabled", False):
            self._remove_job(task["id"])
            return

        scheduler = get_scheduler_manager()
        if not scheduler or not scheduler.scheduler:
            logger.warning("调度器未就绪，无法同步自动化任务")
            return

        try:
            trigger = self._build_trigger(task)
        except ValueError as exc:
            logger.error(f"自动化任务调度配置无效: {exc}")
            return

        scheduler.scheduler.add_job(
            execute_automation_task,
            trigger=trigger,
            id=self._job_id(task["id"]),
            name=task.get("name") or self._job_id(task["id"]),
            replace_existing=True,
            kwargs={"task_id": task["id"]},
        )

    def _execute_task(self, task: dict[str, Any]) -> bool:
        if not task.get("enabled", False):
            return False

        now = get_utc_now()
        last_status = "success"
        last_error: str | None = None
        last_output: str | None = None

        try:
            action_type = task.get("action_type") or ""
            payload = self._parse_payload(task.get("action_payload"))
            last_output = self._run_action(action_type, payload)
        except Exception as exc:
            last_status = "error"
            last_error = str(exc)
            logger.error(f"自动化任务执行失败: {exc}", exc_info=True)

        automation_task_mgr.update_task(
            task["id"],
            last_run_at=now,
            last_status=last_status,
            last_error=last_error,
            last_output=last_output,
        )

        self._notify_task_result(task, last_status, last_error, last_output, now)

        if task.get("schedule_type") == "once":
            automation_task_mgr.update_task(task["id"], enabled=False)
            self._remove_job(task["id"])

        return last_status == "success"

    def _notify_task_result(
        self,
        task: dict[str, Any],
        status: str,
        error: str | None,
        output: str | None,
        timestamp: datetime,
    ) -> None:
        content = output or ""
        if status != "success":
            content = error or "执行失败"
        if content:
            content = content[:DEFAULT_FETCH_MAX_CHARS]
        title = f"自动化任务: {task.get('name', task.get('id'))}"
        notification_id = f"automation_{task.get('id')}_{int(timestamp.timestamp())}"
        add_notification(
            notification_id=notification_id,
            title=title,
            content=content or ("执行成功" if status == "success" else "执行失败"),
            timestamp=timestamp,
        )

    def _run_action(self, action_type: str, payload: dict[str, Any]) -> str:
        if action_type == "web_fetch":
            return self._run_web_fetch(payload)
        raise ValueError(f"未知的自动化动作类型: {action_type}")

    def _run_web_fetch(self, payload: dict[str, Any]) -> str:
        url = payload.get("url")
        if not url:
            raise ValueError("web_fetch 需要提供 url")
        parsed_url = urlparse(str(url))
        if parsed_url.scheme not in ("http", "https"):
            raise ValueError("web_fetch 仅支持 http/https 协议")

        method = str(payload.get("method") or "GET").upper()
        timeout = int(payload.get("timeout_seconds") or DEFAULT_FETCH_TIMEOUT)
        max_chars = int(payload.get("max_chars") or DEFAULT_FETCH_MAX_CHARS)
        headers = payload.get("headers")
        if not isinstance(headers, dict):
            headers = {}
        body = payload.get("body")

        data = body.encode("utf-8") if isinstance(body, str) else None
        request = urllib.request.Request(url, data=data, method=method)
        for key, value in headers.items():
            request.add_header(str(key), str(value))

        with urllib.request.urlopen(request, timeout=timeout) as response:  # nosec B310
            raw = response.read()
            text = raw.decode("utf-8", errors="replace")
            preview = text[:max_chars]
            status = response.status
            content_type = response.headers.get("content-type", "")

        return f"[{status}] {content_type}\n{preview}"

    def _serialize_schedule(self, schedule: AutomationSchedule) -> tuple[str, str]:
        schedule_type = schedule.type
        config = schedule.dict(exclude_none=True)
        config.pop("type", None)
        run_at = config.get("run_at")
        if isinstance(run_at, datetime):
            config["run_at"] = run_at.isoformat()
        self._validate_schedule(schedule_type, config)
        return schedule_type, json.dumps(config)

    def _serialize_action(self, action: AutomationAction) -> tuple[str, str]:
        action_type = action.type
        payload = action.payload or {}
        return action_type, json.dumps(payload)

    def _validate_schedule(self, schedule_type: str, config: dict[str, Any]) -> None:
        if schedule_type == "interval":
            if not config.get("interval_seconds"):
                raise ValueError("interval 类型必须提供 interval_seconds")
            return
        if schedule_type == "cron":
            if not config.get("cron"):
                raise ValueError("cron 类型必须提供 cron 表达式")
            return
        if schedule_type == "once":
            if not config.get("run_at"):
                raise ValueError("once 类型必须提供 run_at")
            return
        raise ValueError(f"不支持的 schedule_type: {schedule_type}")

    def _build_trigger(self, task: dict[str, Any]):
        schedule_type = task.get("schedule_type") or ""
        config = self._parse_payload(task.get("schedule_config"))
        timezone = self._get_timezone(config.get("timezone"))

        if schedule_type == "interval":
            seconds = int(config.get("interval_seconds") or 0)
            if seconds <= 0:
                raise ValueError("interval_seconds 必须大于 0")
            return IntervalTrigger(seconds=seconds, timezone=timezone)

        if schedule_type == "cron":
            cron_expr = str(config.get("cron") or "").strip()
            if not cron_expr:
                raise ValueError("cron 表达式不能为空")
            return CronTrigger.from_crontab(cron_expr, timezone=timezone)

        if schedule_type == "once":
            run_at_raw = config.get("run_at")
            run_at = self._parse_datetime(run_at_raw)
            if not run_at:
                raise ValueError("run_at 无效")
            return DateTrigger(run_date=run_at, timezone=timezone)

        raise ValueError(f"不支持的 schedule_type: {schedule_type}")

    def _remove_job(self, task_id: int) -> None:
        scheduler = get_scheduler_manager()
        if not scheduler:
            return
        scheduler.remove_job(self._job_id(task_id))

    @staticmethod
    def _job_id(task_id: int) -> str:
        return f"{TASK_JOB_PREFIX}{task_id}"

    @staticmethod
    def _parse_payload(value: Any) -> dict[str, Any]:
        if value is None:
            return {}
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                return {}
        return {}

    @staticmethod
    def _parse_datetime(value: Any) -> datetime | None:
        if isinstance(value, datetime):
            return naive_as_utc(value)
        if isinstance(value, str):
            try:
                normalized = value.replace("Z", "+00:00")
                parsed = datetime.fromisoformat(normalized)
            except ValueError:
                return None
            return naive_as_utc(parsed)
        return None

    @staticmethod
    def _get_timezone(value: Any):
        if not value:
            return None
        try:
            return ZoneInfo(str(value))
        except Exception:
            return None

    def _hydrate_task(self, task: dict[str, Any]) -> dict[str, Any]:
        schedule_config = self._parse_payload(task.get("schedule_config"))
        schedule = {
            "type": task.get("schedule_type") or "",
            **schedule_config,
        }
        action_payload = self._parse_payload(task.get("action_payload"))
        action = {
            "type": task.get("action_type") or "",
            "payload": action_payload,
        }
        task["schedule"] = schedule
        task["action"] = action
        return task


def execute_automation_task(task_id: int) -> None:
    """调度器入口函数：执行指定自动化任务"""
    service = AutomationTaskService()
    service.run_task(task_id)
