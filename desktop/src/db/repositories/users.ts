import { Database } from 'sql.js';
import { saveDb } from '../index';

function rowToUser(columns: string[], row: any[]): any {
    const obj: any = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    obj.is_active = obj.is_active === 1;
    obj.is_superuser = obj.is_superuser === 1;
    obj.totp_enabled = obj.totp_enabled === 1;
    obj.has_passkeys = obj.has_passkeys === 1;
    return obj;
}

export function listUsers(db: Database): any[] {
    const result = db.exec('SELECT * FROM users ORDER BY email');
    if (result.length === 0) return [];
    return result[0].values.map(row => rowToUser(result[0].columns, row));
}

export function getUserById(db: Database, id: string): any | null {
    const result = db.exec('SELECT * FROM users WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return rowToUser(result[0].columns, result[0].values[0]);
}

export function upsertUser(db: Database, user: any): void {
    db.run(
        `INSERT OR REPLACE INTO users (id, email, full_name, is_active, is_superuser, totp_enabled, has_passkeys)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user.id, user.email, user.full_name || null, user.is_active ? 1 : 0, user.is_superuser ? 1 : 0, user.totp_enabled ? 1 : 0, user.has_passkeys ? 1 : 0]
    );
}

export function listGroups(db: Database): any[] {
    const result = db.exec('SELECT * FROM groups_ ORDER BY name');
    if (result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => {
        const group: any = {};
        columns.forEach((col, i) => { group[col] = row[i]; });

        // Get group members
        const members = db.exec(`
            SELECT u.* FROM users u
            JOIN user_group_link ugl ON ugl.user_id = u.id
            WHERE ugl.group_id = ?
        `, [group.id]);

        group.users = [];
        if (members.length > 0) {
            group.users = members[0].values.map(mRow => rowToUser(members[0].columns, mRow));
        }
        return group;
    });
}

export function getGroupById(db: Database, id: string): any | null {
    const result = db.exec('SELECT * FROM groups_ WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const group: any = {};
    result[0].columns.forEach((col, i) => { group[col] = result[0].values[0][i]; });

    const members = db.exec(`
        SELECT u.* FROM users u
        JOIN user_group_link ugl ON ugl.user_id = u.id
        WHERE ugl.group_id = ?
    `, [id]);
    group.users = [];
    if (members.length > 0) {
        group.users = members[0].values.map(row => rowToUser(members[0].columns, row));
    }
    return group;
}

export function upsertGroup(db: Database, group: any): void {
    db.run(
        `INSERT OR REPLACE INTO groups_ (id, name, description)
         VALUES (?, ?, ?)`,
        [group.id, group.name, group.description || null]
    );

    // Update membership if users provided
    if (group.users && Array.isArray(group.users)) {
        db.run('DELETE FROM user_group_link WHERE group_id = ?', [group.id]);
        for (const user of group.users) {
            db.run(
                'INSERT OR IGNORE INTO user_group_link (user_id, group_id) VALUES (?, ?)',
                [user.id, group.id]
            );
        }
    }
}

export function clearAllUsersAndGroups(db: Database): void {
    db.run('DELETE FROM user_group_link');
    db.run('DELETE FROM groups_');
    db.run('DELETE FROM users');
}

export function bulkUpsertUsers(db: Database, users: any[]): void {
    for (const user of users) {
        upsertUser(db, user);
    }
    saveDb();
}

export function bulkUpsertGroups(db: Database, groups: any[]): void {
    for (const group of groups) {
        upsertGroup(db, group);
    }
    saveDb();
}
