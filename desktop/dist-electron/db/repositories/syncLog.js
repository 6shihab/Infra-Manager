"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addLog = addLog;
exports.getRecentLogs = getRecentLogs;
exports.clearLogs = clearLogs;
const index_1 = require("../index");
function addLog(db, level, message) {
    db.run("INSERT INTO _sync_log (timestamp, level, message) VALUES (datetime('now'), ?, ?)", [level, message]);
    // Prune old logs (keep last 200)
    db.run("DELETE FROM _sync_log WHERE id NOT IN (SELECT id FROM _sync_log ORDER BY id DESC LIMIT 200)");
}
function getRecentLogs(db, limit = 50) {
    const result = db.exec('SELECT id, timestamp, level, message FROM _sync_log ORDER BY id DESC LIMIT ?', [limit]);
    if (result.length === 0)
        return [];
    return result[0].values.map(row => ({
        id: row[0],
        timestamp: row[1],
        level: row[2],
        message: row[3],
    }));
}
function clearLogs(db) {
    db.run('DELETE FROM _sync_log');
    (0, index_1.saveDb)();
}
