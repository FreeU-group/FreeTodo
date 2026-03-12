#!/usr/bin/env python3
"""
修复 transcriptions 表缺失问题。

用法：
    python lifetrace/scripts/fix_transcriptions_table.py
"""

import sqlite3
from pathlib import Path


def ensure_transcriptions_table(db_path: Path) -> None:
    if not db_path.exists():
        print(f"数据库不存在：{db_path}")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    try:
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='transcriptions'")
        exists = cur.fetchone()
        if exists:
            print("[OK] transcriptions 表已存在，跳过创建")
            return

        print("[INFO] transcriptions 表不存在，开始创建...")
        cur.execute(
            """
            CREATE TABLE transcriptions (
                id INTEGER PRIMARY KEY,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                deleted_at DATETIME,
                audio_recording_id INTEGER NOT NULL,
                original_text TEXT,
                optimized_text TEXT,
                extraction_status VARCHAR(20) NOT NULL DEFAULT 'pending',
                extracted_todos TEXT,
                extracted_schedules TEXT
            )
            """
        )
        conn.commit()
        print("[OK] transcriptions 表已创建")
    finally:
        conn.close()


if __name__ == "__main__":
    db_path = Path(__file__).parent.parent / "data" / "db"
    ensure_transcriptions_table(db_path)
