import { Database } from 'sql.js';
import { saveDb } from '../index';

export function listSettings(db: Database): any[] {
    const result = db.exec('SELECT key, value, description FROM settings ORDER BY key');
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
        key: row[0] as string,
        value: row[1] as string,
        description: row[2] as string | null,
    }));
}

export function getSetting(db: Database, key: string): any | null {
    const result = db.exec('SELECT key, value, description FROM settings WHERE key = ?', [key]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const row = result[0].values[0];
    return { key: row[0], value: row[1], description: row[2] };
}

export function upsertSetting(db: Database, key: string, value: string, description?: string | null): void {
    db.run(
        'INSERT OR REPLACE INTO settings (key, value, description) VALUES (?, ?, ?)',
        [key, value, description || null]
    );
    saveDb();
}

export function bulkUpsertSettings(db: Database, settings: any[]): void {
    for (const s of settings) {
        db.run(
            'INSERT OR REPLACE INTO settings (key, value, description) VALUES (?, ?, ?)',
            [s.key, s.value, s.description || null]
        );
    }
    saveDb();
}
