"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveSession = saveSession;
exports.getSession = getSession;
exports.clearSession = clearSession;
exports.updateSessionToken = updateSessionToken;
const index_1 = require("../index");
function saveSession(db, session) {
    db.run(`INSERT OR REPLACE INTO _cached_session (id, user_id, email, full_name, is_superuser, totp_enabled, token, cached_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)`, [session.user_id, session.email, session.full_name, session.is_superuser ? 1 : 0, session.totp_enabled ? 1 : 0, session.token, session.cached_at]);
    (0, index_1.saveDb)();
}
function getSession(db) {
    const result = db.exec('SELECT user_id, email, full_name, is_superuser, totp_enabled, token, cached_at FROM _cached_session WHERE id = 1');
    if (result.length === 0 || result[0].values.length === 0)
        return null;
    const row = result[0].values[0];
    return {
        user_id: row[0],
        email: row[1],
        full_name: row[2],
        is_superuser: row[3] === 1,
        totp_enabled: row[4] === 1,
        token: row[5],
        cached_at: row[6],
    };
}
function clearSession(db) {
    db.run('DELETE FROM _cached_session');
    (0, index_1.saveDb)();
}
function updateSessionToken(db, token) {
    db.run('UPDATE _cached_session SET token = ?, cached_at = ? WHERE id = 1', [token, new Date().toISOString()]);
    (0, index_1.saveDb)();
}
