"""create user tables

Revision ID: c799bbd0b50a
Revises:
Create Date: 2026-04-03 20:35:12.798049
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel

revision: str = 'c799bbd0b50a'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('membership_plans',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
    sa.Column('type', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
    sa.Column('project_limit', sa.Integer(), nullable=False),
    sa.Column('note_limit', sa.Integer(), nullable=False),
    sa.Column('initial_credits', sa.Integer(), nullable=False),
    sa.Column('daily_refresh_credits', sa.Integer(), nullable=False),
    sa.Column('price', sa.Float(), nullable=False),
    sa.Column('currency', sqlmodel.sql.sqltypes.AutoString(length=10), nullable=False),
    sa.Column('duration_days', sa.Integer(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_membership_plans_type'), 'membership_plans', ['type'], unique=False)

    op.create_table('users',
    sa.Column('id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('username', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
    sa.Column('phone', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=True),
    sa.Column('password_hash', sqlmodel.sql.sqltypes.AutoString(length=256), nullable=True),
    sa.Column('user_type', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
    sa.Column('auth_mode', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
    sa.Column('cloud_user_id', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
    sa.Column('avatar_key', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
    sa.Column('is_dev', sa.Boolean(), nullable=False),
    sa.Column('last_login_at', sa.DateTime(), nullable=True),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_phone'), 'users', ['phone'], unique=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=False)

    op.create_table('user_memberships',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
    sa.Column('membership_plan_id', sa.Integer(), nullable=False),
    sa.Column('start_date', sa.DateTime(), nullable=False),
    sa.Column('end_date', sa.DateTime(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('total_chat_count', sa.Integer(), nullable=False),
    sa.Column('daily_credits', sa.Integer(), nullable=False),
    sa.Column('permanent_credits', sa.Integer(), nullable=False),
    sa.Column('daily_credits_consumed', sa.Integer(), nullable=False),
    sa.Column('total_credits_consumed', sa.Integer(), nullable=False),
    sa.Column('total_credits_purchased', sa.Integer(), nullable=False),
    sa.Column('last_reset_date', sa.DateTime(), nullable=False),
    sa.Column('last_credit_refresh_date', sa.DateTime(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_memberships_is_active'), 'user_memberships', ['is_active'], unique=False)
    op.create_index(op.f('ix_user_memberships_membership_plan_id'), 'user_memberships', ['membership_plan_id'], unique=False)
    op.create_index(op.f('ix_user_memberships_user_id'), 'user_memberships', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_user_memberships_user_id'), table_name='user_memberships')
    op.drop_index(op.f('ix_user_memberships_membership_plan_id'), table_name='user_memberships')
    op.drop_index(op.f('ix_user_memberships_is_active'), table_name='user_memberships')
    op.drop_table('user_memberships')
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_phone'), table_name='users')
    op.drop_table('users')
    op.drop_index(op.f('ix_membership_plans_type'), table_name='membership_plans')
    op.drop_table('membership_plans')
