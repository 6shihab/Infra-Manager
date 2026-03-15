"""Add deployment_note to projects

Revision ID: 0004_add_deployment_note
Revises: 0003_add_project_user_access
Create Date: 2026-03-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0004_add_deployment_note'
down_revision: Union[str, None] = '0003_add_project_user_access'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('deployment_note', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'deployment_note')
