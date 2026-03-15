"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migration002 = migration002;
function migration002(db) {
    db.run(`
        CREATE TABLE IF NOT EXISTS _sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            level TEXT NOT NULL DEFAULT 'info',
            message TEXT NOT NULL
        );
    `);
}
