import { Database } from 'sql.js';

export function migration008(db: Database): void {
    // Add refresh_token column to cached session for Keycloak OIDC token refresh
    db.run(`ALTER TABLE _cached_session ADD COLUMN refresh_token TEXT`);

    // Add keycloak_id column to local users table
    db.run(`ALTER TABLE users ADD COLUMN keycloak_id TEXT`);
}
