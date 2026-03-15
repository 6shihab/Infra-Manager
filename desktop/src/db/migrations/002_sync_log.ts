import { Database } from 'sql.js';

export function migration002(db: Database): void {
    db.run(`
        CREATE TABLE IF NOT EXISTS _sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            level TEXT NOT NULL DEFAULT 'info',
            message TEXT NOT NULL
        );
    `);
}
