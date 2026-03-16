import { Database } from 'sql.js';

export function migration005(db: Database): void {
    db.run(`ALTER TABLE users ADD COLUMN has_passkeys INTEGER NOT NULL DEFAULT 0;`);

    // Also add to cached session
    db.run(`ALTER TABLE _cached_session ADD COLUMN has_passkeys INTEGER NOT NULL DEFAULT 0;`);
}
