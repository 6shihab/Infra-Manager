import { Database } from 'sql.js';
import * as https from 'https';
import * as http from 'http';
import { saveDb } from '../db/index';
import * as syncQueueRepo from '../db/repositories/syncQueue';
import * as syncLogRepo from '../db/repositories/syncLog';
import { notifyRenderer } from '../ipc/index';

const MAX_RETRIES = 5;

/** Make an HTTP request with the given method, endpoint, body, and authorization */
function httpRequest(baseUrl: string, method: string, endpoint: string, token: string, body?: any, extraHeaders?: Record<string, string>): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
        const fullUrl = `${baseUrl.replace(/\/+$/, '')}${endpoint}`;
        const parsed = new URL(fullUrl);
        const lib = parsed.protocol === 'https:' ? https : http;
        const bodyStr = body ? JSON.stringify(body) : null;

        const req = lib.request(
            {
                hostname: parsed.hostname,
                port: parsed.port,
                path: parsed.pathname + parsed.search,
                method: method,
                timeout: 15000,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
                    ...(extraHeaders || {}),
                },
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = data ? JSON.parse(data) : {};
                        resolve({ status: res.statusCode || 500, data: parsed });
                    } catch {
                        resolve({ status: res.statusCode || 500, data: { raw: data } });
                    }
                });
            }
        );
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

export class QueueDrainer {
    private apiUrl: string;
    private token: string;
    private isDraining = false;

    constructor(apiUrl: string, token: string) {
        this.apiUrl = apiUrl;
        this.token = token;
    }

    updateCredentials(apiUrl: string, token: string): void {
        this.apiUrl = apiUrl;
        this.token = token;
    }

    async drain(db: Database): Promise<{ success: boolean; authFailed: boolean }> {
        if (this.isDraining) return { success: true, authFailed: false };
        this.isDraining = true;

        try {
            const entries = syncQueueRepo.getPending(db);
            if (entries.length === 0) {
                return { success: true, authFailed: false };
            }

            syncLogRepo.addLog(db, 'info', `Draining ${entries.length} pending queue entries...`);
            const tempIdMap = new Map<string, string>();
            let synced = 0;

            for (const entry of entries) {
                syncQueueRepo.markSyncing(db, entry.id);

                // Remap any temp IDs in endpoint and body (segment-safe replacement)
                let endpoint = entry.endpoint;
                let body = entry.body ? JSON.parse(entry.body) : undefined;

                for (const [tempId, realId] of tempIdMap) {
                    // Replace only exact path segments, not substrings
                    endpoint = endpoint.split('/').map((seg: string) => seg === tempId ? realId : seg).join('/');
                    if (body) {
                        // Replace only known ID fields in the body
                        const ID_KEYS = ['id', 'project_id', 'server_id', 'database_engine_id', 'user_id', 'group_id'];
                        if (typeof body === 'object' && !Array.isArray(body)) {
                            for (const key of ID_KEYS) {
                                if (body[key] === tempId) {
                                    body[key] = realId;
                                }
                            }
                        }
                    }
                }

                try {
                    // Attach idempotency key for POST requests to prevent duplicates on retry
                    const extraHeaders: Record<string, string> = {};
                    if (entry.idempotency_key && entry.method.toUpperCase() === 'POST') {
                        extraHeaders['X-Idempotency-Key'] = entry.idempotency_key;
                    }
                    const response = await httpRequest(this.apiUrl, entry.method, endpoint, this.token, body, extraHeaders);

                    if (response.status === 401) {
                        // Auth failed — stop draining
                        syncQueueRepo.markPendingRetry(db, entry.id);
                        syncLogRepo.addLog(db, 'error', 'Queue drain stopped: authentication failed');
                        return { success: false, authFailed: true };
                    }

                    if (response.status >= 200 && response.status < 300) {
                        // Success
                        if (entry.method === 'POST' && entry.temp_id && response.data?.id) {
                            const realId = response.data.id;
                            tempIdMap.set(entry.temp_id, realId);

                            // Remap in local SQLite tables
                            this.remapLocalId(db, entry.temp_id, realId, entry.endpoint);

                            // Remap in subsequent queue entries
                            syncQueueRepo.remapTempId(db, entry.temp_id, realId);
                        }
                        syncQueueRepo.markDone(db, entry.id);
                        synced++;
                        notifyRenderer('sync:progress', { synced, total: entries.length });
                    } else if (response.status === 404 && entry.method === 'DELETE') {
                        // Resource already deleted on server — mark as done (idempotent)
                        syncQueueRepo.markDone(db, entry.id);
                        synced++;
                    } else if (response.status === 400 || response.status === 409 || response.status === 422) {
                        // Client error — mark as failed permanently
                        const errMsg = response.data?.detail || JSON.stringify(response.data) || `HTTP ${response.status}`;
                        syncQueueRepo.markFailed(db, entry.id, errMsg);
                        syncLogRepo.addLog(db, 'warn', `Queue entry failed: ${entry.method} ${endpoint} — ${errMsg}`);
                    } else {
                        // Server error — retry later
                        if (entry.retry_count >= MAX_RETRIES) {
                            syncQueueRepo.markFailed(db, entry.id, `Max retries exceeded. Last: HTTP ${response.status}`);
                        } else {
                            syncQueueRepo.markPendingRetry(db, entry.id);
                        }
                    }
                } catch (err: any) {
                    // Network error — retry later
                    if (entry.retry_count >= MAX_RETRIES) {
                        syncQueueRepo.markFailed(db, entry.id, `Max retries: ${err.message}`);
                    } else {
                        syncQueueRepo.markPendingRetry(db, entry.id);
                    }
                    console.warn(`[QueueDrainer] Network error for entry ${entry.id}:`, err.message);
                }
            }

            // Clean completed entries
            syncQueueRepo.cleanCompleted(db);
            saveDb();

            syncLogRepo.addLog(db, 'info', `Queue drain completed: ${synced}/${entries.length} synced`);
            return { success: true, authFailed: false };
        } finally {
            this.isDraining = false;
        }
    }

    private remapLocalId(db: Database, tempId: string, realId: string, endpoint: string): void {
        // Determine which table to update based on endpoint
        if (endpoint.startsWith('/projects/') && endpoint.includes('/servers')) {
            // Project-server link — no local ID remap needed (composite PK)
        } else if (endpoint.startsWith('/projects/') && endpoint.includes('/databases')) {
            // Project-database link — no local ID remap needed
        } else if (endpoint.startsWith('/projects')) {
            db.run('UPDATE projects SET id = ?, _is_local = 0 WHERE id = ?', [realId, tempId]);
            db.run('UPDATE project_server SET project_id = ? WHERE project_id = ?', [realId, tempId]);
            db.run('UPDATE project_database SET project_id = ? WHERE project_id = ?', [realId, tempId]);
            db.run('UPDATE components SET project_id = ? WHERE project_id = ?', [realId, tempId]);
            db.run('UPDATE project_group_access SET project_id = ? WHERE project_id = ?', [realId, tempId]);
            db.run('UPDATE project_user_access SET project_id = ? WHERE project_id = ?', [realId, tempId]);
        } else if (endpoint.startsWith('/servers')) {
            db.run('UPDATE servers SET id = ?, _is_local = 0 WHERE id = ?', [realId, tempId]);
            db.run('UPDATE project_server SET server_id = ? WHERE server_id = ?', [realId, tempId]);
        } else if (endpoint.startsWith('/databases')) {
            db.run('UPDATE database_engines SET id = ?, _is_local = 0 WHERE id = ?', [realId, tempId]);
            db.run('UPDATE project_database SET database_engine_id = ? WHERE database_engine_id = ?', [realId, tempId]);
        } else if (endpoint.startsWith('/components')) {
            db.run('UPDATE components SET id = ?, _is_local = 0 WHERE id = ?', [realId, tempId]);
        }
        saveDb();
    }
}
