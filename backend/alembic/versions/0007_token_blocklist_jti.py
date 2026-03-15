"""Rename token_blocklist.token to jti

Revision ID: 0007_token_blocklist_jti
Revises: 0006_add_totp_fields
Create Date: 2026-03-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = '0007_token_blocklist_jti'
down_revision: Union[str, None] = '0006_add_totp_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('token_blocklist', 'token', new_column_name='jti')


def downgrade() -> None:
    op.alter_column('token_blocklist', 'jti', new_column_name='token')
