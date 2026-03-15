"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueue = enqueue;
exports.getPending = getPending;
exports.markSyncing = markSyncing;
exports.markDone = markDone;
exports.markFailed = markFailed;
exports.markPendingRetry = markPendingRetry;
exports.getPendingCount = getPendingCount;
exports.hasPendingForResource = hasPendingForResource;
exports.remapTempId = remapTempId;
exports.cleanCompleted = cleanCompleted;
const index_1 = require("../index");
function enqueue(db, method, endpoint, body, tempId) {
    db.run(`INSERT INTO _sync_queue (method, endpoint, body, temp_id, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', datetime('now'))`, [method, endpoint, body ? JSON.stringify(body) : null, tempId || null]);
    (0, index_1.saveDb)();
}
function getPending(db) {
    const result = db.exec("SELECT id, created_at, method, endpoint, body, temp_id, status, error_message, retry_count, synced_at FROM _sync_queue WHERE status = 'pending' ORDER BY id ASC");
    if (result.length === 0)
        return [];
    return result[0].values.map(row => ({
        id: row[0],
        created_at: row[1],
        method: row[2],
        endpoint: row[3],
        body: row[4],
        temp_id: row[5],
        status: row[6],
        error_message: row[7],
        retry_count: row[8],
        synced_at: row[9],
    }));
}
function markSyncing(db, id) {
    db.run("UPDATE _sync_queue SET status = 'syncing' WHERE id = ?", [id]);
    (0, index_1.saveDb)();
}
function markDone(db, id) {
    db.run("UPDATE _sync_queue SET status = 'done', synced_at = datetime('now') WHERE id = ?", [id]);
    (0, index_1.saveDb)();
}
function markFailed(db, id, errorMessage) {
    db.run("UPDATE _sync_queue SET status = 'failed', error_message = ?, retry_count = retry_count + 1 WHERE id = ?", [errorMessage, id]);
    (0, index_1.saveDb)();
}
function markPendingRetry(db, id) {
    db.run("UPDATE _sync_queue SET status = 'pending', retry_count = retry_count + 1 WHERE id = ?", [id]);
    (0, index_1.saveDb)();
}
function getPendingCount(db) {
    const result = db.exec("SELECT COUNT(*) FROM _sync_queue WHERE status IN ('pending', 'syncing')");
    if (result.length === 0 || result[0].values.length === 0)
        return 0;
    return result[0].values[0][0];
}
function hasPendingForResource(db, endpoint) {
    const result = db.exec("SELECT COUNT(*) FROM _sync_queue WHERE status IN ('pending', 'syncing') AND endpoint LIKE ?", ['%' + endpoint + '%']);
    if (result.length === 0 || result[0].values.length === 0)
        return false;
    return result[0].values[0][0] > 0;
}
function remapTempId(db, tempId, realId) {
    // Update sync queue entries that reference this temp ID in their body or endpoint
    const pending = db.exec("SELECT id, endpoint, body FROM _sync_queue WHERE status = 'pending'");
    if (pending.length === 0)
        return;
    for (const row of pending[0].values) {
        const entryId = row[0];
        let endpoint = row[1];
        let body = row[2];
        let changed = false;
        if (endpoint.includes(tempId)) {
            endpoint = endpoint.replace(tempId, realId);
            changed = true;
        }
        if (body && body.includes(tempId)) {
            body = body.split(tempId).join(realId);
            changed = true;
        }
        if (changed) {
            db.run('UPDATE _sync_queue SET endpoint = ?, body = ? WHERE id = ?', [endpoint, body, entryId]);
        }
    }
    (0, index_1.saveDb)();
}
function cleanCompleted(db) {
    db.run("DELETE FROM _sync_queue WHERE status = 'done'");
    (0, index_1.saveDb)();
}
