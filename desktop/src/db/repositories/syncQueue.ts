import { Database } from 'sql.js';
import { saveDb } from '../index';

export interface SyncQueueEntry {
    id: number;
    created_at: string;
    method: string;
    endpoint: string;
    body: string | null;
    temp_id: string | null;
    status: string;
    error_message: string | null;
    retry_count: number;
    synced_at: string | null;
}

export function enqueue(db: Database, method: string, endpoint: string, body?: any, tempId?: string): void {
    db.run(
        `INSERT INTO _sync_queue (method, endpoint, body, temp_id, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', datetime('now'))`,
        [method, endpoint, body ? JSON.stringify(body) : null, tempId || null]
    );
    saveDb();
}

export function getPending(db: Database): SyncQueueEntry[] {
    const result = db.exec("SELECT id, created_at, method, endpoint, body, temp_id, status, error_message, retry_count, synced_at FROM _sync_queue WHERE status = 'pending' ORDER BY id ASC");
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
        id: row[0] as number,
        created_at: row[1] as string,
        method: row[2] as string,
        endpoint: row[3] as string,
        body: row[4] as string | null,
        temp_id: row[5] as string | null,
        status: row[6] as string,
        error_message: row[7] as string | null,
        retry_count: row[8] as number,
        synced_at: row[9] as string | null,
    }));
}

export function markSyncing(db: Database, id: number): void {
    db.run("UPDATE _sync_queue SET status = 'syncing' WHERE id = ?", [id]);
    saveDb();
}

export function markDone(db: Database, id: number): void {
    db.run("UPDATE _sync_queue SET status = 'done', synced_at = datetime('now') WHERE id = ?", [id]);
    saveDb();
}

export function markFailed(db: Database, id: number, errorMessage: string): void {
    db.run("UPDATE _sync_queue SET status = 'failed', error_message = ?, retry_count = retry_count + 1 WHERE id = ?", [errorMessage, id]);
    saveDb();
}

export function markPendingRetry(db: Database, id: number): void {
    db.run("UPDATE _sync_queue SET status = 'pending', retry_count = retry_count + 1 WHERE id = ?", [id]);
    saveDb();
}

export function getPendingCount(db: Database): number {
    const result = db.exec("SELECT COUNT(*) FROM _sync_queue WHERE status IN ('pending', 'syncing')");
    if (result.length === 0 || result[0].values.length === 0) return 0;
    return result[0].values[0][0] as number;
}

export function hasPendingForResource(db: Database, endpoint: string): boolean {
    // Use exact prefix match followed by end-of-string or '/' to avoid false positives
    // e.g. endpoint="/projects/abc" matches "/projects/abc" and "/projects/abc/servers" but NOT "/projects/abcdef"
    const result = db.exec(
        "SELECT COUNT(*) FROM _sync_queue WHERE status IN ('pending', 'syncing') AND (endpoint = ? OR endpoint LIKE ?)",
        [endpoint, endpoint + '/%']
    );
    if (result.length === 0 || result[0].values.length === 0) return false;
    return (result[0].values[0][0] as number) > 0;
}

/** ID-bearing keys in request bodies that should be remapped */
const ID_KEYS = new Set([
    'id', 'project_id', 'server_id', 'database_engine_id', 'user_id', 'group_id',
]);

/** Replace tempId with realId only in path segments (split by '/'), not substrings */
function remapEndpointSegments(endpoint: string, tempId: string, realId: string): string {
    return endpoint.split('/').map(seg => seg === tempId ? realId : seg).join('/');
}

/** Replace tempId with realId only in known ID fields of a parsed JSON body */
function remapBodyIdFields(body: any, tempId: string, realId: string): any {
    if (body === null || body === undefined) return body;
    if (typeof body === 'string') return body === tempId ? realId : body;
    if (Array.isArray(body)) return body.map(item => remapBodyIdFields(item, tempId, realId));
    if (typeof body === 'object') {
        const result: any = {};
        for (const [k, v] of Object.entries(body)) {
            if (ID_KEYS.has(k) && v === tempId) {
                result[k] = realId;
            } else {
                result[k] = v;
            }
        }
        return result;
    }
    return body;
}

export function remapTempId(db: Database, tempId: string, realId: string): void {
    // Update sync queue entries that reference this temp ID in their body or endpoint
    const pending = db.exec("SELECT id, endpoint, body FROM _sync_queue WHERE status = 'pending'");
    if (pending.length === 0) return;
    for (const row of pending[0].values) {
        const entryId = row[0] as number;
        let endpoint = row[1] as string;
        let body = row[2] as string | null;
        let changed = false;

        if (endpoint.includes(tempId)) {
            const remapped = remapEndpointSegments(endpoint, tempId, realId);
            if (remapped !== endpoint) {
                endpoint = remapped;
                changed = true;
            }
        }
        if (body && body.includes(tempId)) {
            try {
                const parsed = JSON.parse(body);
                const remapped = remapBodyIdFields(parsed, tempId, realId);
                const newBody = JSON.stringify(remapped);
                if (newBody !== body) {
                    body = newBody;
                    changed = true;
                }
            } catch {
                // If body isn't valid JSON, skip remapping to avoid corruption
            }
        }
        if (changed) {
            db.run('UPDATE _sync_queue SET endpoint = ?, body = ? WHERE id = ?', [endpoint, body, entryId]);
        }
    }
    saveDb();
}

export function cleanCompleted(db: Database): void {
    db.run("DELETE FROM _sync_queue WHERE status = 'done'");
    saveDb();
}
