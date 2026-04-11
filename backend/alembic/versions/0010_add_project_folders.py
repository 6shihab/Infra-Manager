"""Add project_folders table and folder_id FK on projects

Revision ID: 0010_add_project_folders
Revises: 0009_add_webauthn_credentials
Create Date: 2026-04-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID

revision: str = '0010_add_project_folders'
down_revision: Union[str, None] = '0009_add_webauthn_credentials'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'project_folders',
        sa.Column('id', PgUUID(as_uuid=True), primary_key=True, index=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('color', sa.String(7), nullable=True),
        sa.Column('position', sa.Integer(), server_default='0'),
        sa.Column('created_by', PgUUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), server_default='false', nullable=False, index=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.add_column('projects', sa.Column('folder_id', PgUUID(as_uuid=True), nullable=True))
    op.create_index('ix_projects_folder_id', 'projects', ['folder_id'])
    op.create_foreign_key('fk_projects_folder_id', 'projects', 'project_folders', ['folder_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('fk_projects_folder_id', 'projects', type_='foreignkey')
    op.drop_index('ix_projects_folder_id', table_name='projects')
    op.drop_column('projects', 'folder_id')
    op.drop_table('project_folders')
