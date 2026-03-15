"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const _001_initial_1 = require("./migrations/001_initial");
const migrations = [
    { version: 1, name: 'initial_schema', up: _001_initial_1.migration001 },
];
function runMigrations(db) {
    // Ensure _sync_meta table exists for tracking schema version
    db.run(`
        CREATE TABLE IF NOT EXISTS _sync_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);
    // Get current schema version
    const result = db.exec("SELECT value FROM _sync_meta WHERE key = 'schema_version'");
    let currentVersion = 0;
    if (result.length > 0 && result[0].values.length > 0) {
        currentVersion = parseInt(result[0].values[0][0], 10) || 0;
    }
    // Run pending migrations
    for (const migration of migrations) {
        if (migration.version > currentVersion) {
            console.log(`Running migration ${migration.version}: ${migration.name}`);
            db.run('BEGIN TRANSACTION;');
            try {
                migration.up(db);
                db.run("INSERT OR REPLACE INTO _sync_meta (key, value) VALUES ('schema_version', ?)", [String(migration.version)]);
                db.run('COMMIT;');
                console.log(`Migration ${migration.version} completed.`);
            }
            catch (err) {
                db.run('ROLLBACK;');
                console.error(`Migration ${migration.version} failed:`, err);
                throw err;
            }
        }
    }
}
