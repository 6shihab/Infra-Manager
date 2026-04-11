"""Add keycloak_id column to users table for Keycloak OIDC integration

Revision ID: 0012_add_keycloak_id
Revises: 0011_add_folder_parent_id
Create Date: 2026-04-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0012_add_keycloak_id'
down_revision: Union[str, None] = '0011_add_folder_parent_id'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('keycloak_id', sa.String(), nullable=True))
    op.create_unique_constraint('uq_users_keycloak_id', 'users', ['keycloak_id'])
    op.create_index('ix_users_keycloak_id', 'users', ['keycloak_id'])


def downgrade() -> None:
    op.drop_index('ix_users_keycloak_id', table_name='users')
    op.drop_constraint('uq_users_keycloak_id', 'users', type_='unique')
    op.drop_column('users', 'keycloak_id')
