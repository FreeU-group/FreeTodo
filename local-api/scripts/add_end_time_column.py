"""
One-off helper script to add missing columns on the existing `todos` table
in the local SQLite database, without dropping data.

Currently it ensures the following columns exist (adding them if missing):
    - todos.end_time           (DATETIME)
    - todos.time_zone          (TEXT / VARCHAR)
    - todos.completed_at       (DATETIME)
    - todo_attachment_relations.source (TEXT / VARCHAR)

Usage (from `lifetrace/` directory):

    uv run python scripts/add_end_time_column.py
"""

from __future__ import annotations

import sqlite3
from pathlib import Path


def main() -> None:
    db_path = Path("data/lifetrace.db")
    print(f"DB path: {db_path.resolve()}")

    if not db_path.exists():
        print("数据库文件不存在，当前还没有初始化过 data/lifetrace.db，无需修复。")
        return

    conn = sqlite3.connect(db_path)
    try:
        # ===== 修复 todos 表 =====
        cur = conn.execute("PRAGMA table_info(todos)")
        todo_cols = [row[1] for row in cur.fetchall()]
        print("当前 todos 列：", todo_cols)

        # 1. 确保 end_time 列存在
        if "end_time" not in todo_cols:
            print("添加 end_time 列到 todos 表...")
            conn.execute("ALTER TABLE todos ADD COLUMN end_time DATETIME")
            conn.commit()
            print("end_time 列已添加完成。")
        else:
            print("end_time 列已经存在，无需添加。")

        # 2. 确保 time_zone 列存在
        if "time_zone" not in todo_cols:
            print("添加 time_zone 列到 todos 表...")
            conn.execute("ALTER TABLE todos ADD COLUMN time_zone VARCHAR(64)")
            conn.commit()
            print("time_zone 列已添加完成。")
        else:
            print("time_zone 列已经存在，无需添加。")

        # 3. 确保 completed_at 列存在
        if "completed_at" not in todo_cols:
            print("添加 completed_at 列到 todos 表...")
            conn.execute("ALTER TABLE todos ADD COLUMN completed_at DATETIME")
            conn.commit()
            print("completed_at 列已添加完成。")
        else:
            print("completed_at 列已经存在，无需添加。")

        # ===== 修复 todo_attachment_relations 表 =====
        cur = conn.execute("PRAGMA table_info(todo_attachment_relations)")
        rel_cols = [row[1] for row in cur.fetchall()]
        print("当前 todo_attachment_relations 列：", rel_cols)

        if "source" not in rel_cols:
            print("添加 source 列到 todo_attachment_relations 表...")
            conn.execute(
                "ALTER TABLE todo_attachment_relations ADD COLUMN source VARCHAR(20) DEFAULT 'user'"
            )
            conn.commit()
            print("source 列已添加完成。")
        else:
            print("todo_attachment_relations.source 列已经存在，无需添加。")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
