"""Helpers for Agno todo tools."""

from __future__ import annotations

import contextlib
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

_VALID_PRIORITIES = {"high", "medium", "low", "none"}
_VALID_STATUSES = {"active", "completed", "canceled", "draft"}
_VALID_ITEM_TYPES = {"VTODO", "VEVENT"}
_NULL_STRINGS = {"", "null", "none", "nil", "undefined"}


def is_explicit_null(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower() in _NULL_STRINGS


def parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        with contextlib.suppress(ValueError):
            return datetime.fromisoformat(text.replace("Z", "+00:00"))
    return None


def parse_int(value: Any) -> int | None:
    if value is None:
        return None

    result: int | None = None

    if isinstance(value, bool):
        result = int(value)
    elif isinstance(value, int):
        result = value
    elif isinstance(value, float):
        result = int(value) if value.is_integer() else None
    elif isinstance(value, str):
        text = value.strip()
        if text:
            with contextlib.suppress(ValueError):
                result = int(text)
            if result is None:
                parsed: float | None = None
                with contextlib.suppress(ValueError):
                    parsed = float(text)
                if parsed is not None and parsed.is_integer():
                    result = int(parsed)

    return result


def parse_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value != 0
    if isinstance(value, str):
        text = value.strip().lower()
        if text in {"true", "1", "yes", "y", "on"}:
            return True
        if text in {"false", "0", "no", "n", "off"}:
            return False
    return None


def normalize_list(value: Any) -> list[Any] | None:
    result: list[Any] | None

    if value is None:
        result = None
    elif isinstance(value, list):
        result = value
    elif isinstance(value, tuple | set):
        result = list(value)
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            result = []
        elif text.startswith("[") and text.endswith("]"):
            parsed: list[Any] | None = None
            with contextlib.suppress(json.JSONDecodeError):
                loaded = json.loads(text)
                if isinstance(loaded, list):
                    parsed = loaded
            result = parsed if parsed is not None else [part.strip() for part in text.split(",")]
        else:
            result = [part.strip() for part in text.split(",")]
    else:
        result = [value]

    return result


@dataclass(slots=True)
class CreateTodoPayload:
    name: str
    summary: str | None = None
    description: str | None = None
    user_notes: str | None = None
    who_founder: str | None = None
    who_executor: str | None = None
    parent_todo_id: int | str | None = None
    item_type: str | None = None
    location: str | None = None
    categories: str | None = None
    classification: str | None = None
    deadline: str | datetime | None = None
    start_time: str | datetime | None = None
    end_time: str | datetime | None = None
    dtstart: str | datetime | None = None
    dtend: str | datetime | None = None
    due: str | datetime | None = None
    duration: str | None = None
    time_zone: str | None = None
    tzid: str | None = None
    is_all_day: bool | str | int | None = None
    dtstamp: str | datetime | None = None
    created: str | datetime | None = None
    last_modified: str | datetime | None = None
    sequence: int | str | None = None
    rdate: str | None = None
    exdate: str | None = None
    recurrence_id: str | datetime | None = None
    related_to_uid: str | None = None
    related_to_reltype: str | None = None
    ical_status: str | None = None
    reminder_offsets: list[int] | str | None = None
    status: str | None = None
    priority: str | None = None
    completed_at: str | datetime | None = None
    percent_complete: int | str | None = None
    rrule: str | None = None
    order: int | str | None = None
    tags: list[str] | str | None = None
    related_activities: list[int] | str | None = None
    uid: str | None = None


def normalize_str_list(value: Any) -> list[str] | None:
    items = normalize_list(value)
    if items is None:
        return None
    cleaned: list[str] = []
    for item in items:
        if item is None:
            continue
        text = str(item).strip()
        if text:
            cleaned.append(text)
    return cleaned


def normalize_int_list(value: Any) -> list[int] | None:
    items = normalize_list(value)
    if items is None:
        return None
    result: list[int] = []
    for item in items:
        parsed = parse_int(item)
        if parsed is not None:
            result.append(parsed)
    return result


def normalize_priority(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    aliases = {
        "urgent": "high",
        "p1": "high",
        "p2": "medium",
        "p3": "low",
        "normal": "medium",
    }
    mapped = aliases.get(text, text)
    return mapped if mapped in _VALID_PRIORITIES else None


def normalize_status(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    aliases = {
        "done": "completed",
        "complete": "completed",
        "finished": "completed",
        "cancelled": "canceled",
        "cancel": "canceled",
        "todo": "active",
        "open": "active",
        "in_progress": "active",
    }
    mapped = aliases.get(text, text)
    return mapped if mapped in _VALID_STATUSES else None


def normalize_item_type(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip().upper()
    aliases = {"TODO": "VTODO", "EVENT": "VEVENT"}
    mapped = aliases.get(text, text)
    return mapped if mapped in _VALID_ITEM_TYPES else None


def build_create_kwargs(payload: CreateTodoPayload) -> dict[str, Any]:
    parsed_parent_id = parse_int(payload.parent_todo_id)
    parsed_item_type = normalize_item_type(payload.item_type)
    parsed_datetimes = {
        "deadline": parse_datetime(payload.deadline),
        "start_time": parse_datetime(payload.start_time),
        "end_time": parse_datetime(payload.end_time),
        "dtstart": parse_datetime(payload.dtstart),
        "dtend": parse_datetime(payload.dtend),
        "due": parse_datetime(payload.due),
        "dtstamp": parse_datetime(payload.dtstamp),
        "created": parse_datetime(payload.created),
        "last_modified": parse_datetime(payload.last_modified),
        "recurrence_id": parse_datetime(payload.recurrence_id),
        "completed_at": parse_datetime(payload.completed_at),
    }

    tag_list = normalize_str_list(payload.tags)
    reminder_list = normalize_int_list(payload.reminder_offsets)
    related_activity_list = normalize_int_list(payload.related_activities)

    normalized_priority = normalize_priority(payload.priority) or "none"
    normalized_status = normalize_status(payload.status) or "active"

    todo_kwargs: dict[str, Any] = {
        "name": payload.name,
        "summary": payload.summary,
        "description": payload.description,
        "user_notes": payload.user_notes,
        "who_founder": (payload.who_founder or "").strip() or None,
        "who_executor": (payload.who_executor or "").strip() or None,
        "parent_todo_id": parsed_parent_id,
        "item_type": parsed_item_type,
        "location": payload.location,
        "categories": payload.categories,
        "classification": payload.classification,
        "duration": payload.duration,
        "time_zone": payload.time_zone,
        "tzid": payload.tzid,
        "is_all_day": parse_bool(payload.is_all_day),
        "sequence": parse_int(payload.sequence),
        "rdate": payload.rdate,
        "exdate": payload.exdate,
        "related_to_uid": payload.related_to_uid,
        "related_to_reltype": payload.related_to_reltype,
        "ical_status": payload.ical_status,
        "reminder_offsets": reminder_list,
        "status": normalized_status,
        "priority": normalized_priority,
        "percent_complete": parse_int(payload.percent_complete),
        "rrule": payload.rrule,
        "order": parse_int(payload.order) or 0,
        "tags": tag_list,
        "related_activities": related_activity_list,
    }
    todo_kwargs.update(parsed_datetimes)
    if payload.uid:
        todo_kwargs["uid"] = payload.uid
    return todo_kwargs
