import { Database } from 'sql.js';
import { saveDb } from '../index';
import * as crypto from 'crypto';

function generateUUID(): string {
    return crypto.randomUUID();
}

export function listFolders(db: Database): any[] {
    const result = db.exec('SELECT * FROM project_folders WHERE is_deleted = 0 ORDER BY position, name');
    if (result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => {
        const obj: any = {};
        columns.forEach((col, i) => { obj[col] = row[i]; });
        obj.is_deleted = obj.is_deleted === 1;
        return obj;
    });
}

export function upsertFolder(db: Database, folder: any): void {
    db.run(
        `INSERT OR REPLACE INTO project_folders (id, name, color, position, parent_id, created_by, is_deleted, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            folder.id, folder.name, folder.color || null,
            folder.position ?? 0, folder.parent_id || null,
            folder.created_by || null,
            folder.is_deleted ? 1 : 0, folder.deleted_at || null,
        ]
    );
}

export function createFolder(db: Database, data: any): any {
    const id = generateUUID();
    db.run(
        `INSERT INTO project_folders (id, name, color, position, parent_id, created_by, is_deleted)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [id, data.name, data.color || null, data.position ?? 0, data.parent_id || null, data.created_by || null]
    );
    saveDb();
    return { id, ...data, is_deleted: false, children: [] };
}

export function updateFolder(db: Database, id: string, data: any): any {
    const fields: string[] = [];
    const values: any[] = [];

    const allowedFields = ['name', 'color', 'position', 'parent_id'];
    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            fields.push(`${field} = ?`);
            values.push(data[field]);
        }
    }

    if (fields.length === 0) return null;
    values.push(id);
    db.run(`UPDATE project_folders SET ${fields.join(', ')} WHERE id = ?`, values);
    saveDb();

    const result = db.exec('SELECT * FROM project_folders WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const columns = result[0].columns;
    const obj: any = {};
    columns.forEach((col, i) => { obj[col] = result[0].values[0][i]; });
    obj.is_deleted = obj.is_deleted === 1;
    return obj;
}

export function softDeleteFolder(db: Database, id: string): void {
    const now = new Date().toISOString();
    // Unfile projects in this folder
    db.run('UPDATE projects SET folder_id = NULL WHERE folder_id = ?', [id]);
    db.run('UPDATE project_folders SET is_deleted = 1, deleted_at = ? WHERE id = ?', [now, id]);
    saveDb();
}
