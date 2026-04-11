"""Add parent_id to project_folders for nested folder hierarchy

Revision ID: 0011_add_folder_parent_id
Revises: 0010_add_project_folders
Create Date: 2026-04-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID

revision: str = '0011_add_folder_parent_id'
down_revision: Union[str, None] = '0010_add_project_folders'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('project_folders', sa.Column('parent_id', PgUUID(as_uuid=True), nullable=True))
    op.create_index('ix_project_folders_parent_id', 'project_folders', ['parent_id'])
    op.create_foreign_key('fk_project_folders_parent_id', 'project_folders', 'project_folders', ['parent_id'], ['id'], ondelete='CASCADE')


def downgrade() -> None:
    op.drop_constraint('fk_project_folders_parent_id', 'project_folders', type_='foreignkey')
    op.drop_index('ix_project_folders_parent_id', table_name='project_folders')
    op.drop_column('project_folders', 'parent_id')
