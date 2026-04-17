"""initial schema

Revision ID: 20260417T130000
Revises:
Create Date: 2026-04-17 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260417T130000"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Enum definitions
environmentenum = postgresql.ENUM("Dev", "Staging", "Prod", name="environmentenum", create_type=False)
accesslevelenum = postgresql.ENUM("Viewer", "Editor", "Admin", name="accesslevelenum", create_type=False)
webhooktypeenum = postgresql.ENUM("slack", "teams", "generic", name="webhooktypeenum", create_type=False)


def upgrade() -> None:
    """Create all tables from scratch."""

    # --- Extensions ---
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    # --- Enums ---
    environmentenum.create(op.get_bind(), checkfirst=True)
    accesslevelenum.create(op.get_bind(), checkfirst=True)
    webhooktypeenum.create(op.get_bind(), checkfirst=True)

    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, index=True),
        sa.Column("keycloak_id", sa.String(), nullable=True, unique=True, index=True),
        sa.Column("email", sa.String(), nullable=False, unique=True, index=True),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("is_superuser", sa.Boolean(), default=False),
        sa.Column("totp_secret", sa.String(), nullable=True),
        sa.Column("totp_enabled", sa.Boolean(), default=False),
        sa.Column("totp_backup_codes", sa.JSON(), nullable=True),
    )

    # --- groups ---
    op.create_table(
        "groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, index=True),
        sa.Column("name", sa.String(), nullable=False, unique=True, index=True),
        sa.Column("description", sa.String(), nullable=True),
    )

    # --- settings ---
    op.create_table(
        "settings",
        sa.Column("key", sa.String(), primary_key=True, index=True),
        sa.Column("value", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
    )

    # --- token_blocklist ---
    op.create_table(
        "token_blocklist",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, index=True),
        sa.Column("jti", sa.String(), nullable=False, unique=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )

    # --- user_group_link ---
    op.create_table(
        "user_group_link",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True),
    )

    # --- project_folders ---
    op.create_table(
        "project_folders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("position", sa.Integer(), default=0),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("project_folders.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), default=False, index=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )

    # --- projects ---
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, index=True),
        sa.Column("name", sa.String(), nullable=False, index=True),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("primary_domain", sa.String(), nullable=True),
        sa.Column("environment", environmentenum, default="Dev"),
        sa.Column("deployment_note", sa.Text(), nullable=True),
        sa.Column("folder_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("project_folders.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("is_online", sa.Boolean(), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), default=False, index=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )

    # --- servers ---
    op.create_table(
        "servers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, index=True),
        sa.Column("name", sa.String(), nullable=False, index=True),
        sa.Column("ip_address", sa.String(), nullable=False),
        sa.Column("os", sa.String(), nullable=True),
        sa.Column("region", sa.String(), nullable=True),
        sa.Column("is_online", sa.Boolean(), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(), nullable=True),
        sa.Column("username", sa.String(), nullable=True),
        sa.Column("password", sa.String(), nullable=True),
        sa.Column("ssh_key", sa.String(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), default=False, index=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )

    # --- database_engines ---
    op.create_table(
        "database_engines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, index=True),
        sa.Column("name", sa.String(), nullable=False, index=True),
        sa.Column("engine", sa.String(), nullable=False),
        sa.Column("host", sa.String(), nullable=False),
        sa.Column("port", sa.Integer(), nullable=True),
        sa.Column("connection_string_format", sa.String(), nullable=True),
        sa.Column("username", sa.String(), nullable=True),
        sa.Column("password", sa.String(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), default=False, index=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )

    # --- project_server ---
    op.create_table(
        "project_server",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("server_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("servers.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("username", sa.String(), nullable=True),
        sa.Column("password", sa.String(), nullable=True),
        sa.Column("ssh_key", sa.String(), nullable=True),
    )

    # --- project_database ---
    op.create_table(
        "project_database",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("database_engine_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("database_engines.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("db_name", sa.String(), nullable=False),
        sa.Column("username", sa.String(), nullable=True),
        sa.Column("password", sa.String(), nullable=True),
    )

    # --- components ---
    op.create_table(
        "components",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, index=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("custom_fields", sa.JSON(), default={}),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True, index=True),
        sa.Column("is_deleted", sa.Boolean(), default=False, index=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )

    # --- project_group_access ---
    op.create_table(
        "project_group_access",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, index=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("access_level", accesslevelenum, nullable=False, server_default="Viewer"),
    )

    # --- project_user_access ---
    op.create_table(
        "project_user_access",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, index=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("access_level", accesslevelenum, nullable=False, server_default="Viewer"),
    )

    # --- audit_logs ---
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("action", sa.String(), nullable=False, index=True),
        sa.Column("resource_type", sa.String(), nullable=False, index=True),
        sa.Column("resource_name", sa.String(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=True, index=True),
    )

    # --- webauthn_credentials ---
    op.create_table(
        "webauthn_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("credential_id", sa.String(), nullable=False, unique=True, index=True),
        sa.Column("public_key", sa.String(), nullable=False),
        sa.Column("sign_count", sa.Integer(), default=0, nullable=False),
        sa.Column("transports", sa.JSON(), nullable=True),
        sa.Column("device_name", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )

    # --- webhooks ---
    op.create_table(
        "webhooks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, index=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("url", sa.String(2048), nullable=False),
        sa.Column("type", webhooktypeenum, nullable=False),
        sa.Column("events", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("secret", sa.String(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status_code", sa.Integer(), nullable=True),
        sa.Column("last_error", sa.String(500), nullable=True),
    )

    # --- webhook_projects ---
    op.create_table(
        "webhook_projects",
        sa.Column("webhook_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("webhooks.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade() -> None:
    """No downgrade — dropping the entire schema is too destructive for accidental rollback."""
    pass
