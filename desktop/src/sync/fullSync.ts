import { Database } from 'sql.js';
import * as https from 'https';
import * as http from 'http';
import { saveDb } from '../db/index';
import * as projectsRepo from '../db/repositories/projects';
import * as serversRepo from '../db/repositories/servers';
import * as databasesRepo from '../db/repositories/databases';
import * as componentsRepo from '../db/repositories/components';
import * as usersRepo from '../db/repositories/users';
import * as settingsRepo from '../db/repositories/settings';
import * as sessionRepo from '../db/repositories/session';
import * as syncQueueRepo from '../db/repositories/syncQueue';

/** Simple HTTP GET with Authorization header */
function httpGet(baseUrl: string, path: string, token: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const fullUrl = `${baseUrl.replace(/\/+$/, '')}${path}`;
        const parsed = new URL(fullUrl);
        const lib = parsed.protocol === 'https:' ? https : http;

        const req = lib.request(
            {
                hostname: parsed.hostname,
                port: parsed.port,
                path: parsed.pathname + parsed.search,
                method: 'GET',
                timeout: 15000,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(JSON.parse(data));
                        } else if (res.statusCode === 401) {
                            reject(new Error('UNAUTHORIZED'));
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            }
        );
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

export class FullSync {
    private apiUrl: string;
    private token: string;

    constructor(apiUrl: string, token: string) {
        this.apiUrl = apiUrl;
        this.token = token;
    }

    updateCredentials(apiUrl: string, token: string): void {
        this.apiUrl = apiUrl;
        this.token = token;
    }

    async run(db: Database): Promise<void> {
        console.log('[FullSync] Starting full sync...');

        try {
            // 1. Sync current user / session
            const me = await httpGet(this.apiUrl, '/auth/me', this.token);
            sessionRepo.saveSession(db, {
                user_id: me.id,
                email: me.email,
                full_name: me.full_name,
                is_superuser: me.is_superuser,
                totp_enabled: me.totp_enabled,
                token: this.token,
                cached_at: new Date().toISOString(),
            });
            usersRepo.upsertUser(db, me);

            // 2. Sync projects list
            const projects: any[] = await httpGet(this.apiUrl, '/projects/', this.token);
            for (const p of projects) {
                // Skip if there are pending local changes
                if (syncQueueRepo.hasPendingForResource(db, `/projects/${p.id}`)) continue;
                projectsRepo.upsertProject(db, p);
            }

            // 3. Sync each project's details (server links, db links, components, accesses)
            for (const p of projects) {
                if (syncQueueRepo.hasPendingForResource(db, `/projects/${p.id}`)) continue;
                try {
                    const detail = await httpGet(this.apiUrl, `/projects/${p.id}`, this.token);

                    // Clear and re-insert links for this project
                    projectsRepo.clearProjectLinks(db, p.id);

                    if (detail.server_links) {
                        for (const link of detail.server_links) {
                            if (link.server) serversRepo.upsertServer(db, link.server);
                            projectsRepo.upsertProjectServerLink(db, p.id, link);
                        }
                    }

                    if (detail.database_links) {
                        for (const link of detail.database_links) {
                            if (link.database_engine) databasesRepo.upsertDatabase(db, link.database_engine);
                            projectsRepo.upsertProjectDatabaseLink(db, p.id, link);
                        }
                    }

                    if (detail.components) {
                        for (const comp of detail.components) {
                            componentsRepo.upsertComponent(db, { ...comp, project_id: p.id });
                        }
                    }

                    if (detail.group_accesses) {
                        for (const acc of detail.group_accesses) {
                            projectsRepo.upsertProjectGroupAccess(db, { ...acc, project_id: p.id });
                        }
                    }

                    if (detail.user_accesses) {
                        for (const acc of detail.user_accesses) {
                            projectsRepo.upsertProjectUserAccess(db, { ...acc, project_id: p.id });
                        }
                    }

                    // Update project with role info from detail
                    if (detail.current_user_role) {
                        db.run('UPDATE projects SET current_user_role = ? WHERE id = ?', [detail.current_user_role, p.id]);
                    }
                } catch (err: any) {
                    if (err.message === 'UNAUTHORIZED') throw err;
                    console.warn(`[FullSync] Failed to sync project detail ${p.id}:`, err.message);
                }
            }

            // 4. Sync global servers
            try {
                const servers: any[] = await httpGet(this.apiUrl, '/servers/', this.token);
                for (const s of servers) {
                    if (syncQueueRepo.hasPendingForResource(db, `/servers/${s.id}`)) continue;
                    serversRepo.upsertServer(db, s);
                }
            } catch (err: any) {
                if (err.message === 'UNAUTHORIZED') throw err;
                console.warn('[FullSync] Failed to sync servers:', err.message);
            }

            // 5. Sync global databases
            try {
                const databases: any[] = await httpGet(this.apiUrl, '/databases/', this.token);
                for (const d of databases) {
                    if (syncQueueRepo.hasPendingForResource(db, `/databases/${d.id}`)) continue;
                    databasesRepo.upsertDatabase(db, d);
                }
            } catch (err: any) {
                if (err.message === 'UNAUTHORIZED') throw err;
                console.warn('[FullSync] Failed to sync databases:', err.message);
            }

            // 6. Sync settings
            try {
                const settings: any[] = await httpGet(this.apiUrl, '/settings/', this.token);
                settingsRepo.bulkUpsertSettings(db, settings);
            } catch (err: any) {
                if (err.message === 'UNAUTHORIZED') throw err;
                console.warn('[FullSync] Failed to sync settings:', err.message);
            }

            // 7. If superuser, sync users and groups
            if (me.is_superuser) {
                try {
                    const users: any[] = await httpGet(this.apiUrl, '/users/', this.token);
                    usersRepo.bulkUpsertUsers(db, users);
                } catch (err: any) {
                    if (err.message === 'UNAUTHORIZED') throw err;
                    console.warn('[FullSync] Failed to sync users:', err.message);
                }

                try {
                    const groups: any[] = await httpGet(this.apiUrl, '/groups/', this.token);
                    usersRepo.bulkUpsertGroups(db, groups);
                } catch (err: any) {
                    if (err.message === 'UNAUTHORIZED') throw err;
                    console.warn('[FullSync] Failed to sync groups:', err.message);
                }
            }

            // Update last sync timestamp
            db.run("INSERT OR REPLACE INTO _sync_meta (key, value) VALUES ('last_full_sync', ?)", [new Date().toISOString()]);
            saveDb();

            console.log('[FullSync] Full sync completed successfully.');
        } catch (err: any) {
            if (err.message === 'UNAUTHORIZED') {
                console.error('[FullSync] Token expired or invalid. Need re-authentication.');
                throw err;
            }
            console.error('[FullSync] Sync failed:', err.message);
            throw err;
        }
    }
}
