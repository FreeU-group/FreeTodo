"""Remove project and task related tables

删除项目管理相关的表和字段：
- 删除 projects 表
- 删除 tasks 表
- 删除 task_progress 表
- 删除 event_task_relations 表
- 从 events 表中删除 task_id 和 auto_association_attempted 字段

Revision ID: remove_project_task
Revises: 4ca5036ec7c8
Create Date: 2025-01-07
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "remove_project_task"
down_revision = "4ca5036ec7c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """删除项目和任务相关的表和字段"""
    # 1. 删除 event_task_relations 表
    op.drop_table("event_task_relations")

    # 2. 删除 task_progress 表
    op.drop_table("task_progress")

    # 3. 删除 tasks 表
    op.drop_table("tasks")

    # 4. 删除 projects 表
    op.drop_table("projects")

    # 5. 从 events 表中删除 task_id 和 auto_association_attempted 字段
    with op.batch_alter_table("events") as batch_op:
        batch_op.drop_column("task_id")
        batch_op.drop_column("auto_association_attempted")


def downgrade() -> None:
    """恢复项目和任务相关的表和字段（回滚用）"""
    # 1. 恢复 events 表中的字段
    with op.batch_alter_table("events") as batch_op:
        batch_op.add_column(sa.Column("task_id", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "auto_association_attempted", sa.Boolean(), nullable=False, server_default="0"
            )
        )

    # 2. 恢复 projects 表
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("definition_of_done", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )

    # 3. 恢复 tasks 表
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )

    # 4. 恢复 task_progress 表
    op.create_table(
        "task_progress",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("context_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("generated_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )

    # 5. 恢复 event_task_relations 表
    op.create_table(
        "event_task_relations",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("task_id", sa.Integer(), nullable=True),
        sa.Column("project_confidence", sa.Float(), nullable=True),
        sa.Column("task_confidence", sa.Float(), nullable=True),
        sa.Column("reasoning", sa.Text(), nullable=True),
        sa.Column("association_method", sa.String(length=50), nullable=True),
        sa.Column("used_in_summary", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )
