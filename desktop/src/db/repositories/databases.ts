import { Database } from 'sql.js';
import { saveDb } from '../index';
import * as crypto from 'crypto';
import { encrypt, decrypt } from '../../crypto';

function generateUUID(): string {
    return crypto.randomUUID();
}

function rowToDbEngine(columns: string[], row: any[]): any {
    const obj: any = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    obj.is_deleted = obj.is_deleted === 1;
    obj.can_edit = obj.can_edit === 1;
    obj.can_delete = obj.can_delete === 1;
    obj._is_local = obj._is_local === 1;
    return obj;
}

export function listDatabases(db: Database): any[] {
    const result = db.exec('SELECT * FROM database_engines WHERE is_deleted = 0 ORDER BY name');
    if (result.length === 0) return [];
    return result[0].values.map(row => rowToDbEngine(result[0].columns, row));
}

export function getDatabaseById(db: Database, id: string): any | null {
    const result = db.exec('SELECT * FROM database_engines WHERE id = ? AND is_deleted = 0', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return rowToDbEngine(result[0].columns, result[0].values[0]);
}

export function getDatabaseCredentials(db: Database, id: string): any | null {
    const result = db.exec('SELECT username, password FROM database_engines WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const row = result[0].values[0];
    return { username: row[0] as string | null, password: decrypt(row[1] as string | null) };
}

export function createDatabase(db: Database, data: any): any {
    const id = generateUUID();
    const now = new Date().toISOString();
    db.run(
        `INSERT INTO database_engines (id, name, engine, host, port, connection_string_format, username, password, is_deleted, created_by, can_edit, can_delete, _is_local, _local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, 1, 1, ?)`,
        [id, data.name, data.engine, data.host, data.port || null, data.connection_string_format || null, data.username || null, encrypt(data.password), data.created_by || null, now]
    );
    saveDb();
    return { id, ...data, is_deleted: false, _is_local: true };
}

export function updateDatabase(db: Database, id: string, data: any): any {
    const fields: string[] = [];
    const values: any[] = [];

    const allowedFields = ['name', 'engine', 'host', 'port', 'connection_string_format', 'username', 'password'];
    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            fields.push(`${field} = ?`);
            values.push(field === 'password' ? encrypt(data[field]) : data[field]);
        }
    }

    if (fields.length === 0) return getDatabaseById(db, id);

    fields.push('_local_updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    db.run(`UPDATE database_engines SET ${fields.join(', ')} WHERE id = ?`, values);
    saveDb();
    return getDatabaseById(db, id);
}

export function softDeleteDatabase(db: Database, id: string): void {
    const now = new Date().toISOString();
    db.run('UPDATE database_engines SET is_deleted = 1, deleted_at = ?, _local_updated_at = ? WHERE id = ?', [now, now, id]);
    saveDb();
}

export function upsertDatabase(db: Database, engine: any): void {
    // Preserve locally cached (already encrypted) password if it exists
    const existing = db.exec('SELECT password FROM database_engines WHERE id = ?', [engine.id]);
    const cachedPassword = existing.length > 0 && existing[0].values.length > 0 ? existing[0].values[0][0] : null;

    // Incoming engine.password from API is plaintext — encrypt before storing
    const password = engine.password ? encrypt(engine.password) : (cachedPassword as string | null) || null;

    db.run(
        `INSERT OR REPLACE INTO database_engines (id, name, engine, host, port, connection_string_format, username, password, is_deleted, deleted_at, created_by, can_edit, can_delete, _is_local, _local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
        [
            engine.id, engine.name, engine.engine, engine.host, engine.port || null,
            engine.connection_string_format || null,
            engine.username || null,
            password,
            engine.is_deleted ? 1 : 0, engine.deleted_at || null,
            engine.created_by || null,
            engine.can_edit ? 1 : 0, engine.can_delete ? 1 : 0,
        ]
    );
}

export function updateCredentials(db: Database, id: string, creds: { username?: string; password?: string }): void {
    const fields: string[] = [];
    const values: any[] = [];
    if (creds.username !== undefined) { fields.push('username = ?'); values.push(creds.username); }
    if (creds.password !== undefined) { fields.push('password = ?'); values.push(encrypt(creds.password)); }
    if (fields.length === 0) return;
    values.push(id);
    db.run(`UPDATE database_engines SET ${fields.join(', ')} WHERE id = ?`, values);
    saveDb();
}
