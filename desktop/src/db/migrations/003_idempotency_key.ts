import { Database } from 'sql.js';

export function migration003(db: Database): void {
    // Add idempotency_key column to sync queue for POST retry deduplication
    db.run(`ALTER TABLE _sync_queue ADD COLUMN idempotency_key TEXT`);
}
