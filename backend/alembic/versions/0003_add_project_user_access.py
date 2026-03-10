"""Add project_user_access table

Revision ID: 0003_add_project_user_access
Revises: 0002_add_created_by_to_servers_and_databases
Create Date: 2026-03-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0003_add_project_user_access'
down_revision: Union[str, None] = '0002_created_by_servers_dbs'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE project_user_access (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            access_level accesslevelenum NOT NULL DEFAULT 'Viewer',
            CONSTRAINT uq_project_user_access UNIQUE (project_id, user_id)
        )
    """)
    op.create_index(op.f('ix_project_user_access_id'), 'project_user_access', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_project_user_access_id'), table_name='project_user_access')
    op.drop_table('project_user_access')
