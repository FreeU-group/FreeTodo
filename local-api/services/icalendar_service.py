"""iCalendar (ICS) import/export service for Todo items."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Any

from icalendar import Calendar, vRecur
from icalendar import Event as VEvent
from icalendar import Todo as VTodo

from schemas.todo import TodoCreate, TodoItemType, TodoPriority, TodoStatus
from util.logging_config import get_logger
from util.time_utils import ensure_utc, naive_as_utc, to_local

logger = get_logger()

PERCENT_COMPLETE_MAX = 100
ICAL_PRIORITY_HIGH = 1
ICAL_PRIORITY_MEDIUM = 5
ICAL_PRIORITY_LOW = 9
ICAL_PRIORITY_NONE = 0


def _normalize_percent(value: Any) -> int:
    if value is None:
        return 0
    try:
        percent = int(value)
    except Exception:
        return 0
    return max(0, min(PERCENT_COMPLETE_MAX, percent))


def _to_local_time(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = naive_as_utc(value)
    return to_local(value)


def _from_ical_dt(value: Any) -> datetime | None:
    if value is None:
        return None
    if hasattr(value, "dt"):
        value = value.dt
    if isinstance(value, datetime):
        return ensure_utc(value)
    if isinstance(value, date):
        return ensure_utc(datetime.combine(value, time.min))
    return None


def _build_calendar() -> Calendar:
    cal = Calendar()
    cal.add("prodid", "-//LifeTrace//Lifetrace//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    return cal


def _add_optional_text(component: VTodo | VEvent, name: str, value: Any) -> None:
    text = (value or "").strip()
    if text:
        component.add(name, text)


def _add_optional_dt(component: VTodo | VEvent, name: str, value: Any) -> None:
    dt_value = _to_local_time(value)
    if dt_value:
        component.add(name, dt_value)


def _add_optional_value(component: VTodo | VEvent, name: str, value: Any) -> None:
    if value is not None:
        component.add(name, value)


def _add_optional_categories(component: VTodo | VEvent, tags: list[Any]) -> None:
    if tags:
        component.add("categories", [str(t) for t in tags if t])


def _add_optional_rrule(component: VTodo | VEvent, rrule: str) -> None:
    if not rrule:
        return
    try:
        component.add("rrule", vRecur.from_ical(rrule))
    except Exception:
        component.add("rrule", rrule)


class ICalendarService:
    """Convert Todo objects to/from iCalendar VTODO components."""

    def export_todos(self, todos: list[dict[str, Any]]) -> str:
        cal = _build_calendar()
        for todo in todos:
            try:
                item_type = (todo.get("item_type") or "VTODO").upper()
                if item_type == "VEVENT":
                    cal.add_component(self._todo_to_vevent(todo))
                else:
                    cal.add_component(self._todo_to_vtodo(todo))
            except Exception as exc:
                logger.warning(f"跳过 todo 导出（ICS）: {exc}")

        return cal.to_ical().decode("utf-8")

    def import_todos(self, ics_content: str) -> list[TodoCreate]:  # noqa: C901
        cal = Calendar.from_ical(ics_content)
        todos: list[TodoCreate] = []

        for component in cal.walk():
            if component.name not in ("VTODO", "VEVENT"):
                continue

            summary = str(component.get("summary") or "").strip()
            if not summary:
                continue

            item_type = TodoItemType.VEVENT if component.name == "VEVENT" else TodoItemType.VTODO
            uid = str(component.get("uid")) if component.get("uid") else None
            description = (
                str(component.get("description")).strip() if component.get("description") else None
            )

            dtstart = _from_ical_dt(component.get("dtstart"))
            dtend = _from_ical_dt(component.get("dtend")) if item_type == "VEVENT" else None
            due = _from_ical_dt(component.get("due")) if item_type == "VTODO" else None
            duration_prop = component.get("duration")
            duration = None
            if duration_prop is not None:
                try:
                    duration = duration_prop.to_ical().decode("utf-8")
                except Exception:
                    duration = str(duration_prop)
            completed_at = _from_ical_dt(component.get("completed"))

            start_time = dtstart or due
            end_time = dtend

            percent_complete = _normalize_percent(component.get("percent-complete"))
            status = self._status_from_ical(component.get("status"))
            if status is None:
                status = (
                    TodoStatus.COMPLETED
                    if percent_complete == PERCENT_COMPLETE_MAX
                    else TodoStatus.ACTIVE
                )

            priority = self._priority_from_ical(component.get("priority"))

            categories = component.get("categories")
            tags: list[str] = []
            if categories:
                if hasattr(categories, "cats"):
                    tags = [str(c) for c in categories.cats if c]
                elif isinstance(categories, list | tuple | set):
                    tags = [str(c) for c in categories if c]
                else:
                    tags = [str(categories)]

            rrule_prop = component.get("rrule")
            rrule = None
            if rrule_prop:
                try:
                    rrule = rrule_prop.to_ical().decode("utf-8")
                except Exception:
                    rrule = str(rrule_prop)

            todos.append(
                TodoCreate(
                    uid=uid,
                    name=summary,
                    summary=summary,
                    description=description,
                    user_notes=None,
                    parent_todo_id=None,
                    item_type=item_type,
                    location=None,
                    categories=",".join(tags) if tags else None,
                    classification=None,
                    start_time=start_time,
                    deadline=None,
                    end_time=end_time,
                    dtstart=dtstart,
                    dtend=dtend,
                    due=due,
                    duration=duration,
                    time_zone=None,
                    tzid=None,
                    is_all_day=None,
                    dtstamp=None,
                    created=None,
                    last_modified=None,
                    sequence=None,
                    rdate=None,
                    exdate=None,
                    recurrence_id=None,
                    related_to_uid=None,
                    related_to_reltype=None,
                    ical_status=None,
                    reminder_offsets=None,
                    status=status,
                    priority=priority,
                    completed_at=completed_at,
                    percent_complete=percent_complete,
                    rrule=rrule,
                    order=0,
                    tags=tags,
                )
            )

        return todos

    def _status_to_ical(self, status: str | None) -> str | None:
        if not status:
            return None
        mapping = {
            "active": "NEEDS-ACTION",
            "completed": "COMPLETED",
            "canceled": "CANCELLED",
            "draft": "NEEDS-ACTION",
        }
        return mapping.get(status, "NEEDS-ACTION")

    def _status_from_ical(self, status: Any) -> TodoStatus | None:
        if not status:
            return None
        status_str = str(status).upper()
        if status_str in ("COMPLETED",):
            return TodoStatus.COMPLETED
        if status_str in ("CANCELLED", "CANCELED"):
            return TodoStatus.CANCELED
        if status_str in ("IN-PROCESS", "NEEDS-ACTION", "ACTION"):
            return TodoStatus.ACTIVE
        return None

    def _priority_to_ical(self, priority: str | None) -> int | None:
        if not priority:
            return ICAL_PRIORITY_NONE
        mapping = {
            "high": ICAL_PRIORITY_HIGH,
            "medium": ICAL_PRIORITY_MEDIUM,
            "low": ICAL_PRIORITY_LOW,
            "none": ICAL_PRIORITY_NONE,
        }
        return mapping.get(priority, ICAL_PRIORITY_NONE)

    def _priority_from_ical(self, priority: Any) -> TodoPriority:
        if priority is None:
            return TodoPriority.NONE
        try:
            value = int(priority)
        except Exception:
            return TodoPriority.NONE
        if value <= ICAL_PRIORITY_HIGH:
            return TodoPriority.HIGH
        if value <= ICAL_PRIORITY_MEDIUM:
            return TodoPriority.MEDIUM
        if value <= ICAL_PRIORITY_LOW:
            return TodoPriority.LOW
        return TodoPriority.NONE

    def _todo_to_vtodo(self, todo: dict[str, Any]) -> VTodo:
        vtodo = VTodo()
        uid = todo.get("uid") or str(todo.get("id") or "")
        if uid:
            vtodo.add("uid", uid)

        summary = todo.get("summary") or todo.get("name")
        _add_optional_text(vtodo, "summary", summary)
        _add_optional_text(vtodo, "description", todo.get("description"))
        dtstart = todo.get("dtstart") or todo.get("start_time") or todo.get("deadline")
        due = todo.get("due") or todo.get("deadline")
        duration = todo.get("duration")
        _add_optional_dt(vtodo, "dtstart", dtstart)
        if duration:
            _add_optional_value(vtodo, "duration", duration)
        else:
            _add_optional_dt(vtodo, "due", due or dtstart)
        _add_optional_dt(vtodo, "created", todo.get("created") or todo.get("created_at"))
        _add_optional_dt(
            vtodo,
            "last-modified",
            todo.get("last_modified") or todo.get("updated_at"),
        )
        _add_optional_value(
            vtodo, "status", todo.get("ical_status") or self._status_to_ical(todo.get("status"))
        )
        _add_optional_value(vtodo, "priority", self._priority_to_ical(todo.get("priority")))
        _add_optional_dt(vtodo, "completed", todo.get("completed_at"))

        percent_complete = _normalize_percent(todo.get("percent_complete"))
        if percent_complete:
            vtodo.add("percent-complete", percent_complete)

        categories_text = (todo.get("categories") or "").strip()
        categories = []
        if categories_text:
            categories = [c.strip() for c in categories_text.split(",") if c.strip()]
        categories.extend(todo.get("tags") or [])
        _add_optional_categories(vtodo, categories)
        _add_optional_rrule(vtodo, (todo.get("rrule") or "").strip())
        return vtodo

    def _todo_to_vevent(self, todo: dict[str, Any]) -> VEvent:
        vevent = VEvent()
        uid = todo.get("uid") or str(todo.get("id") or "")
        if uid:
            vevent.add("uid", uid)

        summary = todo.get("summary") or todo.get("name")
        _add_optional_text(vevent, "summary", summary)
        _add_optional_text(vevent, "description", todo.get("description"))
        dtstart = todo.get("dtstart") or todo.get("start_time")
        dtend = todo.get("dtend") or todo.get("end_time")
        duration = todo.get("duration")
        _add_optional_dt(vevent, "dtstart", dtstart)
        if duration:
            _add_optional_value(vevent, "duration", duration)
        else:
            _add_optional_dt(vevent, "dtend", dtend)
        _add_optional_dt(vevent, "created", todo.get("created") or todo.get("created_at"))
        _add_optional_dt(
            vevent,
            "last-modified",
            todo.get("last_modified") or todo.get("updated_at"),
        )
        _add_optional_value(
            vevent, "status", todo.get("ical_status") or self._status_to_ical(todo.get("status"))
        )
        _add_optional_value(vevent, "priority", self._priority_to_ical(todo.get("priority")))
        categories_text = (todo.get("categories") or "").strip()
        categories = []
        if categories_text:
            categories = [c.strip() for c in categories_text.split(",") if c.strip()]
        categories.extend(todo.get("tags") or [])
        _add_optional_categories(vevent, categories)
        _add_optional_rrule(vevent, (todo.get("rrule") or "").strip())
        return vevent
