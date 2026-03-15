"""Add TOTP 2FA fields to users

Revision ID: 0006_add_totp_fields
Revises: 0005_migrate_to_uuid
Create Date: 2026-03-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0006_add_totp_fields'
down_revision: Union[str, None] = '0005_migrate_to_uuid'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('totp_secret', sa.String(), nullable=True))
    op.add_column('users', sa.Column('totp_enabled', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('users', sa.Column('totp_backup_codes', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'totp_backup_codes')
    op.drop_column('users', 'totp_enabled')
    op.drop_column('users', 'totp_secret')
