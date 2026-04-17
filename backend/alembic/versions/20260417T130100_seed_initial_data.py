"""seed initial data

Revision ID: 20260417T130100
Revises: 20260417T130000
Create Date: 2026-04-17 13:01:00.000000

"""
import os
import uuid
from typing import Sequence, Union

import bcrypt
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260417T130100"
down_revision: Union[str, Sequence[str], None] = "20260417T130000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Admin credentials — configurable via env vars
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@inframanager.local")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@1234")
ADMIN_FULL_NAME = "System Administrator"


def _hash_password(password: str) -> str:
    """Hash password with bcrypt, matching app.auth.get_password_hash."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def upgrade() -> None:
    """Seed default superuser and platform settings."""

    # --- Superuser ---
    admin_id = str(uuid.uuid4())
    hashed_pw = _hash_password(ADMIN_PASSWORD)

    op.execute(
        f"""
        INSERT INTO users (id, email, hashed_password, full_name, is_active, is_superuser, totp_enabled)
        SELECT '{admin_id}', '{ADMIN_EMAIL}', '{hashed_pw}', '{ADMIN_FULL_NAME}', true, true, false
        WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = '{ADMIN_EMAIL}')
        """
    )

    # --- Default settings ---
    settings = [
        ("app_name", "InfraManager", "Global Application Name"),
        ("theme", "dark", "Default UI Theme (dark/light)"),
        ("admin_email", "admin@inframanager", "Admin Contact Email"),
        ("admin_name", "DevOps Admin", "Admin Display Name"),
    ]
    for key, value, description in settings:
        op.execute(
            f"""
            INSERT INTO settings (key, value, description)
            SELECT '{key}', '{value}', '{description}'
            WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = '{key}')
            """
        )


def downgrade() -> None:
    """No downgrade — seed data deletion is too destructive."""
    pass
