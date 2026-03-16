import { Database } from 'sql.js';
import { saveDb } from '../index';
import { encrypt, decrypt } from '../../crypto';

export interface CachedSession {
    user_id: string;
    email: string;
    full_name: string | null;
    is_superuser: boolean;
    totp_enabled: boolean;
    token: string;
    cached_at: string;
}

export function saveSession(db: Database, session: CachedSession): void {
    db.run(
        `INSERT OR REPLACE INTO _cached_session (id, user_id, email, full_name, is_superuser, totp_enabled, token, cached_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
        [session.user_id, session.email, session.full_name, session.is_superuser ? 1 : 0, session.totp_enabled ? 1 : 0, encrypt(session.token), session.cached_at]
    );
    saveDb();
}

export function getSession(db: Database): CachedSession | null {
    const result = db.exec('SELECT user_id, email, full_name, is_superuser, totp_enabled, token, cached_at FROM _cached_session WHERE id = 1');
    if (result.length === 0 || result[0].values.length === 0) return null;
    const row = result[0].values[0];
    const rawToken = row[5] as string;
    return {
        user_id: row[0] as string,
        email: row[1] as string,
        full_name: row[2] as string | null,
        is_superuser: row[3] === 1,
        totp_enabled: row[4] === 1,
        token: decrypt(rawToken) || rawToken, // Fallback to raw if decryption fails (legacy data)
        cached_at: row[6] as string,
    };
}

export function clearSession(db: Database): void {
    db.run('DELETE FROM _cached_session');
    saveDb();
}

export function updateSessionToken(db: Database, token: string): void {
    db.run('UPDATE _cached_session SET token = ?, cached_at = ? WHERE id = 1', [encrypt(token), new Date().toISOString()]);
    saveDb();
}
