"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSettings = listSettings;
exports.getSetting = getSetting;
exports.upsertSetting = upsertSetting;
exports.bulkUpsertSettings = bulkUpsertSettings;
const index_1 = require("../index");
function listSettings(db) {
    const result = db.exec('SELECT key, value, description FROM settings ORDER BY key');
    if (result.length === 0)
        return [];
    return result[0].values.map(row => ({
        key: row[0],
        value: row[1],
        description: row[2],
    }));
}
function getSetting(db, key) {
    const result = db.exec('SELECT key, value, description FROM settings WHERE key = ?', [key]);
    if (result.length === 0 || result[0].values.length === 0)
        return null;
    const row = result[0].values[0];
    return { key: row[0], value: row[1], description: row[2] };
}
function upsertSetting(db, key, value, description) {
    db.run('INSERT OR REPLACE INTO settings (key, value, description) VALUES (?, ?, ?)', [key, value, description || null]);
    (0, index_1.saveDb)();
}
function bulkUpsertSettings(db, settings) {
    for (const s of settings) {
        db.run('INSERT OR REPLACE INTO settings (key, value, description) VALUES (?, ?, ?)', [s.key, s.value, s.description || null]);
    }
    (0, index_1.saveDb)();
}
