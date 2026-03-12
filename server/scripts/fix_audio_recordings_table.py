#!/usr/bin/env python3
"""修复 audio_recordings 表，添加所有缺失的列"""

import sqlite3
from pathlib import Path


def fix_audio_recordings_table():
    """修复 audio_recordings 表结构"""
    # 直接使用相对路径（相对于脚本位置）
    script_dir = Path(__file__).parent.parent
    db_path = script_dir / "data" / "db"

    if not Path(db_path).exists():
        print(f"Database file not found: {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 检查表是否存在
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='audio_recordings'"
        )
        if not cursor.fetchone():
            print("Table audio_recordings does not exist, creating...")
            # 创建完整的表
            cursor.execute("""
                CREATE TABLE audio_recordings (
                    id INTEGER PRIMARY KEY,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    deleted_at DATETIME,
                    file_path VARCHAR(500) NOT NULL,
                    file_size INTEGER NOT NULL,
                    duration REAL NOT NULL,
                    start_time DATETIME NOT NULL,
                    end_time DATETIME,
                    status VARCHAR(20) NOT NULL DEFAULT 'recording',
                    is_24x7 BOOLEAN NOT NULL DEFAULT 0,
                    transcription_status VARCHAR(20) NOT NULL DEFAULT 'pending'
                )
            """)
            print("[OK] Table created successfully!")
            conn.commit()
            return

        # 表存在，检查并添加缺失的列
        cursor.execute("PRAGMA table_info(audio_recordings)")
        existing_columns = {row[1]: row for row in cursor.fetchall()}

        # 需要添加的列
        columns_to_add = {
            "file_path": "VARCHAR(500)",
            "file_size": "INTEGER",
            "duration": "REAL",
            "start_time": "DATETIME",
            "end_time": "DATETIME",
            "status": "VARCHAR(20)",
            "is_24x7": "BOOLEAN",
            "is_transcribed": "BOOLEAN",
            "is_extracted": "BOOLEAN",
            "is_summarized": "BOOLEAN",
            "is_full_audio": "BOOLEAN",
            "is_segment_audio": "BOOLEAN",
            "transcription_status": "VARCHAR(20)",
            "created_at": "DATETIME",
            "updated_at": "DATETIME",
            "deleted_at": "DATETIME",
        }

        added_columns = []
        for col_name, col_type in columns_to_add.items():
            if col_name not in existing_columns:
                try:
                    cursor.execute(f"ALTER TABLE audio_recordings ADD COLUMN {col_name} {col_type}")
                    added_columns.append(col_name)
                    print(f"Added column: {col_name}")
                except sqlite3.OperationalError as e:
                    print(f"Failed to add column {col_name}: {e}")

        # 设置默认值
        if added_columns:
            cursor.execute("UPDATE audio_recordings SET file_path = '' WHERE file_path IS NULL")
            cursor.execute("UPDATE audio_recordings SET file_size = 0 WHERE file_size IS NULL")
            cursor.execute("UPDATE audio_recordings SET duration = 0 WHERE duration IS NULL")
            cursor.execute("UPDATE audio_recordings SET status = 'recording' WHERE status IS NULL")
            cursor.execute("UPDATE audio_recordings SET is_24x7 = 0 WHERE is_24x7 IS NULL")
            cursor.execute(
                "UPDATE audio_recordings SET is_transcribed = 0 WHERE is_transcribed IS NULL"
            )
            cursor.execute(
                "UPDATE audio_recordings SET is_extracted = 0 WHERE is_extracted IS NULL"
            )
            cursor.execute(
                "UPDATE audio_recordings SET is_summarized = 0 WHERE is_summarized IS NULL"
            )
            cursor.execute(
                "UPDATE audio_recordings SET is_full_audio = 0 WHERE is_full_audio IS NULL"
            )
            cursor.execute(
                "UPDATE audio_recordings SET is_segment_audio = 0 WHERE is_segment_audio IS NULL"
            )
            cursor.execute(
                "UPDATE audio_recordings SET transcription_status = 'pending' WHERE transcription_status IS NULL"
            )

        conn.commit()

        if added_columns:
            print(f"[OK] Added {len(added_columns)} columns: {', '.join(added_columns)}")
        else:
            print("[OK] All columns already exist, no changes needed")

    except Exception as e:
        conn.rollback()
        print(f"[ERROR] Failed to fix table: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    fix_audio_recordings_table()
