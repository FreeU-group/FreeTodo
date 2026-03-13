"""Todo manager iCalendar mappings and CRUD helpers."""

from __future__ import annotations

import json
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy.exc import SQLAlchemyError

from storage.models import Todo
from storage.todo_manager_utils import (
    _normalize_percent,
    _normalize_reminder_offsets,
    _safe_int_list,
    _serialize_reminder_offsets,
)
from util.logging_config import get_logger
from util.time_utils import db_datetime_as_utc, get_utc_now, utc_to_storage

logger = get_logger()

_UNSET = object()

if TYPE_CHECKING:
    from storage.database_base import DatabaseBase


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


_TODO_DATETIME_FIELDS = (
    "deadline",
    "start_time",
    "end_time",
    "dtstart",
    "dtend",
    "due",
    "dtstamp",
    "created",
    "last_modified",
    "recurrence_id",
    "completed_at",
)


def _normalize_todo_datetime(value: datetime | None) -> datetime | None:
    return utc_to_storage(value)


def _normalize_todo_datetimes(values: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(values)
    for field in _TODO_DATETIME_FIELDS:
        if field in normalized and isinstance(normalized[field], datetime | type(None)):
            normalized[field] = _normalize_todo_datetime(normalized[field])
    return normalized


def _restore_todo_datetime(value: datetime | None) -> datetime | None:
    return db_datetime_as_utc(value)


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
        dtstart = getattr(todo, "dtstart", None) or todo.start_time
        dtend = getattr(todo, "dtend", None) or todo.end_time
        due = getattr(todo, "due", None) or todo.deadline
        tzid = getattr(todo, "tzid", None) or getattr(todo, "time_zone", None)
        created = getattr(todo, "created", None) or todo.created_at
        last_modified = getattr(todo, "last_modified", None) or todo.updated_at
        dtstamp = getattr(todo, "dtstamp", None) or todo.updated_at
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
            "deadline": _restore_todo_datetime(todo.deadline),
            "start_time": _restore_todo_datetime(todo.start_time),
            "end_time": _restore_todo_datetime(todo.end_time),
            "dtstart": _restore_todo_datetime(dtstart),
            "dtend": _restore_todo_datetime(dtend),
            "due": _restore_todo_datetime(due),
            "duration": getattr(todo, "duration", None),
            "time_zone": getattr(todo, "time_zone", None),
            "tzid": tzid,
            "is_all_day": bool(is_all_day),
            "dtstamp": _restore_todo_datetime(dtstamp),
            "created": _restore_todo_datetime(created),
            "last_modified": _restore_todo_datetime(last_modified),
            "sequence": getattr(todo, "sequence", 0),
            "rdate": getattr(todo, "rdate", None),
            "exdate": getattr(todo, "exdate", None),
            "recurrence_id": _restore_todo_datetime(getattr(todo, "recurrence_id", None)),
            "related_to_uid": getattr(todo, "related_to_uid", None),
            "related_to_reltype": getattr(todo, "related_to_reltype", None),
            "ical_status": ical_status,
            "reminder_offsets": _normalize_reminder_offsets(
                getattr(todo, "reminder_offsets", None)
            ),
            "status": todo.status,
            "priority": todo.priority,
            "completed_at": _restore_todo_datetime(getattr(todo, "completed_at", None)),
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
            "created_at": _restore_todo_datetime(todo.created_at),
            "updated_at": _restore_todo_datetime(todo.updated_at),
        }

    def create_todo(  # noqa: PLR0913, C901, PLR0912
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

                todo = Todo(**_normalize_todo_datetimes(todo_kwargs))
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

    def _apply_todo_updates(  # noqa: PLR0913
        self,
        todo: Todo,
        *,
        name: str | Any = _UNSET,
        summary: str | Any = _UNSET,
        description: str | Any = _UNSET,
        user_notes: str | Any = _UNSET,
        parent_todo_id: int | None | Any = _UNSET,
        item_type: str | None | Any = _UNSET,
        location: str | None | Any = _UNSET,
        categories: str | None | Any = _UNSET,
        classification: str | None | Any = _UNSET,
        deadline: datetime | None | Any = _UNSET,
        start_time: datetime | None | Any = _UNSET,
        end_time: datetime | None | Any = _UNSET,
        dtstart: datetime | None | Any = _UNSET,
        dtend: datetime | None | Any = _UNSET,
        due: datetime | None | Any = _UNSET,
        duration: str | None | Any = _UNSET,
        time_zone: str | None | Any = _UNSET,
        tzid: str | None | Any = _UNSET,
        is_all_day: bool | None | Any = _UNSET,
        dtstamp: datetime | None | Any = _UNSET,
        created: datetime | None | Any = _UNSET,
        last_modified: datetime | None | Any = _UNSET,
        sequence: int | Any = _UNSET,
        rdate: str | None | Any = _UNSET,
        exdate: str | None | Any = _UNSET,
        recurrence_id: datetime | None | Any = _UNSET,
        related_to_uid: str | None | Any = _UNSET,
        related_to_reltype: str | None | Any = _UNSET,
        ical_status: str | None | Any = _UNSET,
        reminder_offsets: list[int] | None | Any = _UNSET,
        status: str | Any = _UNSET,
        priority: str | Any = _UNSET,
        completed_at: datetime | None | Any = _UNSET,
        percent_complete: int | Any = _UNSET,
        rrule: str | None | Any = _UNSET,
        order: int | Any = _UNSET,
        related_activities: list[int] | Any = _UNSET,
    ) -> None:
        """应用待办字段更新."""
        if percent_complete is not _UNSET:
            percent_complete = _normalize_percent(percent_complete)
        if rrule is not _UNSET:
            rrule = (rrule or "").strip() or None

        updates = {
            "name": name,
            "summary": summary,
            "description": description,
            "user_notes": user_notes,
            "parent_todo_id": parent_todo_id,
            "item_type": item_type,
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
            "tzid": tzid,
            "is_all_day": is_all_day,
            "dtstamp": dtstamp,
            "created": created,
            "last_modified": last_modified,
            "sequence": sequence,
            "rdate": rdate,
            "exdate": exdate,
            "recurrence_id": recurrence_id,
            "related_to_uid": related_to_uid,
            "related_to_reltype": related_to_reltype,
            "ical_status": ical_status,
            "status": status,
            "priority": priority,
            "completed_at": completed_at,
            "percent_complete": percent_complete,
            "rrule": rrule,
            "order": order,
        }

        for attr, value in _normalize_todo_datetimes(updates).items():
            if value is not _UNSET:
                setattr(todo, attr, value)

        if reminder_offsets is not _UNSET:
            todo.reminder_offsets = _serialize_reminder_offsets(reminder_offsets)

        if related_activities is not _UNSET:
            todo.related_activities = json.dumps(_safe_int_list(related_activities))

    def update_todo(  # noqa: PLR0913, C901, PLR0912, PLR0915
        self,
        todo_id: int,
        *,
        name: str | Any = _UNSET,
        summary: str | Any = _UNSET,
        description: str | Any = _UNSET,
        user_notes: str | Any = _UNSET,
        parent_todo_id: int | None | Any = _UNSET,
        item_type: str | None | Any = _UNSET,
        location: str | None | Any = _UNSET,
        categories: str | None | Any = _UNSET,
        classification: str | None | Any = _UNSET,
        deadline: datetime | None | Any = _UNSET,
        start_time: datetime | None | Any = _UNSET,
        end_time: datetime | None | Any = _UNSET,
        dtstart: datetime | None | Any = _UNSET,
        dtend: datetime | None | Any = _UNSET,
        due: datetime | None | Any = _UNSET,
        duration: str | None | Any = _UNSET,
        time_zone: str | None | Any = _UNSET,
        tzid: str | None | Any = _UNSET,
        is_all_day: bool | None | Any = _UNSET,
        dtstamp: datetime | None | Any = _UNSET,
        created: datetime | None | Any = _UNSET,
        last_modified: datetime | None | Any = _UNSET,
        sequence: int | Any = _UNSET,
        rdate: str | None | Any = _UNSET,
        exdate: str | None | Any = _UNSET,
        recurrence_id: datetime | None | Any = _UNSET,
        related_to_uid: str | None | Any = _UNSET,
        related_to_reltype: str | None | Any = _UNSET,
        ical_status: str | None | Any = _UNSET,
        reminder_offsets: list[int] | None | Any = _UNSET,
        status: str | Any = _UNSET,
        priority: str | Any = _UNSET,
        completed_at: datetime | None | Any = _UNSET,
        percent_complete: int | Any = _UNSET,
        rrule: str | None | Any = _UNSET,
        order: int | Any = _UNSET,
        tags: list[str] | Any = _UNSET,
        related_activities: list[int] | Any = _UNSET,
    ) -> bool:
        try:
            with self.db_base.get_session() as session:
                todo = session.query(Todo).filter_by(id=todo_id).first()
                if not todo:
                    logger.warning(f"todo 不存在: {todo_id}")
                    return False
                if parent_todo_id is not _UNSET and not self._validate_parent_link(
                    session,
                    todo_id=todo_id,
                    parent_todo_id=parent_todo_id,
                ):
                    logger.warning(
                        "更新 todo 失败: parent_todo_id 无效 todo_id=%s parent_id=%s",
                        todo_id,
                        parent_todo_id,
                    )
                    return False

                resolved_completed_at = completed_at
                resolved_percent = percent_complete

                if status is not _UNSET:
                    if status == "completed":
                        if completed_at is _UNSET:
                            resolved_completed_at = get_utc_now()
                        if percent_complete is _UNSET:
                            resolved_percent = 100
                    else:
                        if completed_at is _UNSET:
                            resolved_completed_at = None
                        if percent_complete is _UNSET:
                            resolved_percent = 0

                if item_type is not _UNSET and item_type is not None:
                    item_type = item_type.upper()

                if summary is _UNSET and name is not _UNSET:
                    summary = name
                if name is _UNSET and summary is not _UNSET:
                    name = summary

                if tzid is _UNSET and time_zone is not _UNSET:
                    tzid = time_zone
                if time_zone is _UNSET and tzid is not _UNSET:
                    time_zone = tzid

                if start_time is _UNSET and dtstart is not _UNSET:
                    start_time = dtstart
                if end_time is _UNSET and dtend is not _UNSET:
                    end_time = dtend
                if deadline is _UNSET and due is not _UNSET:
                    deadline = due

                if dtstart is _UNSET and start_time is not _UNSET:
                    dtstart = start_time
                if dtend is _UNSET and end_time is not _UNSET:
                    dtend = end_time
                if due is _UNSET and deadline is not _UNSET:
                    due = deadline
                if deadline is not _UNSET and start_time is _UNSET:
                    start_time = deadline
                    deadline = None

                if last_modified is _UNSET:
                    last_modified = get_utc_now()
                if dtstamp is _UNSET:
                    dtstamp = last_modified

                self._apply_todo_updates(
                    todo,
                    name=name,
                    summary=summary,
                    description=description,
                    user_notes=user_notes,
                    parent_todo_id=parent_todo_id,
                    item_type=item_type,
                    location=location,
                    categories=categories,
                    classification=classification,
                    deadline=deadline,
                    start_time=start_time,
                    end_time=end_time,
                    dtstart=dtstart,
                    dtend=dtend,
                    due=due,
                    duration=duration,
                    time_zone=time_zone,
                    tzid=tzid,
                    is_all_day=is_all_day,
                    dtstamp=dtstamp,
                    created=created,
                    last_modified=last_modified,
                    sequence=sequence,
                    rdate=rdate,
                    exdate=exdate,
                    recurrence_id=recurrence_id,
                    related_to_uid=related_to_uid,
                    related_to_reltype=related_to_reltype,
                    ical_status=ical_status,
                    reminder_offsets=reminder_offsets,
                    status=status,
                    priority=priority,
                    completed_at=resolved_completed_at,
                    percent_complete=resolved_percent,
                    rrule=rrule,
                    order=order,
                    related_activities=related_activities,
                )

                todo.updated_at = get_utc_now()
                session.flush()

                if tags is not _UNSET:
                    self._set_todo_tags(session, todo_id, tags or [])

                logger.info(f"更新 todo: {todo_id}")
                return True
        except SQLAlchemyError as e:
            logger.error(f"更新 todo 失败: {e}")
            return False
