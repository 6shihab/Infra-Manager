"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migration001 = migration001;
function migration001(db) {
    // Sync queue for pending offline mutations
    db.run(`
        CREATE TABLE IF NOT EXISTS _sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            method TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            body TEXT,
            temp_id TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            retry_count INTEGER DEFAULT 0,
            synced_at TEXT
        );
    `);
    // Cached user session (singleton)
    db.run(`
        CREATE TABLE IF NOT EXISTS _cached_session (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            user_id TEXT NOT NULL,
            email TEXT NOT NULL,
            full_name TEXT,
            is_superuser INTEGER NOT NULL DEFAULT 0,
            totp_enabled INTEGER NOT NULL DEFAULT 0,
            token TEXT NOT NULL,
            cached_at TEXT NOT NULL
        );
    `);
    // Users
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            full_name TEXT,
            is_active INTEGER DEFAULT 1,
            is_superuser INTEGER DEFAULT 0,
            totp_enabled INTEGER DEFAULT 0
        );
    `);
    // Groups
    db.run(`
        CREATE TABLE IF NOT EXISTS groups_ (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT
        );
    `);
    // User-Group link
    db.run(`
        CREATE TABLE IF NOT EXISTS user_group_link (
            user_id TEXT NOT NULL,
            group_id TEXT NOT NULL,
            PRIMARY KEY (user_id, group_id)
        );
    `);
    // Projects
    db.run(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            primary_domain TEXT,
            environment TEXT DEFAULT 'Dev',
            deployment_note TEXT,
            is_online INTEGER,
            last_checked_at TEXT,
            is_deleted INTEGER DEFAULT 0,
            deleted_at TEXT,
            created_by TEXT,
            server_count INTEGER DEFAULT 0,
            database_count INTEGER DEFAULT 0,
            current_user_role TEXT,
            _is_local INTEGER DEFAULT 0,
            _local_updated_at TEXT
        );
    `);
    // Servers
    db.run(`
        CREATE TABLE IF NOT EXISTS servers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            ip_address TEXT NOT NULL,
            os TEXT,
            region TEXT,
            username TEXT,
            password TEXT,
            ssh_key TEXT,
            is_online INTEGER,
            last_checked_at TEXT,
            is_deleted INTEGER DEFAULT 0,
            deleted_at TEXT,
            created_by TEXT,
            can_edit INTEGER DEFAULT 0,
            can_delete INTEGER DEFAULT 0,
            _is_local INTEGER DEFAULT 0,
            _local_updated_at TEXT
        );
    `);
    // Database engines
    db.run(`
        CREATE TABLE IF NOT EXISTS database_engines (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            engine TEXT NOT NULL,
            host TEXT NOT NULL,
            port INTEGER,
            connection_string_format TEXT,
            username TEXT,
            password TEXT,
            is_deleted INTEGER DEFAULT 0,
            deleted_at TEXT,
            created_by TEXT,
            can_edit INTEGER DEFAULT 0,
            can_delete INTEGER DEFAULT 0,
            _is_local INTEGER DEFAULT 0,
            _local_updated_at TEXT
        );
    `);
    // Components
    db.run(`
        CREATE TABLE IF NOT EXISTS components (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            custom_fields TEXT DEFAULT '{}',
            project_id TEXT NOT NULL,
            is_deleted INTEGER DEFAULT 0,
            deleted_at TEXT,
            _is_local INTEGER DEFAULT 0,
            _local_updated_at TEXT
        );
    `);
    // Project-Server link (with optional credential overrides)
    db.run(`
        CREATE TABLE IF NOT EXISTS project_server (
            project_id TEXT NOT NULL,
            server_id TEXT NOT NULL,
            username TEXT,
            password TEXT,
            ssh_key TEXT,
            PRIMARY KEY (project_id, server_id)
        );
    `);
    // Project-Database link
    db.run(`
        CREATE TABLE IF NOT EXISTS project_database (
            project_id TEXT NOT NULL,
            database_engine_id TEXT NOT NULL,
            db_name TEXT NOT NULL DEFAULT '',
            username TEXT,
            password TEXT,
            PRIMARY KEY (project_id, database_engine_id)
        );
    `);
    // Project-Group access
    db.run(`
        CREATE TABLE IF NOT EXISTS project_group_access (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            group_id TEXT NOT NULL,
            access_level TEXT DEFAULT 'Viewer'
        );
    `);
    // Project-User access
    db.run(`
        CREATE TABLE IF NOT EXISTS project_user_access (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            access_level TEXT DEFAULT 'Viewer'
        );
    `);
    // Settings
    db.run(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            description TEXT
        );
    `);
    // Sync log
    db.run(`
        CREATE TABLE IF NOT EXISTS _sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            level TEXT NOT NULL DEFAULT 'info',
            message TEXT NOT NULL
        );
    `);
}
