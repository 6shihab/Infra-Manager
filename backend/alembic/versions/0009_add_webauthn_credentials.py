"""Add webauthn_credentials table for passkey support

Revision ID: 0009_add_webauthn_credentials
Revises: 0008_add_missing_indexes
Create Date: 2026-03-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID

revision: str = '0009_add_webauthn_credentials'
down_revision: Union[str, None] = '0008_add_missing_indexes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'webauthn_credentials',
        sa.Column('id', PgUUID(as_uuid=True), primary_key=True, index=True),
        sa.Column('user_id', PgUUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('credential_id', sa.String(), unique=True, nullable=False, index=True),
        sa.Column('public_key', sa.String(), nullable=False),
        sa.Column('sign_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('transports', sa.JSON(), nullable=True),
        sa.Column('device_name', sa.String(256), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('webauthn_credentials')
