import { Database } from 'sql.js';

export function migration006(db: Database): void {
    db.run(`
        CREATE TABLE IF NOT EXISTS project_folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            position INTEGER DEFAULT 0,
            created_by TEXT,
            is_deleted INTEGER DEFAULT 0,
            deleted_at TEXT
        );
    `);

    db.run(`ALTER TABLE projects ADD COLUMN folder_id TEXT;`);
}
