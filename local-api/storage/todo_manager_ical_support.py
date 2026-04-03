"""Shared helpers for iCalendar-aware todo CRUD."""

from __future__ import annotations

import json
from datetime import datetime
from typing import TYPE_CHECKING, Any

from storage.todo_manager_utils import (
    _normalize_percent,
    _normalize_reminder_offsets,
    _safe_int_list,
    _serialize_reminder_offsets,
)
from util.time_utils import db_datetime_as_utc, get_utc_now, utc_to_storage

if TYPE_CHECKING:
    from storage.models import Todo

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


def to_ical_status(status: str | None) -> str | None:
    if not status:
        return None
    mapping = {
        "active": "NEEDS-ACTION",
        "completed": "COMPLETED",
        "canceled": "CANCELLED",
        "draft": "NEEDS-ACTION",
    }
    return mapping.get(status, "NEEDS-ACTION")


def normalize_todo_datetimes(values: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(values)
    for field in _TODO_DATETIME_FIELDS:
        if field in normalized and isinstance(normalized[field], datetime | type(None)):
            normalized[field] = utc_to_storage(normalized[field])
    return normalized


def restore_todo_datetime(value: datetime | None) -> datetime | None:
    return db_datetime_as_utc(value)


def todo_to_dict(mixin, session, todo: Todo) -> dict[str, Any]:
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
    ical_status = getattr(todo, "ical_status", None) or to_ical_status(todo.status)
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
        "who_founder": getattr(todo, "who_founder", None),
        "who_executor": getattr(todo, "who_executor", None),
        "parent_todo_id": todo.parent_todo_id,
        "item_type": getattr(todo, "item_type", None),
        "location": getattr(todo, "location", None),
        "categories": getattr(todo, "categories", None),
        "classification": getattr(todo, "classification", None),
        "deadline": restore_todo_datetime(todo.deadline),
        "start_time": restore_todo_datetime(todo.start_time),
        "end_time": restore_todo_datetime(todo.end_time),
        "dtstart": restore_todo_datetime(dtstart),
        "dtend": restore_todo_datetime(dtend),
        "due": restore_todo_datetime(due),
        "duration": getattr(todo, "duration", None),
        "time_zone": getattr(todo, "time_zone", None),
        "tzid": tzid,
        "is_all_day": bool(is_all_day),
        "dtstamp": restore_todo_datetime(dtstamp),
        "created": restore_todo_datetime(created),
        "last_modified": restore_todo_datetime(last_modified),
        "sequence": getattr(todo, "sequence", 0),
        "rdate": getattr(todo, "rdate", None),
        "exdate": getattr(todo, "exdate", None),
        "recurrence_id": restore_todo_datetime(getattr(todo, "recurrence_id", None)),
        "related_to_uid": getattr(todo, "related_to_uid", None),
        "related_to_reltype": getattr(todo, "related_to_reltype", None),
        "ical_status": ical_status,
        "reminder_offsets": _normalize_reminder_offsets(getattr(todo, "reminder_offsets", None)),
        "status": todo.status,
        "priority": todo.priority,
        "completed_at": restore_todo_datetime(getattr(todo, "completed_at", None)),
        "percent_complete": todo.percent_complete
        if getattr(todo, "percent_complete", None) is not None
        else 0,
        "rrule": getattr(todo, "rrule", None),
        "order": getattr(todo, "order", 0),
        "tags": mixin._get_todo_tags(session, todo_id),
        "attachments": mixin._get_todo_attachments(session, todo_id),
        "related_activities": _safe_int_list(todo.related_activities),
        "source_type": getattr(todo, "source_type", None),
        "source_key": getattr(todo, "source_key", None),
        "source_date": getattr(todo, "source_date", None),
        "created_at": restore_todo_datetime(todo.created_at),
        "updated_at": restore_todo_datetime(todo.updated_at),
    }


def prepare_create_todo_kwargs(**kwargs: Any) -> dict[str, Any]:
    status = kwargs["status"]
    percent_complete = kwargs["percent_complete"]
    completed_at = kwargs["completed_at"]
    reminder_offsets = kwargs["reminder_offsets"]
    related_activities = kwargs["related_activities"]
    rrule = kwargs["rrule"]
    uid = kwargs["uid"]

    resolved_percent = (
        _normalize_percent(percent_complete) if percent_complete is not None else None
    )
    if resolved_percent is None:
        resolved_percent = 100 if status == "completed" else 0
    resolved_completed_at = completed_at
    if resolved_completed_at is None and status == "completed":
        resolved_completed_at = get_utc_now()

    dtstart = kwargs["dtstart"] or kwargs["start_time"] or kwargs["deadline"] or kwargs["due"]
    due = kwargs["due"] or kwargs["deadline"]
    dtend = kwargs["dtend"] or kwargs["end_time"]
    start_time = kwargs["start_time"] or dtstart
    end_time = kwargs["end_time"] or dtend
    deadline = kwargs["deadline"] or due

    now = get_utc_now()
    created = kwargs["created"] or now
    last_modified = kwargs["last_modified"] or now
    dtstamp = kwargs["dtstamp"] or now
    cleaned_uid = (uid or "").strip() or None

    todo_kwargs = {
        "name": kwargs["name"],
        "summary": kwargs["summary"] or kwargs["name"],
        "description": kwargs["description"],
        "user_notes": kwargs["user_notes"],
        "who_founder": (kwargs["who_founder"] or "").strip() or None,
        "who_executor": (kwargs["who_executor"] or "").strip() or None,
        "parent_todo_id": kwargs["parent_todo_id"],
        "item_type": (kwargs["item_type"] or "VTODO").upper(),
        "location": kwargs["location"],
        "categories": kwargs["categories"],
        "classification": kwargs["classification"],
        "deadline": deadline,
        "start_time": start_time,
        "end_time": end_time,
        "dtstart": dtstart,
        "dtend": dtend,
        "due": due,
        "duration": kwargs["duration"],
        "time_zone": kwargs["time_zone"],
        "tzid": kwargs["tzid"] or kwargs["time_zone"],
        "is_all_day": bool(kwargs["is_all_day"]) if kwargs["is_all_day"] is not None else False,
        "dtstamp": dtstamp,
        "created": created,
        "last_modified": last_modified,
        "sequence": kwargs["sequence"] if kwargs["sequence"] is not None else 0,
        "rdate": kwargs["rdate"],
        "exdate": kwargs["exdate"],
        "recurrence_id": kwargs["recurrence_id"],
        "related_to_uid": kwargs["related_to_uid"],
        "related_to_reltype": kwargs["related_to_reltype"],
        "ical_status": kwargs["ical_status"],
        "reminder_offsets": _serialize_reminder_offsets(reminder_offsets),
        "status": status,
        "priority": kwargs["priority"],
        "completed_at": resolved_completed_at,
        "percent_complete": resolved_percent,
        "rrule": (rrule or "").strip() or None,
        "order": kwargs["order"],
        "related_activities": json.dumps(_safe_int_list(related_activities)),
    }
    if cleaned_uid:
        todo_kwargs["uid"] = cleaned_uid
    return normalize_todo_datetimes(todo_kwargs)
