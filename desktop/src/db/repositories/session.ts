import { Database } from 'sql.js';
import { saveDb } from '../index';
import { encrypt, decrypt } from '../../crypto';

export interface CachedSession {
    user_id: string;
    email: string;
    full_name: string | null;
    is_superuser: boolean;
    token: string;
    refresh_token: string | null;
    cached_at: string;
}

export function saveSession(db: Database, session: CachedSession): void {
    db.run(
        `INSERT OR REPLACE INTO _cached_session (id, user_id, email, full_name, is_superuser, totp_enabled, has_passkeys, token, refresh_token, cached_at)
         VALUES (1, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
        [session.user_id, session.email, session.full_name, session.is_superuser ? 1 : 0, encrypt(session.token), session.refresh_token ? encrypt(session.refresh_token) : null, session.cached_at]
    );
    saveDb();
}

export function getSession(db: Database): CachedSession | null {
    const result = db.exec('SELECT user_id, email, full_name, is_superuser, token, refresh_token, cached_at FROM _cached_session WHERE id = 1');
    if (result.length === 0 || result[0].values.length === 0) return null;
    const row = result[0].values[0];
    const rawToken = row[4] as string;
    const rawRefreshToken = row[5] as string | null;
    return {
        user_id: row[0] as string,
        email: row[1] as string,
        full_name: row[2] as string | null,
        is_superuser: row[3] === 1,
        token: decrypt(rawToken) || rawToken,
        refresh_token: rawRefreshToken ? (decrypt(rawRefreshToken) || rawRefreshToken) : null,
        cached_at: row[6] as string,
    };
}

export function clearSession(db: Database): void {
    db.run('DELETE FROM _cached_session');
    saveDb();
}

export function updateSessionToken(db: Database, token: string, refreshToken?: string): void {
    if (refreshToken) {
        db.run('UPDATE _cached_session SET token = ?, refresh_token = ?, cached_at = ? WHERE id = 1', [encrypt(token), encrypt(refreshToken), new Date().toISOString()]);
    } else {
        db.run('UPDATE _cached_session SET token = ?, cached_at = ? WHERE id = 1', [encrypt(token), new Date().toISOString()]);
    }
    saveDb();
}
