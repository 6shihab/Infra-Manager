import { Database } from 'sql.js';
import { saveDb } from '../index';

export interface SyncLogEntry {
    id: number;
    timestamp: string;
    level: string;
    message: string;
}

export function addLog(db: Database, level: 'info' | 'warn' | 'error', message: string): void {
    db.run(
        "INSERT INTO _sync_log (timestamp, level, message) VALUES (datetime('now'), ?, ?)",
        [level, message]
    );
    // Prune old logs (keep last 200)
    db.run("DELETE FROM _sync_log WHERE id NOT IN (SELECT id FROM _sync_log ORDER BY id DESC LIMIT 200)");
}

export function getRecentLogs(db: Database, limit: number = 50): SyncLogEntry[] {
    const result = db.exec('SELECT id, timestamp, level, message FROM _sync_log ORDER BY id DESC LIMIT ?', [limit]);
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
        id: row[0] as number,
        timestamp: row[1] as string,
        level: row[2] as string,
        message: row[3] as string,
    }));
}

export function clearLogs(db: Database): void {
    db.run('DELETE FROM _sync_log');
    saveDb();
}
