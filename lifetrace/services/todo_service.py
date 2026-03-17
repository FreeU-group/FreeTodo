"""Todo 业务逻辑层

处理 Todo 相关的业务逻辑，与数据访问层解耦。
"""

import html
from typing import Any

from fastapi import HTTPException

from lifetrace.jobs.deadline_reminder import refresh_todo_reminders, remove_todo_reminder_jobs
from lifetrace.repositories.interfaces import ITodoRepository
from lifetrace.schemas.todo import TodoAttachmentResponse, TodoCreate, TodoResponse, TodoUpdate
from lifetrace.storage.notification_storage import (
    clear_dismissed_mark,
    clear_notification_by_todo_id,
)
from lifetrace.util.logging_config import get_logger
from lifetrace.util.time_utils import get_utc_now

logger = get_logger()


def _to_ical_status(status: str | None) -> str | None:
    if not status:
        return None
    mapping = {
        "active": "NEEDS-ACTION",
        "completed": "COMPLETED",
        "canceled": "CANCELLED",
        "draft": "NEEDS-ACTION",
    }
    return mapping.get(status, "NEEDS-ACTION")


def _normalize_item_type(item_type: str | None) -> str:
    return (item_type or "VTODO").upper()


class TodoService:
    """Todo 业务逻辑层"""

    def __init__(self, repository: ITodoRepository):
        self.repository = repository

    def get_todo(self, todo_id: int) -> TodoResponse:
        """获取单个 Todo"""
        todo = self.repository.get_by_id(todo_id)
        if not todo:
            raise HTTPException(status_code=404, detail="todo 不存在")
        return TodoResponse(**todo)

    def get_todo_by_uid(self, uid: str) -> TodoResponse | None:
        """根据 UID 获取单个 Todo"""
        todo = self.repository.get_by_uid(uid)
        return TodoResponse(**todo) if todo else None

    def list_todos(self, limit: int, offset: int, status: str | None) -> dict[str, Any]:
        """获取 Todo 列表"""
        todos = self.repository.list_todos(limit, offset, status)
        total = self.repository.count(status)
        return {"total": total, "todos": [TodoResponse(**t) for t in todos]}

    def create_todo(self, data: TodoCreate) -> TodoResponse:
        """创建 Todo"""
        # Sanitize user input to prevent XSS
        data.name = html.escape(data.name)
        if data.description is not None:
            data.description = html.escape(data.description)

        # Validate time range
        st = data.start_time or data.dtstart
        et = data.end_time or data.dtend
        if st and et and st >= et:
            raise HTTPException(status_code=422, detail="start_time must be before end_time")

        dtstart = data.dtstart or data.start_time or data.deadline or data.due
        dtend = data.dtend or data.end_time
        due = data.due or data.deadline
        duration = data.duration
        if duration and (due or dtend):
            raise HTTPException(
                status_code=400,
                detail="duration 与 due/dtend 互斥，请只保留一个",
            )

        start_time = data.start_time or dtstart
        end_time = data.end_time or dtend
        deadline = data.deadline or due

        item_type = _normalize_item_type(data.item_type)
        summary = data.summary or data.name
        tzid = data.tzid or data.time_zone
        now = get_utc_now()
        created = data.created or now
        last_modified = data.last_modified or now
        dtstamp = data.dtstamp or now
        ical_status = data.ical_status or _to_ical_status(
            data.status.value if data.status else None
        )
        todo_id = self.repository.create(
            uid=data.uid,
            name=data.name,
            summary=summary,
            description=data.description,
            user_notes=data.user_notes,
            parent_todo_id=data.parent_todo_id,
            item_type=item_type,
            location=data.location,
            categories=data.categories,
            classification=data.classification,
            deadline=deadline,
            start_time=start_time,
            end_time=end_time,
            dtstart=dtstart,
            dtend=dtend,
            due=due,
            duration=duration,
            time_zone=data.time_zone,
            tzid=tzid,
            is_all_day=data.is_all_day,
            dtstamp=dtstamp,
            created=created,
            last_modified=last_modified,
            sequence=data.sequence,
            rdate=data.rdate,
            exdate=data.exdate,
            recurrence_id=data.recurrence_id,
            related_to_uid=data.related_to_uid,
            related_to_reltype=data.related_to_reltype,
            ical_status=ical_status,
            reminder_offsets=data.reminder_offsets,
            status=data.status.value if data.status else "active",
            priority=data.priority.value if data.priority else "none",
            completed_at=data.completed_at,
            percent_complete=data.percent_complete,
            rrule=data.rrule,
            order=data.order,
            tags=data.tags,
            related_activities=data.related_activities,
        )
        if not todo_id:
            raise HTTPException(status_code=500, detail="创建 todo 失败")

        todo = self.get_todo(todo_id)
        try:
            refresh_todo_reminders(todo)
        except Exception as e:
            logger.warning(f"创建待办后同步提醒失败: {e}")
        return todo

    def update_todo(self, todo_id: int, data: TodoUpdate) -> TodoResponse:  # noqa: C901, PLR0912, PLR0915
        """更新 Todo"""
        # Sanitize user input to prevent XSS
        if data.name is not None:
            data.name = html.escape(data.name)
        if data.description is not None:
            data.description = html.escape(data.description)

        # Validate time range
        st = getattr(data, "start_time", None) or getattr(data, "dtstart", None)
        et = getattr(data, "end_time", None) or getattr(data, "dtend", None)
        if st and et and st >= et:
            raise HTTPException(status_code=422, detail="start_time must be before end_time")

        # 检查是否存在
        if not self.repository.get_by_id(todo_id):
            raise HTTPException(status_code=404, detail="todo 不存在")

        # 提取有效字段（只更新请求中携带的字段）
        fields_set = (
            getattr(data, "model_fields_set", None)
            or getattr(data, "__fields_set__", None)
            or set()
        )
        kwargs = {field: getattr(data, field) for field in fields_set}
        existing = self.repository.get_by_id(todo_id)
        item_type = _normalize_item_type(
            kwargs.get("item_type") or (existing.get("item_type") if existing else None)
        )

        # 枚举转字符串
        if "status" in kwargs and kwargs["status"] is not None:
            kwargs["status"] = kwargs["status"].value
        if "priority" in kwargs and kwargs["priority"] is not None:
            kwargs["priority"] = kwargs["priority"].value
        if "item_type" in kwargs and kwargs["item_type"] is not None:
            kwargs["item_type"] = _normalize_item_type(kwargs["item_type"])

        if "summary" not in kwargs and "name" in kwargs:
            kwargs["summary"] = kwargs["name"]
        if "name" not in kwargs and "summary" in kwargs:
            kwargs["name"] = kwargs["summary"]
        if (
            "summary" in kwargs
            and "name" in kwargs
            and kwargs["summary"]
            and kwargs["name"]
            and kwargs["summary"] != kwargs["name"]
        ):
            kwargs["name"] = kwargs["summary"]

        if "tzid" not in kwargs and "time_zone" in kwargs:
            kwargs["tzid"] = kwargs["time_zone"]
        if "time_zone" not in kwargs and "tzid" in kwargs:
            kwargs["time_zone"] = kwargs["tzid"]

        if "dtstart" not in kwargs:
            if "start_time" in kwargs:
                kwargs["dtstart"] = kwargs["start_time"]
            elif "deadline" in kwargs:
                kwargs["dtstart"] = kwargs["deadline"]
            elif "due" in kwargs:
                kwargs["dtstart"] = kwargs["due"]
        if "start_time" not in kwargs and "dtstart" in kwargs:
            kwargs["start_time"] = kwargs["dtstart"]

        if "dtend" not in kwargs and "end_time" in kwargs:
            kwargs["dtend"] = kwargs["end_time"]
        if "end_time" not in kwargs and "dtend" in kwargs:
            kwargs["end_time"] = kwargs["dtend"]

        if "due" not in kwargs and "deadline" in kwargs:
            kwargs["due"] = kwargs["deadline"]
        if "deadline" not in kwargs and "due" in kwargs:
            kwargs["deadline"] = kwargs["due"]

        if "deadline" in kwargs and "start_time" not in kwargs:
            kwargs["start_time"] = kwargs["deadline"]

        if "duration" in kwargs and kwargs["duration"] is not None:
            if ("due" in kwargs and kwargs["due"] is not None) or (
                "dtend" in kwargs and kwargs["dtend"] is not None
            ):
                raise HTTPException(
                    status_code=400,
                    detail="duration 与 due/dtend 互斥，请只保留一个",
                )
            if item_type == "VTODO":
                kwargs.setdefault("due", None)
                kwargs.setdefault("deadline", None)
            else:
                kwargs.setdefault("dtend", None)
                kwargs.setdefault("end_time", None)

        if "ical_status" not in kwargs and "status" in kwargs:
            kwargs["ical_status"] = _to_ical_status(kwargs["status"])
        if "last_modified" not in kwargs:
            kwargs["last_modified"] = get_utc_now()
        if "dtstamp" not in kwargs:
            kwargs["dtstamp"] = kwargs["last_modified"]

        if not self.repository.update(todo_id, **kwargs):
            raise HTTPException(status_code=500, detail="更新 todo 失败")

        schedule_fields = {
            "start_time",
            "dtstart",
            "due",
            "deadline",
            "reminder_offsets",
            "status",
            "item_type",
        }
        if schedule_fields.intersection(fields_set):
            clear_notification_by_todo_id(todo_id)
            clear_dismissed_mark(todo_id)

        todo = self.get_todo(todo_id)
        if schedule_fields.intersection(fields_set):
            try:
                refresh_todo_reminders(todo)
            except Exception as e:
                logger.warning(f"更新待办后同步提醒失败: {e}")
        return todo

    def delete_todo(self, todo_id: int) -> None:
        """删除 Todo"""
        if not self.repository.get_by_id(todo_id):
            raise HTTPException(status_code=404, detail="todo 不存在")
        if not self.repository.delete(todo_id):
            raise HTTPException(status_code=500, detail="删除 todo 失败")
        remove_todo_reminder_jobs(todo_id)
        clear_notification_by_todo_id(todo_id)
        clear_dismissed_mark(todo_id)

    def reorder_todos(self, items: list[dict[str, Any]]) -> dict[str, Any]:
        """批量重排序 Todo"""
        if not self.repository.reorder(items):
            raise HTTPException(status_code=500, detail="批量重排序失败")
        return {"success": True, "message": f"成功更新 {len(items)} 个待办的排序"}

    def add_attachment(
        self,
        *,
        todo_id: int,
        file_name: str,
        file_path: str,
        file_size: int | None,
        mime_type: str | None,
        file_hash: str | None,
        source: str = "user",
    ) -> TodoAttachmentResponse:
        if not self.repository.get_by_id(todo_id):
            raise HTTPException(status_code=404, detail="todo 不存在")

        attachment = self.repository.add_attachment(
            todo_id=todo_id,
            file_name=file_name,
            file_path=file_path,
            file_size=file_size,
            mime_type=mime_type,
            file_hash=file_hash,
            source=source,
        )
        if not attachment:
            raise HTTPException(status_code=500, detail="创建附件失败")

        return TodoAttachmentResponse(**attachment)

    def remove_attachment(self, *, todo_id: int, attachment_id: int) -> None:
        if not self.repository.get_by_id(todo_id):
            raise HTTPException(status_code=404, detail="todo 不存在")
        if not self.repository.remove_attachment(todo_id=todo_id, attachment_id=attachment_id):
            raise HTTPException(status_code=404, detail="附件不存在或已解绑")

    def get_attachment(self, attachment_id: int) -> dict[str, Any]:
        attachment = self.repository.get_attachment(attachment_id)
        if not attachment:
            raise HTTPException(status_code=404, detail="附件不存在")
        return attachment
