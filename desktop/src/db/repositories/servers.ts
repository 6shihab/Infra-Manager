import { Database } from 'sql.js';
import { saveDb } from '../index';
import * as crypto from 'crypto';

function generateUUID(): string {
    return crypto.randomUUID();
}

function rowToServer(columns: string[], row: any[]): any {
    const obj: any = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    obj.is_online = obj.is_online === 1 ? true : obj.is_online === 0 ? false : null;
    obj.is_deleted = obj.is_deleted === 1;
    obj.can_edit = obj.can_edit === 1;
    obj.can_delete = obj.can_delete === 1;
    obj._is_local = obj._is_local === 1;
    return obj;
}

export function listServers(db: Database): any[] {
    const result = db.exec('SELECT * FROM servers WHERE is_deleted = 0 ORDER BY name');
    if (result.length === 0) return [];
    return result[0].values.map(row => rowToServer(result[0].columns, row));
}

export function getServerById(db: Database, id: string): any | null {
    const result = db.exec('SELECT * FROM servers WHERE id = ? AND is_deleted = 0', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return rowToServer(result[0].columns, result[0].values[0]);
}

export function getServerCredentials(db: Database, id: string): any | null {
    const result = db.exec('SELECT username, password, ssh_key FROM servers WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const row = result[0].values[0];
    return { username: row[0], password: row[1], ssh_key: row[2] };
}

export function createServer(db: Database, data: any): any {
    const id = generateUUID();
    const now = new Date().toISOString();
    db.run(
        `INSERT INTO servers (id, name, ip_address, os, region, username, password, ssh_key, is_deleted, created_by, can_edit, can_delete, _is_local, _local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, 1, 1, ?)`,
        [id, data.name, data.ip_address, data.os || null, data.region || null, data.username || null, data.password || null, data.ssh_key || null, data.created_by || null, now]
    );
    saveDb();
    return { id, ...data, is_deleted: false, _is_local: true };
}

export function updateServer(db: Database, id: string, data: any): any {
    const fields: string[] = [];
    const values: any[] = [];

    const allowedFields = ['name', 'ip_address', 'os', 'region', 'username', 'password', 'ssh_key'];
    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            fields.push(`${field} = ?`);
            values.push(data[field]);
        }
    }

    if (fields.length === 0) return getServerById(db, id);

    fields.push('_local_updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    db.run(`UPDATE servers SET ${fields.join(', ')} WHERE id = ?`, values);
    saveDb();
    return getServerById(db, id);
}

export function softDeleteServer(db: Database, id: string): void {
    const now = new Date().toISOString();
    db.run('UPDATE servers SET is_deleted = 1, deleted_at = ?, _local_updated_at = ? WHERE id = ?', [now, now, id]);
    saveDb();
}

export function upsertServer(db: Database, server: any): void {
    // Preserve locally cached credentials if they exist
    const existing = db.exec('SELECT password, ssh_key FROM servers WHERE id = ?', [server.id]);
    const cachedPassword = existing.length > 0 && existing[0].values.length > 0 ? existing[0].values[0][0] : null;
    const cachedSshKey = existing.length > 0 && existing[0].values.length > 0 ? existing[0].values[0][1] : null;

    db.run(
        `INSERT OR REPLACE INTO servers (id, name, ip_address, os, region, username, password, ssh_key, is_online, last_checked_at, is_deleted, deleted_at, created_by, can_edit, can_delete, _is_local, _local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
        [
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
        ]
    );
}

export function updateCredentials(db: Database, id: string, creds: { username?: string; password?: string; ssh_key?: string }): void {
    const fields: string[] = [];
    const values: any[] = [];
    if (creds.username !== undefined) { fields.push('username = ?'); values.push(creds.username); }
    if (creds.password !== undefined) { fields.push('password = ?'); values.push(creds.password); }
    if (creds.ssh_key !== undefined) { fields.push('ssh_key = ?'); values.push(creds.ssh_key); }
    if (fields.length === 0) return;
    values.push(id);
    db.run(`UPDATE servers SET ${fields.join(', ')} WHERE id = ?`, values);
    saveDb();
}
