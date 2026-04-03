"""add_file_path_to_audio_recordings

Revision ID: add_file_path_001
Revises: remove_project_task
Create Date: 2026-01-19 06:30:00.000000

添加缺失的列到 audio_recordings 表（包括 file_path, file_size, duration 等）
如果表不存在则创建完整的表结构
同时创建 transcriptions 表（如果不存在）
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_file_path_001"
down_revision: str = "remove_project_task"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """添加缺失的列到 audio_recordings 表，并创建 transcriptions 表"""
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    # 首先创建 transcriptions 表（如果不存在）
    _create_transcriptions_table_if_not_exists(existing_tables)

    # 检查 audio_recordings 表是否存在
    if "audio_recordings" not in existing_tables:
        # 如果表不存在，创建完整的表
        op.create_table(
            "audio_recordings",
            sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
            sa.Column("file_path", sa.String(length=500), nullable=False),
            sa.Column("file_size", sa.Integer(), nullable=False),
            sa.Column("duration", sa.Float(), nullable=False),
            sa.Column("start_time", sa.DateTime(), nullable=False),
            sa.Column("end_time", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="recording"),
            sa.Column("is_24x7", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("is_transcribed", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("is_extracted", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("is_summarized", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("is_full_audio", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("is_segment_audio", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column(
                "transcription_status",
                sa.String(length=20),
                nullable=False,
                server_default="pending",
            ),
        )
        return

    # 表存在，检查并添加缺失的列
    columns = {col["name"]: col for col in inspector.get_columns("audio_recordings")}

    # 需要添加的列及其定义
    columns_to_add = {
        "file_path": sa.Column("file_path", sa.String(length=500), nullable=True),
        "file_size": sa.Column("file_size", sa.Integer(), nullable=True),
        "duration": sa.Column("duration", sa.Float(), nullable=True),
        "start_time": sa.Column("start_time", sa.DateTime(), nullable=True),
        "end_time": sa.Column("end_time", sa.DateTime(), nullable=True),
        "status": sa.Column(
            "status", sa.String(length=20), nullable=True, server_default="recording"
        ),
        "is_24x7": sa.Column("is_24x7", sa.Boolean(), nullable=True, server_default="0"),
        "is_transcribed": sa.Column(
            "is_transcribed", sa.Boolean(), nullable=True, server_default="0"
        ),
        "is_extracted": sa.Column("is_extracted", sa.Boolean(), nullable=True, server_default="0"),
        "is_summarized": sa.Column(
            "is_summarized", sa.Boolean(), nullable=True, server_default="0"
        ),
        "is_full_audio": sa.Column(
            "is_full_audio", sa.Boolean(), nullable=True, server_default="0"
        ),
        "is_segment_audio": sa.Column(
            "is_segment_audio", sa.Boolean(), nullable=True, server_default="0"
        ),
        "transcription_status": sa.Column(
            "transcription_status", sa.String(length=20), nullable=True, server_default="pending"
        ),
        "created_at": sa.Column("created_at", sa.DateTime(), nullable=True),
        "updated_at": sa.Column("updated_at", sa.DateTime(), nullable=True),
        "deleted_at": sa.Column("deleted_at", sa.DateTime(), nullable=True),
    }

    # 添加缺失的列
    for col_name, col_def in columns_to_add.items():
        if col_name not in columns:
            op.add_column("audio_recordings", col_def)

    # 为现有记录设置默认值
    op.execute("UPDATE audio_recordings SET file_path = '' WHERE file_path IS NULL")
    op.execute("UPDATE audio_recordings SET file_size = 0 WHERE file_size IS NULL")
    op.execute("UPDATE audio_recordings SET duration = 0 WHERE duration IS NULL")
    op.execute("UPDATE audio_recordings SET status = 'recording' WHERE status IS NULL")
    op.execute("UPDATE audio_recordings SET is_24x7 = 0 WHERE is_24x7 IS NULL")
    op.execute("UPDATE audio_recordings SET is_transcribed = 0 WHERE is_transcribed IS NULL")
    op.execute("UPDATE audio_recordings SET is_extracted = 0 WHERE is_extracted IS NULL")
    op.execute("UPDATE audio_recordings SET is_summarized = 0 WHERE is_summarized IS NULL")
    op.execute("UPDATE audio_recordings SET is_full_audio = 0 WHERE is_full_audio IS NULL")
    op.execute("UPDATE audio_recordings SET is_segment_audio = 0 WHERE is_segment_audio IS NULL")
    op.execute(
        "UPDATE audio_recordings SET transcription_status = 'pending' WHERE transcription_status IS NULL"
    )


def _create_transcriptions_table_if_not_exists(existing_tables: list[str]) -> None:
    """创建 transcriptions 表（如果不存在）"""
    if "transcriptions" not in existing_tables:
        op.create_table(
            "transcriptions",
            sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
            sa.Column("audio_recording_id", sa.Integer(), nullable=False),
            sa.Column("original_text", sa.Text(), nullable=True),
            sa.Column("optimized_text", sa.Text(), nullable=True),
            sa.Column(
                "extraction_status",
                sa.String(length=20),
                nullable=False,
                server_default="pending",
            ),
            sa.Column("extracted_todos", sa.Text(), nullable=True),
            sa.Column("extracted_schedules", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    """移除 file_path 列"""
    op.drop_column("audio_recordings", "file_path")
