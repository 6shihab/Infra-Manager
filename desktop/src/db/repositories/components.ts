import { Database } from 'sql.js';
import { saveDb } from '../index';
import * as crypto from 'crypto';

function generateUUID(): string {
    return crypto.randomUUID();
}

function rowToComponent(columns: string[], row: any[]): any {
    const obj: any = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    obj.is_deleted = obj.is_deleted === 1;
    obj._is_local = obj._is_local === 1;
    if (typeof obj.custom_fields === 'string') {
        try { obj.custom_fields = JSON.parse(obj.custom_fields); } catch { obj.custom_fields = {}; }
    }
    return obj;
}

export function listComponents(db: Database, projectId?: string): any[] {
    let sql = 'SELECT * FROM components WHERE is_deleted = 0';
    const params: any[] = [];
    if (projectId) {
        sql += ' AND project_id = ?';
        params.push(projectId);
    }
    sql += ' ORDER BY name';
    const result = db.exec(sql, params);
    if (result.length === 0) return [];
    return result[0].values.map(row => rowToComponent(result[0].columns, row));
}

export function getComponentById(db: Database, id: string): any | null {
    const result = db.exec('SELECT * FROM components WHERE id = ? AND is_deleted = 0', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return rowToComponent(result[0].columns, result[0].values[0]);
}

export function createComponent(db: Database, data: any): any {
    const id = generateUUID();
    const now = new Date().toISOString();
    const customFields = typeof data.custom_fields === 'string' ? data.custom_fields : JSON.stringify(data.custom_fields || {});
    db.run(
        `INSERT INTO components (id, name, type, custom_fields, project_id, is_deleted, _is_local, _local_updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 1, ?)`,
        [id, data.name, data.type, customFields, data.project_id, now]
    );
    saveDb();
    return { id, ...data, custom_fields: data.custom_fields || {}, is_deleted: false, _is_local: true };
}

export function updateComponent(db: Database, id: string, data: any): any {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
    if (data.custom_fields !== undefined) {
        fields.push('custom_fields = ?');
        values.push(typeof data.custom_fields === 'string' ? data.custom_fields : JSON.stringify(data.custom_fields));
    }

    if (fields.length === 0) return getComponentById(db, id);

    fields.push('_local_updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    db.run(`UPDATE components SET ${fields.join(', ')} WHERE id = ?`, values);
    saveDb();
    return getComponentById(db, id);
}

export function softDeleteComponent(db: Database, id: string): void {
    const now = new Date().toISOString();
    db.run('UPDATE components SET is_deleted = 1, deleted_at = ?, _local_updated_at = ? WHERE id = ?', [now, now, id]);
    saveDb();
}

export function upsertComponent(db: Database, comp: any): void {
    const customFields = typeof comp.custom_fields === 'string' ? comp.custom_fields : JSON.stringify(comp.custom_fields || {});
    db.run(
        `INSERT OR REPLACE INTO components (id, name, type, custom_fields, project_id, is_deleted, deleted_at, _is_local, _local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
        [comp.id, comp.name, comp.type, customFields, comp.project_id, comp.is_deleted ? 1 : 0, comp.deleted_at || null]
    );
}
