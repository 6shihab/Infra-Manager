"""Add missing indexes for performance

Revision ID: 0008_add_missing_indexes
Revises: 0007_token_blocklist_jti
Create Date: 2026-03-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = '0008_add_missing_indexes'
down_revision: Union[str, None] = '0007_token_blocklist_jti'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_project_group_access_project_id', 'project_group_access', ['project_id'])
    op.create_index('ix_project_group_access_group_id', 'project_group_access', ['group_id'])
    op.create_index('ix_project_user_access_project_id', 'project_user_access', ['project_id'])
    op.create_index('ix_project_user_access_user_id', 'project_user_access', ['user_id'])
    op.create_index('ix_audit_logs_timestamp', 'audit_logs', ['timestamp'])


def downgrade() -> None:
    op.drop_index('ix_audit_logs_timestamp', 'audit_logs')
    op.drop_index('ix_project_user_access_user_id', 'project_user_access')
    op.drop_index('ix_project_user_access_project_id', 'project_user_access')
    op.drop_index('ix_project_group_access_group_id', 'project_group_access')
    op.drop_index('ix_project_group_access_project_id', 'project_group_access')
