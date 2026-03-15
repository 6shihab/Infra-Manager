"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FullSync = void 0;
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const index_1 = require("../db/index");
const projectsRepo = __importStar(require("../db/repositories/projects"));
const serversRepo = __importStar(require("../db/repositories/servers"));
const databasesRepo = __importStar(require("../db/repositories/databases"));
const componentsRepo = __importStar(require("../db/repositories/components"));
const usersRepo = __importStar(require("../db/repositories/users"));
const settingsRepo = __importStar(require("../db/repositories/settings"));
const sessionRepo = __importStar(require("../db/repositories/session"));
const syncQueueRepo = __importStar(require("../db/repositories/syncQueue"));
/** Simple HTTP GET with Authorization header */
function httpGet(baseUrl, path, token) {
    return new Promise((resolve, reject) => {
        const fullUrl = `${baseUrl.replace(/\/+$/, '')}${path}`;
        const parsed = new URL(fullUrl);
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = lib.request({
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            timeout: 15000,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(JSON.parse(data));
                    }
                    else if (res.statusCode === 401) {
                        reject(new Error('UNAUTHORIZED'));
                    }
                    else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                }
                catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}
class FullSync {
    apiUrl;
    token;
    constructor(apiUrl, token) {
        this.apiUrl = apiUrl;
        this.token = token;
    }
    updateCredentials(apiUrl, token) {
        this.apiUrl = apiUrl;
        this.token = token;
    }
    async run(db) {
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
            const projects = await httpGet(this.apiUrl, '/projects/', this.token);
            for (const p of projects) {
                // Skip if there are pending local changes
                if (syncQueueRepo.hasPendingForResource(db, `/projects/${p.id}`))
                    continue;
                projectsRepo.upsertProject(db, p);
            }
            // 3. Sync each project's details (server links, db links, components, accesses)
            for (const p of projects) {
                if (syncQueueRepo.hasPendingForResource(db, `/projects/${p.id}`))
                    continue;
                try {
                    const detail = await httpGet(this.apiUrl, `/projects/${p.id}`, this.token);
                    // Clear and re-insert links for this project
                    projectsRepo.clearProjectLinks(db, p.id);
                    if (detail.server_links) {
                        for (const link of detail.server_links) {
                            if (link.server)
                                serversRepo.upsertServer(db, link.server);
                            projectsRepo.upsertProjectServerLink(db, p.id, link);
                        }
                    }
                    if (detail.database_links) {
                        for (const link of detail.database_links) {
                            if (link.database_engine)
                                databasesRepo.upsertDatabase(db, link.database_engine);
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
                }
                catch (err) {
                    if (err.message === 'UNAUTHORIZED')
                        throw err;
                    console.warn(`[FullSync] Failed to sync project detail ${p.id}:`, err.message);
                }
            }
            // 4. Sync global servers
            try {
                const servers = await httpGet(this.apiUrl, '/servers/', this.token);
                for (const s of servers) {
                    if (syncQueueRepo.hasPendingForResource(db, `/servers/${s.id}`))
                        continue;
                    serversRepo.upsertServer(db, s);
                }
            }
            catch (err) {
                if (err.message === 'UNAUTHORIZED')
                    throw err;
                console.warn('[FullSync] Failed to sync servers:', err.message);
            }
            // 5. Sync global databases
            try {
                const databases = await httpGet(this.apiUrl, '/databases/', this.token);
                for (const d of databases) {
                    if (syncQueueRepo.hasPendingForResource(db, `/databases/${d.id}`))
                        continue;
                    databasesRepo.upsertDatabase(db, d);
                }
            }
            catch (err) {
                if (err.message === 'UNAUTHORIZED')
                    throw err;
                console.warn('[FullSync] Failed to sync databases:', err.message);
            }
            // 6. Sync settings
            try {
                const settings = await httpGet(this.apiUrl, '/settings/', this.token);
                settingsRepo.bulkUpsertSettings(db, settings);
            }
            catch (err) {
                if (err.message === 'UNAUTHORIZED')
                    throw err;
                console.warn('[FullSync] Failed to sync settings:', err.message);
            }
            // 7. If superuser, sync users and groups
            if (me.is_superuser) {
                try {
                    const users = await httpGet(this.apiUrl, '/users/', this.token);
                    usersRepo.bulkUpsertUsers(db, users);
                }
                catch (err) {
                    if (err.message === 'UNAUTHORIZED')
                        throw err;
                    console.warn('[FullSync] Failed to sync users:', err.message);
                }
                try {
                    const groups = await httpGet(this.apiUrl, '/groups/', this.token);
                    usersRepo.bulkUpsertGroups(db, groups);
                }
                catch (err) {
                    if (err.message === 'UNAUTHORIZED')
                        throw err;
                    console.warn('[FullSync] Failed to sync groups:', err.message);
                }
            }
            // Update last sync timestamp
            db.run("INSERT OR REPLACE INTO _sync_meta (key, value) VALUES ('last_full_sync', ?)", [new Date().toISOString()]);
            (0, index_1.saveDb)();
            console.log('[FullSync] Full sync completed successfully.');
        }
        catch (err) {
            if (err.message === 'UNAUTHORIZED') {
                console.error('[FullSync] Token expired or invalid. Need re-authentication.');
                throw err;
            }
            console.error('[FullSync] Sync failed:', err.message);
            throw err;
        }
    }
}
exports.FullSync = FullSync;
