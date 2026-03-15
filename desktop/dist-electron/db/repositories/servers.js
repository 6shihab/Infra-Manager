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
exports.listServers = listServers;
exports.getServerById = getServerById;
exports.getServerCredentials = getServerCredentials;
exports.createServer = createServer;
exports.updateServer = updateServer;
exports.softDeleteServer = softDeleteServer;
exports.upsertServer = upsertServer;
exports.updateCredentials = updateCredentials;
const index_1 = require("../index");
const crypto = __importStar(require("crypto"));
function generateUUID() {
    return crypto.randomUUID();
}
function rowToServer(columns, row) {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    obj.is_online = obj.is_online === 1 ? true : obj.is_online === 0 ? false : null;
    obj.is_deleted = obj.is_deleted === 1;
    obj.can_edit = obj.can_edit === 1;
    obj.can_delete = obj.can_delete === 1;
    obj._is_local = obj._is_local === 1;
    return obj;
}
function listServers(db) {
    const result = db.exec('SELECT * FROM servers WHERE is_deleted = 0 ORDER BY name');
    if (result.length === 0)
        return [];
    return result[0].values.map(row => rowToServer(result[0].columns, row));
}
function getServerById(db, id) {
    const result = db.exec('SELECT * FROM servers WHERE id = ? AND is_deleted = 0', [id]);
    if (result.length === 0 || result[0].values.length === 0)
        return null;
    return rowToServer(result[0].columns, result[0].values[0]);
}
function getServerCredentials(db, id) {
    const result = db.exec('SELECT username, password, ssh_key FROM servers WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0)
        return null;
    const row = result[0].values[0];
    return { username: row[0], password: row[1], ssh_key: row[2] };
}
function createServer(db, data) {
    const id = generateUUID();
    const now = new Date().toISOString();
    db.run(`INSERT INTO servers (id, name, ip_address, os, region, username, password, ssh_key, is_deleted, created_by, can_edit, can_delete, _is_local, _local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, 1, 1, ?)`, [id, data.name, data.ip_address, data.os || null, data.region || null, data.username || null, data.password || null, data.ssh_key || null, data.created_by || null, now]);
    (0, index_1.saveDb)();
    return { id, ...data, is_deleted: false, _is_local: true };
}
function updateServer(db, id, data) {
    const fields = [];
    const values = [];
    const allowedFields = ['name', 'ip_address', 'os', 'region', 'username', 'password', 'ssh_key'];
    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            fields.push(`${field} = ?`);
            values.push(data[field]);
        }
    }
    if (fields.length === 0)
        return getServerById(db, id);
    fields.push('_local_updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    db.run(`UPDATE servers SET ${fields.join(', ')} WHERE id = ?`, values);
    (0, index_1.saveDb)();
    return getServerById(db, id);
}
function softDeleteServer(db, id) {
    const now = new Date().toISOString();
    db.run('UPDATE servers SET is_deleted = 1, deleted_at = ?, _local_updated_at = ? WHERE id = ?', [now, now, id]);
    (0, index_1.saveDb)();
}
function upsertServer(db, server) {
    // Preserve locally cached credentials if they exist
    const existing = db.exec('SELECT password, ssh_key FROM servers WHERE id = ?', [server.id]);
    const cachedPassword = existing.length > 0 && existing[0].values.length > 0 ? existing[0].values[0][0] : null;
    const cachedSshKey = existing.length > 0 && existing[0].values.length > 0 ? existing[0].values[0][1] : null;
    db.run(`INSERT OR REPLACE INTO servers (id, name, ip_address, os, region, username, password, ssh_key, is_online, last_checked_at, is_deleted, deleted_at, created_by, can_edit, can_delete, _is_local, _local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`, [
        server.id, server.name, server.ip_address,
        server.os || null, server.region || null,
        server.username || null,
        server.password || cachedPassword || null,
        server.ssh_key || cachedSshKey || null,
        server.is_online === true ? 1 : server.is_online === false ? 0 : null,
        server.last_checked_at || null,
        server.is_deleted ? 1 : 0, server.deleted_at || null,
        server.created_by || null,
        server.can_edit ? 1 : 0, server.can_delete ? 1 : 0,
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
    if (creds.ssh_key !== undefined) {
        fields.push('ssh_key = ?');
        values.push(creds.ssh_key);
    }
    if (fields.length === 0)
        return;
    values.push(id);
    db.run(`UPDATE servers SET ${fields.join(', ')} WHERE id = ?`, values);
    (0, index_1.saveDb)();
}
