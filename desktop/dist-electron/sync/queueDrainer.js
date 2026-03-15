"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueDrainer = void 0;
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const index_1 = require("../db/index");
const syncQueueRepo = __importStar(require("../db/repositories/syncQueue"));
const syncLogRepo = __importStar(require("../db/repositories/syncLog"));
const index_2 = require("../ipc/index");
const MAX_RETRIES = 5;
/** Make an HTTP request with the given method, endpoint, body, and authorization */
function httpRequest(baseUrl, method, endpoint, token, body) {
    return new Promise((resolve, reject) => {
        const fullUrl = `${baseUrl.replace(/\/+$/, '')}${endpoint}`;
        const parsed = new URL(fullUrl);
        const lib = parsed.protocol === 'https:' ? https : http;
        const bodyStr = body ? JSON.stringify(body) : null;
        const req = lib.request({
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            method: method,
            timeout: 15000,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
            },
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode || 500, data: parsed });
                }
                catch {
                    resolve({ status: res.statusCode || 500, data: { raw: data } });
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        if (bodyStr)
            req.write(bodyStr);
        req.end();
    });
}
class QueueDrainer {
    apiUrl;
    token;
    isDraining = false;
    constructor(apiUrl, token) {
        this.apiUrl = apiUrl;
        this.token = token;
    }
    updateCredentials(apiUrl, token) {
        this.apiUrl = apiUrl;
        this.token = token;
    }
    async drain(db) {
        if (this.isDraining)
            return { success: true, authFailed: false };
        this.isDraining = true;
        try {
            const entries = syncQueueRepo.getPending(db);
            if (entries.length === 0) {
                return { success: true, authFailed: false };
            }
            syncLogRepo.addLog(db, 'info', `Draining ${entries.length} pending queue entries...`);
            const tempIdMap = new Map();
            let synced = 0;
            for (const entry of entries) {
                syncQueueRepo.markSyncing(db, entry.id);
                // Remap any temp IDs in endpoint and body
                let endpoint = entry.endpoint;
                let body = entry.body ? JSON.parse(entry.body) : undefined;
                for (const [tempId, realId] of tempIdMap) {
                    endpoint = endpoint.split(tempId).join(realId);
                    if (body) {
                        const bodyStr = JSON.stringify(body).split(tempId).join(realId);
                        body = JSON.parse(bodyStr);
                    }
                }
                try {
                    const response = await httpRequest(this.apiUrl, entry.method, endpoint, this.token, body);
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
                        (0, index_2.notifyRenderer)('sync:progress', { synced, total: entries.length });
                    }
                    else if (response.status === 404 && entry.method === 'DELETE') {
                        // Resource already deleted on server — mark as done (idempotent)
                        syncQueueRepo.markDone(db, entry.id);
                        synced++;
                    }
                    else if (response.status === 400 || response.status === 409 || response.status === 422) {
                        // Client error — mark as failed permanently
                        const errMsg = response.data?.detail || JSON.stringify(response.data) || `HTTP ${response.status}`;
                        syncQueueRepo.markFailed(db, entry.id, errMsg);
                        syncLogRepo.addLog(db, 'warn', `Queue entry failed: ${entry.method} ${endpoint} — ${errMsg}`);
                    }
                    else {
                        // Server error — retry later
                        if (entry.retry_count >= MAX_RETRIES) {
                            syncQueueRepo.markFailed(db, entry.id, `Max retries exceeded. Last: HTTP ${response.status}`);
                        }
                        else {
                            syncQueueRepo.markPendingRetry(db, entry.id);
                        }
                    }
                }
                catch (err) {
                    // Network error — retry later
                    if (entry.retry_count >= MAX_RETRIES) {
                        syncQueueRepo.markFailed(db, entry.id, `Max retries: ${err.message}`);
                    }
                    else {
                        syncQueueRepo.markPendingRetry(db, entry.id);
                    }
                    console.warn(`[QueueDrainer] Network error for entry ${entry.id}:`, err.message);
                }
            }
            // Clean completed entries
            syncQueueRepo.cleanCompleted(db);
            (0, index_1.saveDb)();
            syncLogRepo.addLog(db, 'info', `Queue drain completed: ${synced}/${entries.length} synced`);
            return { success: true, authFailed: false };
        }
        finally {
            this.isDraining = false;
        }
    }
    remapLocalId(db, tempId, realId, endpoint) {
        // Determine which table to update based on endpoint
        if (endpoint.startsWith('/projects/') && endpoint.includes('/servers')) {
            // Project-server link — no local ID remap needed (composite PK)
        }
        else if (endpoint.startsWith('/projects/') && endpoint.includes('/databases')) {
            // Project-database link — no local ID remap needed
        }
        else if (endpoint.startsWith('/projects')) {
            db.run('UPDATE projects SET id = ?, _is_local = 0 WHERE id = ?', [realId, tempId]);
            db.run('UPDATE project_server SET project_id = ? WHERE project_id = ?', [realId, tempId]);
            db.run('UPDATE project_database SET project_id = ? WHERE project_id = ?', [realId, tempId]);
            db.run('UPDATE components SET project_id = ? WHERE project_id = ?', [realId, tempId]);
            db.run('UPDATE project_group_access SET project_id = ? WHERE project_id = ?', [realId, tempId]);
            db.run('UPDATE project_user_access SET project_id = ? WHERE project_id = ?', [realId, tempId]);
        }
        else if (endpoint.startsWith('/servers')) {
            db.run('UPDATE servers SET id = ?, _is_local = 0 WHERE id = ?', [realId, tempId]);
            db.run('UPDATE project_server SET server_id = ? WHERE server_id = ?', [realId, tempId]);
        }
        else if (endpoint.startsWith('/databases')) {
            db.run('UPDATE database_engines SET id = ?, _is_local = 0 WHERE id = ?', [realId, tempId]);
            db.run('UPDATE project_database SET database_engine_id = ? WHERE database_engine_id = ?', [realId, tempId]);
        }
        else if (endpoint.startsWith('/components')) {
            db.run('UPDATE components SET id = ?, _is_local = 0 WHERE id = ?', [realId, tempId]);
        }
        (0, index_1.saveDb)();
    }
}
exports.QueueDrainer = QueueDrainer;
