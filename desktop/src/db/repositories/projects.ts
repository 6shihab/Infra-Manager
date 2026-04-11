import { Database } from 'sql.js';
import { saveDb } from '../index';
import * as crypto from 'crypto';

function generateUUID(): string {
    return crypto.randomUUID();
}

function rowToProject(columns: string[], row: any[]): any {
    const obj: any = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    // Convert integer booleans
    obj.is_online = obj.is_online === 1 ? true : obj.is_online === 0 ? false : null;
    obj.is_deleted = obj.is_deleted === 1;
    obj._is_local = obj._is_local === 1;
    return obj;
}

export function listProjects(db: Database): any[] {
    const result = db.exec('SELECT * FROM projects WHERE is_deleted = 0 ORDER BY name');
    if (result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => rowToProject(columns, row));
}

export function getProjectById(db: Database, id: string): any | null {
    const result = db.exec('SELECT * FROM projects WHERE id = ? AND is_deleted = 0', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const project = rowToProject(result[0].columns, result[0].values[0]);

    // Get server links
    const serverLinks = db.exec(`
        SELECT ps.*, s.name as server_name, s.ip_address, s.os, s.region, s.is_online as server_is_online,
               s.last_checked_at as server_last_checked_at, s.id as server_id
        FROM project_server ps
        JOIN servers s ON s.id = ps.server_id
        WHERE ps.project_id = ? AND s.is_deleted = 0
    `, [id]);

    project.server_links = [];
    if (serverLinks.length > 0) {
        const cols = serverLinks[0].columns;
        project.server_links = serverLinks[0].values.map(row => {
            const link: any = {};
            cols.forEach((c, i) => { link[c] = row[i]; });
            link.server = {
                id: link.server_id,
                name: link.server_name,
                ip_address: link.ip_address,
                os: link.os,
                region: link.region,
                is_online: link.server_is_online === 1 ? true : link.server_is_online === 0 ? false : null,
                last_checked_at: link.server_last_checked_at,
            };
            return link;
        });
    }

    // Get database links
    const dbLinks = db.exec(`
        SELECT pd.*, de.name as db_name_display, de.engine, de.host, de.port,
               de.id as database_engine_id_ref
        FROM project_database pd
        JOIN database_engines de ON de.id = pd.database_engine_id
        WHERE pd.project_id = ? AND de.is_deleted = 0
    `, [id]);

    project.database_links = [];
    if (dbLinks.length > 0) {
        const cols = dbLinks[0].columns;
        project.database_links = dbLinks[0].values.map(row => {
            const link: any = {};
            cols.forEach((c, i) => { link[c] = row[i]; });
            link.database_engine = {
                id: link.database_engine_id_ref || link.database_engine_id,
                name: link.db_name_display,
                engine: link.engine,
                host: link.host,
                port: link.port,
            };
            return link;
        });
    }

    // Get components
    const comps = db.exec('SELECT * FROM components WHERE project_id = ? AND is_deleted = 0', [id]);
    project.components = [];
    if (comps.length > 0) {
        const cols = comps[0].columns;
        project.components = comps[0].values.map(row => {
            const comp: any = {};
            cols.forEach((c, i) => { comp[c] = row[i]; });
            if (typeof comp.custom_fields === 'string') {
                try { comp.custom_fields = JSON.parse(comp.custom_fields); } catch { comp.custom_fields = {}; }
            }
            return comp;
        });
    }

    // Get group accesses
    const groupAccesses = db.exec(`
        SELECT pga.*, g.name as group_name
        FROM project_group_access pga
        LEFT JOIN groups_ g ON g.id = pga.group_id
        WHERE pga.project_id = ?
    `, [id]);
    project.group_accesses = [];
    if (groupAccesses.length > 0) {
        const cols = groupAccesses[0].columns;
        project.group_accesses = groupAccesses[0].values.map(row => {
            const acc: any = {};
            cols.forEach((c, i) => { acc[c] = row[i]; });
            acc.group = { id: acc.group_id, name: acc.group_name };
            return acc;
        });
    }

    // Get user accesses
    const userAccesses = db.exec(`
        SELECT pua.*, u.email, u.full_name
        FROM project_user_access pua
        LEFT JOIN users u ON u.id = pua.user_id
        WHERE pua.project_id = ?
    `, [id]);
    project.user_accesses = [];
    if (userAccesses.length > 0) {
        const cols = userAccesses[0].columns;
        project.user_accesses = userAccesses[0].values.map(row => {
            const acc: any = {};
            cols.forEach((c, i) => { acc[c] = row[i]; });
            acc.user = { id: acc.user_id, email: acc.email, full_name: acc.full_name };
            return acc;
        });
    }

    return project;
}

export function createProject(db: Database, data: any): any {
    const id = generateUUID();
    const now = new Date().toISOString();
    db.run(
        `INSERT INTO projects (id, name, description, primary_domain, environment, deployment_note, folder_id, is_deleted, created_by, _is_local, _local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?)`,
        [id, data.name, data.description || null, data.primary_domain || null, data.environment || 'Dev', data.deployment_note || null, data.folder_id || null, data.created_by || null, now]
    );
    saveDb();
    return { id, ...data, is_deleted: false, _is_local: true };
}

export function updateProject(db: Database, id: string, data: any): any {
    const fields: string[] = [];
    const values: any[] = [];

    const allowedFields = ['name', 'description', 'primary_domain', 'environment', 'deployment_note', 'folder_id'];
    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            fields.push(`${field} = ?`);
            values.push(data[field]);
        }
    }

    if (fields.length === 0) return getProjectById(db, id);

    fields.push('_local_updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    db.run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values);
    saveDb();
    return getProjectById(db, id);
}

export function softDeleteProject(db: Database, id: string): void {
    const now = new Date().toISOString();
    db.run('UPDATE projects SET is_deleted = 1, deleted_at = ?, _local_updated_at = ? WHERE id = ?', [now, now, id]);
    saveDb();
}

export function upsertProject(db: Database, project: any): void {
    db.run(
        `INSERT OR REPLACE INTO projects (id, name, description, primary_domain, environment, deployment_note, folder_id, is_online, last_checked_at, is_deleted, deleted_at, created_by, server_count, database_count, current_user_role, _is_local, _local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
        [
            project.id, project.name, project.description || null,
            project.primary_domain || null, project.environment || 'Dev',
            project.deployment_note || null, project.folder_id || null,
            project.is_online === true ? 1 : project.is_online === false ? 0 : null,
            project.last_checked_at || null,
            project.is_deleted ? 1 : 0, project.deleted_at || null,
            project.created_by || null,
            project.server_count || 0, project.database_count || 0,
            project.current_user_role || null,
        ]
    );
}

export function upsertProjectServerLink(db: Database, projectId: string, link: any): void {
    db.run(
        `INSERT OR REPLACE INTO project_server (project_id, server_id, username, password, ssh_key)
         VALUES (?, ?, ?, ?, ?)`,
        [projectId, link.server_id || link.server?.id, link.username || null, link.password || null, link.ssh_key || null]
    );
}

export function upsertProjectDatabaseLink(db: Database, projectId: string, link: any): void {
    db.run(
        `INSERT OR REPLACE INTO project_database (project_id, database_engine_id, db_name, username, password)
         VALUES (?, ?, ?, ?, ?)`,
        [projectId, link.database_engine_id || link.database_engine?.id, link.db_name || '', link.username || null, link.password || null]
    );
}

export function upsertProjectGroupAccess(db: Database, access: any): void {
    db.run(
        `INSERT OR REPLACE INTO project_group_access (id, project_id, group_id, access_level)
         VALUES (?, ?, ?, ?)`,
        [access.id, access.project_id, access.group_id, access.access_level || 'Viewer']
    );
}

export function upsertProjectUserAccess(db: Database, access: any): void {
    db.run(
        `INSERT OR REPLACE INTO project_user_access (id, project_id, user_id, access_level)
         VALUES (?, ?, ?, ?)`,
        [access.id, access.project_id, access.user_id, access.access_level || 'Viewer']
    );
}

export function clearProjectLinks(db: Database, projectId: string): void {
    db.run('DELETE FROM project_server WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM project_database WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM project_group_access WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM project_user_access WHERE project_id = ?', [projectId]);
}

export function deleteProjectServerLink(db: Database, projectId: string, serverId: string): void {
    db.run('DELETE FROM project_server WHERE project_id = ? AND server_id = ?', [projectId, serverId]);
    saveDb();
}

export function deleteProjectDatabaseLink(db: Database, projectId: string, dbEngineId: string): void {
    db.run('DELETE FROM project_database WHERE project_id = ? AND database_engine_id = ?', [projectId, dbEngineId]);
    saveDb();
}
