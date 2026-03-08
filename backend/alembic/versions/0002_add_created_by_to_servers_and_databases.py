"""Add created_by to servers and database_engines

Revision ID: 0002_add_created_by_to_servers_and_databases
Revises: 0001_initial_schema
Create Date: 2026-03-08 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002_created_by_servers_dbs'
down_revision: Union[str, Sequence[str], None] = '0001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('servers', sa.Column('created_by', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_servers_created_by_users', 'servers', 'users', ['created_by'], ['id'], ondelete='SET NULL'
    )
    op.add_column('database_engines', sa.Column('created_by', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_database_engines_created_by_users', 'database_engines', 'users', ['created_by'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('fk_database_engines_created_by_users', 'database_engines', type_='foreignkey')
    op.drop_column('database_engines', 'created_by')
    op.drop_constraint('fk_servers_created_by_users', 'servers', type_='foreignkey')
    op.drop_column('servers', 'created_by')
