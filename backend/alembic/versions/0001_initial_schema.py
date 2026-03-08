"""Initial schema - all tables

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-03-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001_initial_schema'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Enums ---
    # SQLAlchemy sends the enum .name (not .value) to PostgreSQL for native enum types.
    # EnvironmentEnum: dev='Dev', staging='Staging', prod='Prod'  → DB stores name: dev, staging, prod
    # AccessLevelEnum: VIEWER='Viewer', EDITOR='Editor', ADMIN='Admin' → DB stores name: VIEWER, EDITOR, ADMIN
    environment_enum = sa.Enum('dev', 'staging', 'prod', name='environmentenum')
    access_level_enum = sa.Enum('VIEWER', 'EDITOR', 'ADMIN', name='accesslevelenum')

    # 1. users
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('full_name', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_superuser', sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    # 2. groups
    op.create_table(
        'groups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_groups_id'), 'groups', ['id'], unique=False)
    op.create_index(op.f('ix_groups_name'), 'groups', ['name'], unique=True)

    # 3. user_group_link (association table)
    op.create_table(
        'user_group_link',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'group_id'),
    )

    # 4. projects
    op.create_table(
        'projects',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('primary_domain', sa.String(), nullable=True),
        sa.Column('environment', environment_enum, nullable=True),
        sa.Column('is_online', sa.Boolean(), nullable=True),
        sa.Column('last_checked_at', sa.DateTime(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_projects_id'), 'projects', ['id'], unique=False)
    op.create_index(op.f('ix_projects_name'), 'projects', ['name'], unique=False)
    op.create_index(op.f('ix_projects_is_deleted'), 'projects', ['is_deleted'], unique=False)

    # 5. project_group_access
    op.create_table(
        'project_group_access',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('access_level', access_level_enum, nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_project_group_access_id'), 'project_group_access', ['id'], unique=False)

    # 6. servers
    op.create_table(
        'servers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('ip_address', sa.String(), nullable=False),
        sa.Column('os', sa.String(), nullable=True),
        sa.Column('region', sa.String(), nullable=True),
        sa.Column('is_online', sa.Boolean(), nullable=True),
        sa.Column('last_checked_at', sa.DateTime(), nullable=True),
        sa.Column('username', sa.String(), nullable=True),
        sa.Column('password', sa.String(), nullable=True),
        sa.Column('ssh_key', sa.String(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_servers_id'), 'servers', ['id'], unique=False)
    op.create_index(op.f('ix_servers_name'), 'servers', ['name'], unique=False)
    op.create_index(op.f('ix_servers_is_deleted'), 'servers', ['is_deleted'], unique=False)

    # 7. project_server (association table with extra fields)
    op.create_table(
        'project_server',
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('server_id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(), nullable=True),
        sa.Column('password', sa.String(), nullable=True),
        sa.Column('ssh_key', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['server_id'], ['servers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('project_id', 'server_id'),
    )

    # 8. database_engines
    op.create_table(
        'database_engines',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('engine', sa.String(), nullable=False),
        sa.Column('host', sa.String(), nullable=False),
        sa.Column('port', sa.Integer(), nullable=True),
        sa.Column('connection_string_format', sa.String(), nullable=True),
        sa.Column('username', sa.String(), nullable=True),
        sa.Column('password', sa.String(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_database_engines_id'), 'database_engines', ['id'], unique=False)
    op.create_index(op.f('ix_database_engines_name'), 'database_engines', ['name'], unique=False)
    op.create_index(op.f('ix_database_engines_is_deleted'), 'database_engines', ['is_deleted'], unique=False)

    # 9. project_database (association table with extra fields)
    op.create_table(
        'project_database',
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('database_engine_id', sa.Integer(), nullable=False),
        sa.Column('db_name', sa.String(), nullable=False),
        sa.Column('username', sa.String(), nullable=True),
        sa.Column('password', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['database_engine_id'], ['database_engines.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('project_id', 'database_engine_id'),
    )

    # 10. components
    op.create_table(
        'components',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('custom_fields', sa.JSON(), nullable=True),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_components_id'), 'components', ['id'], unique=False)
    op.create_index(op.f('ix_components_is_deleted'), 'components', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_components_project_id'), 'components', ['project_id'], unique=False)

    # 11. audit_logs
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('resource_type', sa.String(), nullable=False),
        sa.Column('resource_name', sa.String(), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_audit_logs_id'), 'audit_logs', ['id'], unique=False)
    op.create_index(op.f('ix_audit_logs_action'), 'audit_logs', ['action'], unique=False)
    op.create_index(op.f('ix_audit_logs_resource_type'), 'audit_logs', ['resource_type'], unique=False)
    op.create_index(op.f('ix_audit_logs_user_id'), 'audit_logs', ['user_id'], unique=False)

    # 12. token_blocklist
    op.create_table(
        'token_blocklist',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_token_blocklist_id'), 'token_blocklist', ['id'], unique=False)
    op.create_index(op.f('ix_token_blocklist_token'), 'token_blocklist', ['token'], unique=True)

    # 13. settings
    op.create_table(
        'settings',
        sa.Column('key', sa.String(), nullable=False),
        sa.Column('value', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('key'),
    )
    op.create_index(op.f('ix_settings_key'), 'settings', ['key'], unique=False)


def downgrade() -> None:
    op.drop_table('settings')
    op.drop_table('token_blocklist')
    op.drop_table('audit_logs')
    op.drop_table('components')
    op.drop_table('project_database')
    op.drop_table('database_engines')
    op.drop_table('project_server')
    op.drop_table('servers')
    op.drop_table('project_group_access')
    op.drop_table('projects')
    op.drop_table('user_group_link')
    op.drop_table('groups')
    op.drop_table('users')
    sa.Enum(name='environmentenum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='accesslevelenum').drop(op.get_bind(), checkfirst=True)
