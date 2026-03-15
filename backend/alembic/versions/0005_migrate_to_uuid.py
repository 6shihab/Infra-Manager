"""Migrate all integer PKs and FKs to UUID v4

Revision ID: 0005_migrate_to_uuid
Revises: 0004_add_deployment_note
Create Date: 2026-03-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID

revision: str = '0005_migrate_to_uuid'
down_revision: Union[str, None] = '0004_add_deployment_note'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Enable uuid-ossp extension ──
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    # ══════════════════════════════════════════════════════════════
    # PHASE A: Add new UUID columns and backfill values
    # ══════════════════════════════════════════════════════════════

    # --- Parent tables: add uuid_id PKs ---
    for table in ['users', 'groups', 'projects', 'servers', 'database_engines',
                  'components', 'audit_logs', 'token_blocklist',
                  'project_group_access', 'project_user_access']:
        op.add_column(table, sa.Column('uuid_id', PgUUID(as_uuid=True),
                                       server_default=sa.text('uuid_generate_v4()')))
        op.execute(f"UPDATE {table} SET uuid_id = uuid_generate_v4() WHERE uuid_id IS NULL")

    # --- FK columns on parent tables ---
    # projects.created_by -> users.id
    op.add_column('projects', sa.Column('uuid_created_by', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE projects SET uuid_created_by = u.uuid_id FROM users u WHERE projects.created_by = u.id")

    # servers.created_by -> users.id
    op.add_column('servers', sa.Column('uuid_created_by', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE servers SET uuid_created_by = u.uuid_id FROM users u WHERE servers.created_by = u.id")

    # database_engines.created_by -> users.id
    op.add_column('database_engines', sa.Column('uuid_created_by', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE database_engines SET uuid_created_by = u.uuid_id FROM users u WHERE database_engines.created_by = u.id")

    # components.project_id -> projects.id
    op.add_column('components', sa.Column('uuid_project_id', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE components SET uuid_project_id = p.uuid_id FROM projects p WHERE components.project_id = p.id")

    # audit_logs.user_id -> users.id
    op.add_column('audit_logs', sa.Column('uuid_user_id', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE audit_logs SET uuid_user_id = u.uuid_id FROM users u WHERE audit_logs.user_id = u.id")

    # --- Junction table FK columns ---
    # project_group_access
    op.add_column('project_group_access', sa.Column('uuid_project_id', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE project_group_access SET uuid_project_id = p.uuid_id FROM projects p WHERE project_group_access.project_id = p.id")
    op.add_column('project_group_access', sa.Column('uuid_group_id', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE project_group_access SET uuid_group_id = g.uuid_id FROM groups g WHERE project_group_access.group_id = g.id")

    # project_user_access
    op.add_column('project_user_access', sa.Column('uuid_project_id', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE project_user_access SET uuid_project_id = p.uuid_id FROM projects p WHERE project_user_access.project_id = p.id")
    op.add_column('project_user_access', sa.Column('uuid_user_id', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE project_user_access SET uuid_user_id = u.uuid_id FROM users u WHERE project_user_access.user_id = u.id")

    # user_group_link
    op.add_column('user_group_link', sa.Column('uuid_user_id', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE user_group_link SET uuid_user_id = u.uuid_id FROM users u WHERE user_group_link.user_id = u.id")
    op.add_column('user_group_link', sa.Column('uuid_group_id', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE user_group_link SET uuid_group_id = g.uuid_id FROM groups g WHERE user_group_link.group_id = g.id")

    # project_server
    op.add_column('project_server', sa.Column('uuid_project_id', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE project_server SET uuid_project_id = p.uuid_id FROM projects p WHERE project_server.project_id = p.id")
    op.add_column('project_server', sa.Column('uuid_server_id', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE project_server SET uuid_server_id = s.uuid_id FROM servers s WHERE project_server.server_id = s.id")

    # project_database
    op.add_column('project_database', sa.Column('uuid_project_id', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE project_database SET uuid_project_id = p.uuid_id FROM projects p WHERE project_database.project_id = p.id")
    op.add_column('project_database', sa.Column('uuid_database_engine_id', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE project_database SET uuid_database_engine_id = d.uuid_id FROM database_engines d WHERE project_database.database_engine_id = d.id")

    # --- Also handle the legacy database_info table ---
    op.add_column('database_info', sa.Column('uuid_id', PgUUID(as_uuid=True),
                                              server_default=sa.text('uuid_generate_v4()')))
    op.execute("UPDATE database_info SET uuid_id = uuid_generate_v4() WHERE uuid_id IS NULL")
    op.add_column('database_info', sa.Column('uuid_project_id', PgUUID(as_uuid=True), nullable=True))
    op.execute("UPDATE database_info SET uuid_project_id = p.uuid_id FROM projects p WHERE database_info.project_id = p.id")

    # ══════════════════════════════════════════════════════════════
    # PHASE B: Drop old constraints/columns, rename UUID columns,
    #          recreate constraints. Process children first.
    # ══════════════════════════════════════════════════════════════

    # ── 1. user_group_link (composite PK, refs users + groups) ──
    op.drop_constraint('user_group_link_pkey', 'user_group_link', type_='primary')
    op.drop_constraint('user_group_link_user_id_fkey', 'user_group_link', type_='foreignkey')
    op.drop_constraint('user_group_link_group_id_fkey', 'user_group_link', type_='foreignkey')
    op.drop_column('user_group_link', 'user_id')
    op.drop_column('user_group_link', 'group_id')
    op.alter_column('user_group_link', 'uuid_user_id', new_column_name='user_id', nullable=False)
    op.alter_column('user_group_link', 'uuid_group_id', new_column_name='group_id', nullable=False)
    op.create_primary_key('user_group_link_pkey', 'user_group_link', ['user_id', 'group_id'])

    # ── 2. project_server (composite PK, refs projects + servers) ──
    op.drop_constraint('project_server_pkey', 'project_server', type_='primary')
    op.drop_constraint('project_server_project_id_fkey', 'project_server', type_='foreignkey')
    op.drop_constraint('project_server_server_id_fkey', 'project_server', type_='foreignkey')
    op.drop_column('project_server', 'project_id')
    op.drop_column('project_server', 'server_id')
    op.alter_column('project_server', 'uuid_project_id', new_column_name='project_id', nullable=False)
    op.alter_column('project_server', 'uuid_server_id', new_column_name='server_id', nullable=False)
    op.create_primary_key('project_server_pkey', 'project_server', ['project_id', 'server_id'])

    # ── 3. project_database (composite PK, refs projects + database_engines) ──
    op.drop_constraint('project_database_pkey', 'project_database', type_='primary')
    op.drop_constraint('project_database_project_id_fkey', 'project_database', type_='foreignkey')
    op.drop_constraint('project_database_database_engine_id_fkey', 'project_database', type_='foreignkey')
    op.drop_column('project_database', 'project_id')
    op.drop_column('project_database', 'database_engine_id')
    op.alter_column('project_database', 'uuid_project_id', new_column_name='project_id', nullable=False)
    op.alter_column('project_database', 'uuid_database_engine_id', new_column_name='database_engine_id', nullable=False)
    op.create_primary_key('project_database_pkey', 'project_database', ['project_id', 'database_engine_id'])

    # ── 4. project_group_access (PK + 2 FKs) ──
    op.drop_constraint('project_group_access_pkey', 'project_group_access', type_='primary')
    op.drop_constraint('project_group_access_project_id_fkey', 'project_group_access', type_='foreignkey')
    op.drop_constraint('project_group_access_group_id_fkey', 'project_group_access', type_='foreignkey')
    op.drop_index('ix_project_group_access_id', 'project_group_access')
    op.drop_column('project_group_access', 'id')
    op.drop_column('project_group_access', 'project_id')
    op.drop_column('project_group_access', 'group_id')
    op.alter_column('project_group_access', 'uuid_id', new_column_name='id', nullable=False, server_default=None)
    op.alter_column('project_group_access', 'uuid_project_id', new_column_name='project_id', nullable=False)
    op.alter_column('project_group_access', 'uuid_group_id', new_column_name='group_id', nullable=False)
    op.create_primary_key('project_group_access_pkey', 'project_group_access', ['id'])
    op.create_index('ix_project_group_access_id', 'project_group_access', ['id'])

    # ── 5. project_user_access (PK + 2 FKs) ──
    op.drop_constraint('project_user_access_pkey', 'project_user_access', type_='primary')
    op.drop_constraint('project_user_access_project_id_fkey', 'project_user_access', type_='foreignkey')
    op.drop_constraint('project_user_access_user_id_fkey', 'project_user_access', type_='foreignkey')
    op.drop_index('ix_project_user_access_id', 'project_user_access')
    op.drop_column('project_user_access', 'id')
    op.drop_column('project_user_access', 'project_id')
    op.drop_column('project_user_access', 'user_id')
    op.alter_column('project_user_access', 'uuid_id', new_column_name='id', nullable=False, server_default=None)
    op.alter_column('project_user_access', 'uuid_project_id', new_column_name='project_id', nullable=False)
    op.alter_column('project_user_access', 'uuid_user_id', new_column_name='user_id', nullable=False)
    op.create_primary_key('project_user_access_pkey', 'project_user_access', ['id'])
    op.create_index('ix_project_user_access_id', 'project_user_access', ['id'])

    # ── 6. components (PK + project_id FK) ──
    op.drop_constraint('components_pkey', 'components', type_='primary')
    op.drop_constraint('components_project_id_fkey', 'components', type_='foreignkey')
    op.drop_index('ix_components_id', 'components')
    op.drop_index('ix_components_project_id', 'components')
    op.drop_column('components', 'id')
    op.drop_column('components', 'project_id')
    op.alter_column('components', 'uuid_id', new_column_name='id', nullable=False, server_default=None)
    op.alter_column('components', 'uuid_project_id', new_column_name='project_id', nullable=True)
    op.create_primary_key('components_pkey', 'components', ['id'])
    op.create_index('ix_components_id', 'components', ['id'])
    op.create_index('ix_components_project_id', 'components', ['project_id'])

    # ── 7. audit_logs (PK + user_id FK) ──
    op.drop_constraint('audit_logs_pkey', 'audit_logs', type_='primary')
    op.drop_constraint('audit_logs_user_id_fkey', 'audit_logs', type_='foreignkey')
    op.drop_index('ix_audit_logs_id', 'audit_logs')
    op.drop_index('ix_audit_logs_user_id', 'audit_logs')
    op.drop_column('audit_logs', 'id')
    op.drop_column('audit_logs', 'user_id')
    op.alter_column('audit_logs', 'uuid_id', new_column_name='id', nullable=False, server_default=None)
    op.alter_column('audit_logs', 'uuid_user_id', new_column_name='user_id', nullable=True)
    op.create_primary_key('audit_logs_pkey', 'audit_logs', ['id'])
    op.create_index('ix_audit_logs_id', 'audit_logs', ['id'])
    op.create_index('ix_audit_logs_user_id', 'audit_logs', ['user_id'])

    # ── 8. token_blocklist (PK only) ──
    op.drop_constraint('token_blocklist_pkey', 'token_blocklist', type_='primary')
    op.drop_index('ix_token_blocklist_id', 'token_blocklist')
    op.drop_column('token_blocklist', 'id')
    op.alter_column('token_blocklist', 'uuid_id', new_column_name='id', nullable=False, server_default=None)
    op.create_primary_key('token_blocklist_pkey', 'token_blocklist', ['id'])
    op.create_index('ix_token_blocklist_id', 'token_blocklist', ['id'])

    # ── 9. database_info (legacy table, PK + project_id FK) ──
    op.drop_constraint('database_info_pkey', 'database_info', type_='primary')
    op.drop_constraint('database_info_project_id_fkey', 'database_info', type_='foreignkey')
    op.drop_index('ix_database_info_id', 'database_info')
    op.drop_index('ix_database_info_project_id', 'database_info')
    op.drop_column('database_info', 'id')
    op.drop_column('database_info', 'project_id')
    op.alter_column('database_info', 'uuid_id', new_column_name='id', nullable=False, server_default=None)
    op.alter_column('database_info', 'uuid_project_id', new_column_name='project_id', nullable=True)
    op.create_primary_key('database_info_pkey', 'database_info', ['id'])
    op.create_index('ix_database_info_id', 'database_info', ['id'])
    op.create_index('ix_database_info_project_id', 'database_info', ['project_id'])

    # ── 10. projects (PK + created_by FK) ──
    op.drop_constraint('projects_pkey', 'projects', type_='primary')
    op.drop_constraint('projects_created_by_fkey', 'projects', type_='foreignkey')
    op.drop_index('ix_projects_id', 'projects')
    op.drop_column('projects', 'id')
    op.drop_column('projects', 'created_by')
    op.alter_column('projects', 'uuid_id', new_column_name='id', nullable=False, server_default=None)
    op.alter_column('projects', 'uuid_created_by', new_column_name='created_by', nullable=True)
    op.create_primary_key('projects_pkey', 'projects', ['id'])
    op.create_index('ix_projects_id', 'projects', ['id'])

    # ── 11. servers (PK + created_by FK) ──
    op.drop_constraint('servers_pkey', 'servers', type_='primary')
    op.drop_constraint('fk_servers_created_by_users', 'servers', type_='foreignkey')
    op.drop_index('ix_servers_id', 'servers')
    op.drop_column('servers', 'id')
    op.drop_column('servers', 'created_by')
    op.alter_column('servers', 'uuid_id', new_column_name='id', nullable=False, server_default=None)
    op.alter_column('servers', 'uuid_created_by', new_column_name='created_by', nullable=True)
    op.create_primary_key('servers_pkey', 'servers', ['id'])
    op.create_index('ix_servers_id', 'servers', ['id'])

    # ── 12. database_engines (PK + created_by FK) ──
    op.drop_constraint('database_engines_pkey', 'database_engines', type_='primary')
    op.drop_constraint('fk_database_engines_created_by_users', 'database_engines', type_='foreignkey')
    op.drop_index('ix_database_engines_id', 'database_engines')
    op.drop_column('database_engines', 'id')
    op.drop_column('database_engines', 'created_by')
    op.alter_column('database_engines', 'uuid_id', new_column_name='id', nullable=False, server_default=None)
    op.alter_column('database_engines', 'uuid_created_by', new_column_name='created_by', nullable=True)
    op.create_primary_key('database_engines_pkey', 'database_engines', ['id'])
    op.create_index('ix_database_engines_id', 'database_engines', ['id'])

    # ── 13. groups (PK only, no FKs on this table) ──
    op.drop_constraint('groups_pkey', 'groups', type_='primary')
    op.drop_index('ix_groups_id', 'groups')
    op.drop_column('groups', 'id')
    op.alter_column('groups', 'uuid_id', new_column_name='id', nullable=False, server_default=None)
    op.create_primary_key('groups_pkey', 'groups', ['id'])
    op.create_index('ix_groups_id', 'groups', ['id'])

    # ── 14. users (PK only, no FKs on this table) ──
    op.drop_constraint('users_pkey', 'users', type_='primary')
    op.drop_index('ix_users_id', 'users')
    op.drop_column('users', 'id')
    op.alter_column('users', 'uuid_id', new_column_name='id', nullable=False, server_default=None)
    op.create_primary_key('users_pkey', 'users', ['id'])
    op.create_index('ix_users_id', 'users', ['id'])

    # ══════════════════════════════════════════════════════════════
    # PHASE C: Recreate all FK constraints with UUID columns
    # ══════════════════════════════════════════════════════════════

    # user_group_link -> users, groups
    op.create_foreign_key('user_group_link_user_id_fkey', 'user_group_link', 'users',
                          ['user_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('user_group_link_group_id_fkey', 'user_group_link', 'groups',
                          ['group_id'], ['id'], ondelete='CASCADE')

    # project_server -> projects, servers
    op.create_foreign_key('project_server_project_id_fkey', 'project_server', 'projects',
                          ['project_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('project_server_server_id_fkey', 'project_server', 'servers',
                          ['server_id'], ['id'], ondelete='CASCADE')

    # project_database -> projects, database_engines
    op.create_foreign_key('project_database_project_id_fkey', 'project_database', 'projects',
                          ['project_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('project_database_database_engine_id_fkey', 'project_database', 'database_engines',
                          ['database_engine_id'], ['id'], ondelete='CASCADE')

    # project_group_access -> projects, groups
    op.create_foreign_key('project_group_access_project_id_fkey', 'project_group_access', 'projects',
                          ['project_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('project_group_access_group_id_fkey', 'project_group_access', 'groups',
                          ['group_id'], ['id'], ondelete='CASCADE')

    # project_user_access -> projects, users
    op.create_foreign_key('project_user_access_project_id_fkey', 'project_user_access', 'projects',
                          ['project_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('project_user_access_user_id_fkey', 'project_user_access', 'users',
                          ['user_id'], ['id'], ondelete='CASCADE')

    # projects.created_by -> users
    op.create_foreign_key('projects_created_by_fkey', 'projects', 'users',
                          ['created_by'], ['id'])

    # servers.created_by -> users
    op.create_foreign_key('fk_servers_created_by_users', 'servers', 'users',
                          ['created_by'], ['id'], ondelete='SET NULL')

    # database_engines.created_by -> users
    op.create_foreign_key('fk_database_engines_created_by_users', 'database_engines', 'users',
                          ['created_by'], ['id'], ondelete='SET NULL')

    # components.project_id -> projects
    op.create_foreign_key('components_project_id_fkey', 'components', 'projects',
                          ['project_id'], ['id'])

    # audit_logs.user_id -> users
    op.create_foreign_key('audit_logs_user_id_fkey', 'audit_logs', 'users',
                          ['user_id'], ['id'], ondelete='SET NULL')

    # database_info.project_id -> projects
    op.create_foreign_key('database_info_project_id_fkey', 'database_info', 'projects',
                          ['project_id'], ['id'])

    # ══════════════════════════════════════════════════════════════
    # PHASE D: Cleanup — drop orphaned sequences
    # ══════════════════════════════════════════════════════════════
    for seq in ['users_id_seq', 'groups_id_seq', 'projects_id_seq', 'servers_id_seq',
                'database_engines_id_seq', 'components_id_seq', 'audit_logs_id_seq',
                'token_blocklist_id_seq', 'project_group_access_id_seq',
                'project_user_access_id_seq', 'database_info_id_seq']:
        op.execute(f'DROP SEQUENCE IF EXISTS {seq} CASCADE')


def downgrade() -> None:
    raise NotImplementedError("UUID to integer migration is lossy and not reversible")
