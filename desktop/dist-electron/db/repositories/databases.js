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
exports.listDatabases = listDatabases;
exports.getDatabaseById = getDatabaseById;
exports.getDatabaseCredentials = getDatabaseCredentials;
exports.createDatabase = createDatabase;
exports.updateDatabase = updateDatabase;
exports.softDeleteDatabase = softDeleteDatabase;
exports.upsertDatabase = upsertDatabase;
exports.updateCredentials = updateCredentials;
const index_1 = require("../index");
const crypto = __importStar(require("crypto"));
function generateUUID() {
    return crypto.randomUUID();
}
function rowToDbEngine(columns, row) {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    obj.is_deleted = obj.is_deleted === 1;
    obj.can_edit = obj.can_edit === 1;
    obj.can_delete = obj.can_delete === 1;
    obj._is_local = obj._is_local === 1;
    return obj;
}
function listDatabases(db) {
    const result = db.exec('SELECT * FROM database_engines WHERE is_deleted = 0 ORDER BY name');
    if (result.length === 0)
        return [];
    return result[0].values.map(row => rowToDbEngine(result[0].columns, row));
}
function getDatabaseById(db, id) {
    const result = db.exec('SELECT * FROM database_engines WHERE id = ? AND is_deleted = 0', [id]);
    if (result.length === 0 || result[0].values.length === 0)
        return null;
    return rowToDbEngine(result[0].columns, result[0].values[0]);
}
function getDatabaseCredentials(db, id) {
    const result = db.exec('SELECT username, password FROM database_engines WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0)
        return null;
    const row = result[0].values[0];
    return { username: row[0], password: row[1] };
}
function createDatabase(db, data) {
    const id = generateUUID();
    const now = new Date().toISOString();
    db.run(`INSERT INTO database_engines (id, name, engine, host, port, connection_string_format, username, password, is_deleted, created_by, can_edit, can_delete, _is_local, _local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, 1, 1, ?)`, [id, data.name, data.engine, data.host, data.port || null, data.connection_string_format || null, data.username || null, data.password || null, data.created_by || null, now]);
    (0, index_1.saveDb)();
    return { id, ...data, is_deleted: false, _is_local: true };
}
function updateDatabase(db, id, data) {
    const fields = [];
    const values = [];
    const allowedFields = ['name', 'engine', 'host', 'port', 'connection_string_format', 'username', 'password'];
    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            fields.push(`${field} = ?`);
            values.push(data[field]);
        }
    }
    if (fields.length === 0)
        return getDatabaseById(db, id);
    fields.push('_local_updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    db.run(`UPDATE database_engines SET ${fields.join(', ')} WHERE id = ?`, values);
    (0, index_1.saveDb)();
    return getDatabaseById(db, id);
}
function softDeleteDatabase(db, id) {
    const now = new Date().toISOString();
    db.run('UPDATE database_engines SET is_deleted = 1, deleted_at = ?, _local_updated_at = ? WHERE id = ?', [now, now, id]);
    (0, index_1.saveDb)();
}
function upsertDatabase(db, engine) {
    const existing = db.exec('SELECT password FROM database_engines WHERE id = ?', [engine.id]);
    const cachedPassword = existing.length > 0 && existing[0].values.length > 0 ? existing[0].values[0][0] : null;
    db.run(`INSERT OR REPLACE INTO database_engines (id, name, engine, host, port, connection_string_format, username, password, is_deleted, deleted_at, created_by, can_edit, can_delete, _is_local, _local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`, [
        engine.id, engine.name, engine.engine, engine.host, engine.port || null,
        engine.connection_string_format || null,
        engine.username || null,
        engine.password || cachedPassword || null,
        engine.is_deleted ? 1 : 0, engine.deleted_at || null,
        engine.created_by || null,
        engine.can_edit ? 1 : 0, engine.can_delete ? 1 : 0,
    ]);
}
function updateCredentials(db, id, creds) {
    const fields = [];
    const values = [];
    if (creds.username !== undefined) {
        fields.push('username = ?');
        values.push(creds.username);
    }
    if (creds.password !== undefined) {
        fields.push('password = ?');
        values.push(creds.password);
    }
    if (fields.length === 0)
        return;
    values.push(id);
    db.run(`UPDATE database_engines SET ${fields.join(', ')} WHERE id = ?`, values);
    (0, index_1.saveDb)();
}
