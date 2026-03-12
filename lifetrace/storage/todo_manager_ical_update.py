"""Todo manager iCalendar update helpers."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from sqlalchemy.exc import SQLAlchemyError

from lifetrace.storage.models import Todo
from lifetrace.storage.todo_manager_utils import (
    _normalize_percent,
    _safe_int_list,
    _serialize_reminder_offsets,
)
from lifetrace.storage.todo_time_utils import normalize_update_datetime
from lifetrace.util.logging_config import get_logger
from lifetrace.util.time_utils import get_utc_now

logger = get_logger()

_UNSET = object()

if TYPE_CHECKING:
    from datetime import datetime

    from lifetrace.storage.database_base import DatabaseBase


class TodoIcalUpdateMixin:
    """Mixin for iCalendar-aware Todo updates."""

    if TYPE_CHECKING:
        db_base: DatabaseBase

        def _set_todo_tags(self, session, todo_id: int, tags: list[str]) -> None: ...

        def _validate_parent_link(
            self,
            session,
            *,
            todo_id: int,
            parent_todo_id: int | None,
            proposed_parent_map: dict[int, int | None] | None = None,
        ) -> bool: ...

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

        for attr, value in updates.items():
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
                if last_modified is _UNSET:
                    last_modified = get_utc_now()
                if dtstamp is _UNSET:
                    dtstamp = last_modified

                deadline = normalize_update_datetime(deadline, _UNSET)
                start_time = normalize_update_datetime(start_time, _UNSET)
                end_time = normalize_update_datetime(end_time, _UNSET)
                dtstart = normalize_update_datetime(dtstart, _UNSET)
                dtend = normalize_update_datetime(dtend, _UNSET)
                due = normalize_update_datetime(due, _UNSET)
                dtstamp = normalize_update_datetime(dtstamp, _UNSET)
                created = normalize_update_datetime(created, _UNSET)
                last_modified = normalize_update_datetime(last_modified, _UNSET)
                recurrence_id = normalize_update_datetime(recurrence_id, _UNSET)
                resolved_completed_at = normalize_update_datetime(
                    resolved_completed_at,
                    _UNSET,
                )

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
