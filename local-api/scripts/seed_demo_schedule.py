"""Seed demo data for TLBS Level 1 scenario.

Creates sample schedule events so the Agent can demonstrate
proactive conflict detection and smart rescheduling.

Usage (from project root or server/ directory):
    python server/scripts/seed_demo_schedule.py
    python server/scripts/seed_demo_schedule.py 2026-03-17
    cd server && python scripts/seed_demo_schedule.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

# Ensure the server package root is on sys.path so that
# `from repositories...`, `from storage...` etc. resolve correctly
# regardless of where the script is invoked from.
_server_dir = str(Path(__file__).resolve().parent.parent)
if _server_dir not in sys.path:
    sys.path.insert(0, _server_dir)

from repositories.sql_todo_repository import SqlTodoRepository  # noqa: E402
from storage.database import db_base  # noqa: E402
from util.logging_config import get_logger  # noqa: E402

logger = get_logger()


def _tomorrow() -> str:
    from zoneinfo import ZoneInfo  # noqa: PLC0415

    return (datetime.now(tz=ZoneInfo("Asia/Shanghai")) + timedelta(days=1)).strftime("%Y-%m-%d")


DEMO_EVENTS = [
    {
        "name": "篮球比赛",
        "description": "和同事们的篮球友谊赛",
        "item_type": "VEVENT",
        "location": "五棵松体育馆",
        "start_time_offset": (14, 30),
        "end_time_offset": (16, 30),
        "priority": "medium",
        "tags": "运动,社交",
    },
    {
        "name": "晨会 - 周迭代同步",
        "description": "每周一团队晨会",
        "item_type": "VEVENT",
        "location": "公司会议室A",
        "start_time_offset": (9, 0),
        "end_time_offset": (9, 30),
        "priority": "high",
        "tags": "工作,会议",
    },
    {
        "name": "论文修改",
        "description": "修改第三章实验数据部分",
        "item_type": "VTODO",
        "start_time_offset": (10, 0),
        "end_time_offset": (12, 0),
        "priority": "high",
        "tags": "学习,论文",
    },
]


def seed(target_date: str | None = None) -> list[int]:
    """Insert demo events and return created todo IDs."""
    date_str = target_date or _tomorrow()
    base_date = datetime.fromisoformat(date_str)

    repo = SqlTodoRepository(db_base)
    created_ids: list[int] = []

    for evt in DEMO_EVENTS:
        h_start, m_start = evt["start_time_offset"]
        h_end, m_end = evt["end_time_offset"]
        start = base_date.replace(hour=h_start, minute=m_start, second=0, microsecond=0)
        end = base_date.replace(hour=h_end, minute=m_end, second=0, microsecond=0)

        kwargs: dict = {
            "name": evt["name"],
            "description": evt.get("description", ""),
            "item_type": evt.get("item_type", "VTODO"),
            "location": evt.get("location", ""),
            "start_time": start,
            "end_time": end,
            "priority": evt.get("priority", "medium"),
            "status": "active",
            "tags": evt.get("tags", ""),
        }

        todo_id = repo.create(**kwargs)
        if todo_id:
            created_ids.append(todo_id)
            logger.info(
                "Created: [%s] %s  %s-%s @ %s",
                todo_id,
                evt["name"],
                start.strftime("%H:%M"),
                end.strftime("%H:%M"),
                evt.get("location", "N/A"),
            )

    print(f"\n✅ Seeded {len(created_ids)} demo events for {date_str}")
    print("   IDs:", created_ids)
    print(
        "\n📋 Demo scenario: Lisa says '明天下午3:00有空吗？一起喝下午茶吧！'\n"
        "   Agent should detect conflict with 篮球比赛 (14:30-16:30),\n"
        "   find free slots, suggest rescheduling, and recommend\n"
        "   nearby restaurants around 五棵松体育馆.\n"
    )
    return created_ids


if __name__ == "__main__":
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    seed(date_arg)
