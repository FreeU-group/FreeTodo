#!/usr/bin/env python3
"""直接添加 file_path 列到 audio_recordings 表（无需 Alembic 迁移）"""

import sqlite3
from pathlib import Path


def add_file_path_column():
    """添加 file_path 列到 audio_recordings 表"""
    # 直接使用相对路径（相对于脚本位置）
    script_dir = Path(__file__).parent.parent
    db_path = script_dir / "data" / "db"

    if not Path(db_path).exists():
        print(f"数据库文件不存在: {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 检查列是否已存在
        cursor.execute("PRAGMA table_info(audio_recordings)")
        columns = [row[1] for row in cursor.fetchall()]

        if "file_path" in columns:
            print("[OK] file_path column already exists, no need to add")
            return

        # 添加 file_path 列
        print("Adding file_path column...")
        cursor.execute("ALTER TABLE audio_recordings ADD COLUMN file_path VARCHAR(500)")

        # 为现有记录设置默认值
        cursor.execute("UPDATE audio_recordings SET file_path = '' WHERE file_path IS NULL")

        conn.commit()
        print("[OK] file_path column added successfully!")

    except Exception as e:
        conn.rollback()
        print(f"[ERROR] Failed to add column: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    add_file_path_column()
