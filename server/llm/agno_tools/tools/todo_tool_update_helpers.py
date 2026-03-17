"""Update helpers for Agno todo tools."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from llm.agno_tools.tools.todo_tool_helpers import (
    is_explicit_null,
    normalize_int_list,
    normalize_item_type,
    normalize_priority,
    normalize_status,
    normalize_str_list,
    parse_bool,
    parse_datetime,
    parse_int,
)

if TYPE_CHECKING:
    from datetime import datetime


def _apply_text(update_kwargs: dict[str, Any], field: str, value: Any) -> None:
    if value is not None:
        update_kwargs[field] = None if is_explicit_null(value) else value


def _apply_datetime(update_kwargs: dict[str, Any], field: str, value: Any) -> None:
    if is_explicit_null(value):
        update_kwargs[field] = None
        return
    if value is not None:
        parsed = parse_datetime(value)
        if parsed is not None:
            update_kwargs[field] = parsed


def _apply_int(update_kwargs: dict[str, Any], field: str, value: Any) -> None:
    if is_explicit_null(value):
        update_kwargs[field] = None
        return
    if value is not None:
        parsed = parse_int(value)
        if parsed is not None:
            update_kwargs[field] = parsed


def _apply_bool(update_kwargs: dict[str, Any], field: str, value: Any) -> None:
    if is_explicit_null(value):
        update_kwargs[field] = None
        return
    if value is not None:
        parsed = parse_bool(value)
        if parsed is not None:
            update_kwargs[field] = parsed


def _apply_list_str(
    update_kwargs: dict[str, Any],
    field: str,
    value: Any,
    *,
    empty_on_null: bool,
) -> None:
    if value is None:
        if empty_on_null:
            update_kwargs[field] = []
        return
    if is_explicit_null(value):
        update_kwargs[field] = [] if empty_on_null else None
        return
    update_kwargs[field] = normalize_str_list(value) or []


def _apply_list_int(
    update_kwargs: dict[str, Any],
    field: str,
    value: Any,
    *,
    empty_on_null: bool,
) -> None:
    if value is None:
        if empty_on_null:
            update_kwargs[field] = []
        return
    if is_explicit_null(value):
        update_kwargs[field] = [] if empty_on_null else None
        return
    update_kwargs[field] = normalize_int_list(value) or []


@dataclass(slots=True)
class UpdateTodoPayload:
    name: str | None = None
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


def build_update_kwargs(payload: UpdateTodoPayload) -> dict[str, Any]:
    update_kwargs: dict[str, Any] = {}
    _apply_update_text_fields(update_kwargs, payload)
    _apply_update_datetime_fields(update_kwargs, payload)
    _apply_update_int_fields(update_kwargs, payload)
    _apply_update_simple_fields(update_kwargs, payload)
    _apply_update_list_fields(update_kwargs, payload)
    return update_kwargs


def _apply_update_list_fields(
    update_kwargs: dict[str, Any],
    payload: UpdateTodoPayload,
) -> None:
    _apply_list_int(
        update_kwargs,
        "reminder_offsets",
        payload.reminder_offsets,
        empty_on_null=False,
    )
    _apply_list_str(update_kwargs, "tags", payload.tags, empty_on_null=True)
    _apply_list_int(
        update_kwargs,
        "related_activities",
        payload.related_activities,
        empty_on_null=True,
    )


def _apply_update_text_fields(
    update_kwargs: dict[str, Any],
    payload: UpdateTodoPayload,
) -> None:
    text_fields = {
        "summary": payload.summary,
        "description": payload.description,
        "user_notes": payload.user_notes,
        "who_founder": (payload.who_founder or "").strip() or None,
        "who_executor": (payload.who_executor or "").strip() or None,
        "location": payload.location,
        "categories": payload.categories,
        "classification": payload.classification,
        "duration": payload.duration,
        "time_zone": payload.time_zone,
        "tzid": payload.tzid,
        "rdate": payload.rdate,
        "exdate": payload.exdate,
        "related_to_uid": payload.related_to_uid,
        "related_to_reltype": payload.related_to_reltype,
        "ical_status": payload.ical_status,
        "rrule": payload.rrule,
    }
    for field, value in text_fields.items():
        _apply_text(update_kwargs, field, value)


def _apply_update_datetime_fields(
    update_kwargs: dict[str, Any],
    payload: UpdateTodoPayload,
) -> None:
    datetime_fields = {
        "deadline": payload.deadline,
        "start_time": payload.start_time,
        "end_time": payload.end_time,
        "dtstart": payload.dtstart,
        "dtend": payload.dtend,
        "due": payload.due,
        "dtstamp": payload.dtstamp,
        "created": payload.created,
        "last_modified": payload.last_modified,
        "recurrence_id": payload.recurrence_id,
        "completed_at": payload.completed_at,
    }
    for field, value in datetime_fields.items():
        _apply_datetime(update_kwargs, field, value)


def _apply_update_int_fields(
    update_kwargs: dict[str, Any],
    payload: UpdateTodoPayload,
) -> None:
    int_fields = {
        "sequence": payload.sequence,
        "percent_complete": payload.percent_complete,
        "order": payload.order,
    }
    for field, value in int_fields.items():
        _apply_int(update_kwargs, field, value)


def _apply_update_simple_fields(
    update_kwargs: dict[str, Any],
    payload: UpdateTodoPayload,
) -> None:
    if payload.name is not None and not is_explicit_null(payload.name):
        update_kwargs["name"] = payload.name

    _apply_bool(update_kwargs, "is_all_day", payload.is_all_day)

    if payload.parent_todo_id is not None or is_explicit_null(payload.parent_todo_id):
        if is_explicit_null(payload.parent_todo_id):
            update_kwargs["parent_todo_id"] = None
        else:
            parsed_parent = parse_int(payload.parent_todo_id)
            if parsed_parent is not None:
                update_kwargs["parent_todo_id"] = parsed_parent

    normalized_item_type = (
        normalize_item_type(payload.item_type) if payload.item_type is not None else None
    )
    if normalized_item_type is not None:
        update_kwargs["item_type"] = normalized_item_type

    normalized_status = normalize_status(payload.status) if payload.status is not None else None
    if normalized_status is not None:
        update_kwargs["status"] = normalized_status

    normalized_priority = (
        normalize_priority(payload.priority) if payload.priority is not None else None
    )
    if normalized_priority is not None:
        update_kwargs["priority"] = normalized_priority
