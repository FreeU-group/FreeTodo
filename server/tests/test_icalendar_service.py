from __future__ import annotations

from datetime import UTC, datetime

from icalendar import Calendar

from schemas.todo import TodoItemType
from services.icalendar_service import ICalendarService


def test_export_vtodo_fallbacks_due_to_dtstart() -> None:
    service = ICalendarService()
    dtstart = datetime(2024, 1, 1, 9, 30, tzinfo=UTC)

    ics = service.export_todos(
        [
            {
                "id": 1,
                "uid": "todo-1",
                "name": "Test",
                "item_type": "VTODO",
                "dtstart": dtstart,
            }
        ]
    )

    cal = Calendar.from_ical(ics)
    component = next(comp for comp in cal.walk() if comp.name == "VTODO")
    assert component.get("DUE") is not None


def test_import_vtodo_duration_keeps_due_none() -> None:
    service = ICalendarService()
    ics = "\n".join(
        [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//LifeTrace//FreeTodo//EN",
            "BEGIN:VTODO",
            "UID:todo-2",
            "SUMMARY:Duration Task",
            "DTSTART:20240102T090000Z",
            "DURATION:PT30M",
            "END:VTODO",
            "END:VCALENDAR",
            "",
        ]
    )

    todos = service.import_todos(ics)
    assert len(todos) == 1
    todo = todos[0]
    assert todo.item_type == TodoItemType.VTODO
    assert todo.duration == "PT30M"
    assert todo.due is None
