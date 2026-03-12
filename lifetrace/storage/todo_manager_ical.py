"""Todo manager iCalendar mappings and CRUD helpers."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from sqlalchemy.exc import SQLAlchemyError

from lifetrace.storage.models import Todo
from lifetrace.storage.todo_manager_utils import (
    _normalize_percent,
    _normalize_reminder_offsets,
    _safe_int_list,
    _serialize_reminder_offsets,
)
from lifetrace.storage.todo_time_utils import to_utc, to_utc_output
from lifetrace.util.logging_config import get_logger
from lifetrace.util.time_utils import get_utc_now

logger = get_logger()

if TYPE_CHECKING:
    from datetime import datetime

    from lifetrace.storage.database_base import DatabaseBase


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


class TodoIcalMixin:
    """Mixin for iCalendar-aware Todo CRUD and serialization."""

    if TYPE_CHECKING:
        db_base: DatabaseBase

        def _get_todo_tags(self, session, todo_id: int) -> list[str]: ...

        def _get_todo_attachments(self, session, todo_id: int) -> list[dict[str, Any]]: ...

        def _set_todo_tags(self, session, todo_id: int, tags: list[str]) -> None: ...

        def _validate_parent_link(
            self,
            session,
            *,
            todo_id: int,
            parent_todo_id: int | None,
            proposed_parent_map: dict[int, int | None] | None = None,
        ) -> bool: ...

    def _todo_to_dict(self, session, todo: Todo) -> dict[str, Any]:
        todo_id = todo.id
        if todo_id is None:
            raise ValueError("Todo must have an id before serialization.")
        summary = getattr(todo, "summary", None) or todo.name
        dtstart = to_utc_output(getattr(todo, "dtstart", None) or todo.start_time)
        dtend = to_utc_output(getattr(todo, "dtend", None) or todo.end_time)
        due = to_utc_output(getattr(todo, "due", None) or todo.deadline)
        tzid = getattr(todo, "tzid", None) or getattr(todo, "time_zone", None)
        created = to_utc_output(getattr(todo, "created", None) or todo.created_at)
        last_modified = to_utc_output(getattr(todo, "last_modified", None) or todo.updated_at)
        dtstamp = to_utc_output(getattr(todo, "dtstamp", None) or todo.updated_at)
        deadline = to_utc_output(todo.deadline)
        start_time = to_utc_output(todo.start_time)
        end_time = to_utc_output(todo.end_time)
        recurrence_id = to_utc_output(getattr(todo, "recurrence_id", None))
        completed_at = to_utc_output(getattr(todo, "completed_at", None))
        created_at = to_utc_output(todo.created_at)
        updated_at = to_utc_output(todo.updated_at)
        ical_status = getattr(todo, "ical_status", None) or _to_ical_status(todo.status)
        is_all_day = getattr(todo, "is_all_day", None)
        if is_all_day is None:
            is_all_day = False
        return {
            "id": todo_id,
            "uid": getattr(todo, "uid", None),
            "name": todo.name,
            "summary": summary,
            "description": todo.description,
            "user_notes": todo.user_notes,
            "parent_todo_id": todo.parent_todo_id,
            "item_type": getattr(todo, "item_type", None),
            "location": getattr(todo, "location", None),
            "categories": getattr(todo, "categories", None),
            "classification": getattr(todo, "classification", None),
            "deadline": deadline,
            "start_time": start_time,
            "end_time": end_time,
            "dtstart": dtstart,
            "dtend": dtend,
            "due": due,
            "duration": getattr(todo, "duration", None),
            "time_zone": getattr(todo, "time_zone", None),
            "tzid": tzid,
            "is_all_day": bool(is_all_day),
            "dtstamp": dtstamp,
            "created": created,
            "last_modified": last_modified,
            "sequence": getattr(todo, "sequence", 0),
            "rdate": getattr(todo, "rdate", None),
            "exdate": getattr(todo, "exdate", None),
            "recurrence_id": recurrence_id,
            "related_to_uid": getattr(todo, "related_to_uid", None),
            "related_to_reltype": getattr(todo, "related_to_reltype", None),
            "ical_status": ical_status,
            "reminder_offsets": _normalize_reminder_offsets(
                getattr(todo, "reminder_offsets", None)
            ),
            "status": todo.status,
            "priority": todo.priority,
            "completed_at": completed_at,
            "percent_complete": (
                todo.percent_complete if getattr(todo, "percent_complete", None) is not None else 0
            ),
            "rrule": getattr(todo, "rrule", None),
            "order": getattr(todo, "order", 0),
            "tags": self._get_todo_tags(session, todo_id),
            "attachments": self._get_todo_attachments(session, todo_id),
            "related_activities": _safe_int_list(todo.related_activities),
            "source_type": getattr(todo, "source_type", None),
            "source_key": getattr(todo, "source_key", None),
            "source_date": getattr(todo, "source_date", None),
            "created_at": created_at,
            "updated_at": updated_at,
        }

    def create_todo(  # noqa: PLR0913, C901, PLR0912, PLR0915
        self,
        *,
        name: str,
        summary: str | None = None,
        description: str | None = None,
        user_notes: str | None = None,
        parent_todo_id: int | None = None,
        item_type: str | None = None,
        location: str | None = None,
        categories: str | None = None,
        classification: str | None = None,
        deadline: datetime | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        dtstart: datetime | None = None,
        dtend: datetime | None = None,
        due: datetime | None = None,
        duration: str | None = None,
        time_zone: str | None = None,
        tzid: str | None = None,
        is_all_day: bool | None = None,
        dtstamp: datetime | None = None,
        created: datetime | None = None,
        last_modified: datetime | None = None,
        sequence: int | None = None,
        rdate: str | None = None,
        exdate: str | None = None,
        recurrence_id: datetime | None = None,
        related_to_uid: str | None = None,
        related_to_reltype: str | None = None,
        ical_status: str | None = None,
        reminder_offsets: list[int] | None = None,
        status: str = "active",
        priority: str = "none",
        completed_at: datetime | None = None,
        percent_complete: int | None = None,
        rrule: str | None = None,
        uid: str | None = None,
        order: int = 0,
        tags: list[str] | None = None,
        related_activities: list[int] | None = None,
    ) -> int | None:
        try:
            resolved_percent = (
                _normalize_percent(percent_complete) if percent_complete is not None else None
            )
            if resolved_percent is None:
                resolved_percent = 100 if status == "completed" else 0

            resolved_completed_at = completed_at
            if resolved_completed_at is None and status == "completed":
                resolved_completed_at = get_utc_now()

            cleaned_rrule = (rrule or "").strip() or None
            cleaned_uid = (uid or "").strip() or None

            with self.db_base.get_session() as session:
                if dtstart is None:
                    dtstart = start_time or deadline or due
                if due is None:
                    due = deadline
                if dtend is None:
                    dtend = end_time
                if start_time is None and dtstart is not None:
                    start_time = dtstart
                if end_time is None and dtend is not None:
                    end_time = dtend
                if deadline is None and due is not None:
                    deadline = due

                resolved_summary = summary or name
                resolved_item_type = (item_type or "VTODO").upper()
                resolved_tzid = tzid or time_zone
                now = get_utc_now()
                if created is None:
                    created = now
                if last_modified is None:
                    last_modified = now
                if dtstamp is None:
                    dtstamp = now

                deadline = to_utc(deadline)
                start_time = to_utc(start_time)
                end_time = to_utc(end_time)
                dtstart = to_utc(dtstart)
                dtend = to_utc(dtend)
                due = to_utc(due)
                dtstamp = to_utc(dtstamp)
                created = to_utc(created)
                last_modified = to_utc(last_modified)
                recurrence_id = to_utc(recurrence_id)
                resolved_completed_at = to_utc(resolved_completed_at)

                todo_kwargs: dict[str, Any] = {
                    "name": name,
                    "summary": resolved_summary,
                    "description": description,
                    "user_notes": user_notes,
                    "parent_todo_id": parent_todo_id,
                    "item_type": resolved_item_type,
                    "location": location,
                    "categories": categories,
                    "classification": classification,
                    "deadline": deadline,
                    "start_time": start_time,
                    "end_time": end_time,
                    "dtstart": dtstart,
                    "dtend": dtend,
                    "due": due,
                    "duration": duration,
                    "time_zone": time_zone,
                    "tzid": resolved_tzid,
                    "is_all_day": bool(is_all_day) if is_all_day is not None else False,
                    "dtstamp": dtstamp,
                    "created": created,
                    "last_modified": last_modified,
                    "sequence": sequence if sequence is not None else 0,
                    "rdate": rdate,
                    "exdate": exdate,
                    "recurrence_id": recurrence_id,
                    "related_to_uid": related_to_uid,
                    "related_to_reltype": related_to_reltype,
                    "ical_status": ical_status,
                    "reminder_offsets": _serialize_reminder_offsets(reminder_offsets),
                    "status": status,
                    "priority": priority,
                    "completed_at": resolved_completed_at,
                    "percent_complete": resolved_percent,
                    "rrule": cleaned_rrule,
                    "order": order,
                    "related_activities": json.dumps(_safe_int_list(related_activities)),
                }
                if cleaned_uid:
                    todo_kwargs["uid"] = cleaned_uid

                todo = Todo(**todo_kwargs)
                session.add(todo)
                session.flush()

                if tags is not None:
                    if todo.id is None:
                        raise ValueError("Todo must have an id before tagging.")
                    self._set_todo_tags(session, todo.id, tags)

                logger.info(f"创建 todo: {todo.id} - {name}")
                return todo.id
        except SQLAlchemyError as e:
            logger.error(f"创建 todo 失败: {e}")
            return None
