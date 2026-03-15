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
const syncLogRepo = __importStar(require("../db/repositories/syncLog"));
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
        try {
            // 1. Sync current user / session
            syncLogRepo.addLog(db, 'info', 'Syncing user session...');
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
            (0, index_1.saveDb)();
            // 2. Sync projects list
            syncLogRepo.addLog(db, 'info', 'Syncing projects...');
            const projects = await httpGet(this.apiUrl, '/projects/', this.token);
            let projectCount = 0;
            for (const p of projects) {
                if (syncQueueRepo.hasPendingForResource(db, `/projects/${p.id}`))
                    continue;
                projectsRepo.upsertProject(db, p);
                projectCount++;
            }
            syncLogRepo.addLog(db, 'info', `Synced ${projectCount} projects`);
            (0, index_1.saveDb)();
            // 3. Sync each project's details
            for (const p of projects) {
                if (syncQueueRepo.hasPendingForResource(db, `/projects/${p.id}`))
                    continue;
                try {
                    const detail = await httpGet(this.apiUrl, `/projects/${p.id}`, this.token);
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
                    if (detail.current_user_role) {
                        db.run('UPDATE projects SET current_user_role = ? WHERE id = ?', [detail.current_user_role, p.id]);
                    }
                }
                catch (err) {
                    if (err.message === 'UNAUTHORIZED')
                        throw err;
                    syncLogRepo.addLog(db, 'warn', `Failed to sync project "${p.name}": ${err.message}`);
                }
            }
            (0, index_1.saveDb)();
            // 4. Sync global servers
            try {
                syncLogRepo.addLog(db, 'info', 'Syncing servers...');
                const servers = await httpGet(this.apiUrl, '/servers/', this.token);
                let serverCount = 0;
                for (const s of servers) {
                    if (syncQueueRepo.hasPendingForResource(db, `/servers/${s.id}`))
                        continue;
                    serversRepo.upsertServer(db, s);
                    serverCount++;
                }
                syncLogRepo.addLog(db, 'info', `Synced ${serverCount} servers`);
                (0, index_1.saveDb)();
            }
            catch (err) {
                if (err.message === 'UNAUTHORIZED')
                    throw err;
                syncLogRepo.addLog(db, 'warn', `Failed to sync servers: ${err.message}`);
            }
            // 5. Sync global databases
            try {
                syncLogRepo.addLog(db, 'info', 'Syncing databases...');
                const databases = await httpGet(this.apiUrl, '/databases/', this.token);
                let dbCount = 0;
                for (const d of databases) {
                    if (syncQueueRepo.hasPendingForResource(db, `/databases/${d.id}`))
                        continue;
                    databasesRepo.upsertDatabase(db, d);
                    dbCount++;
                }
                syncLogRepo.addLog(db, 'info', `Synced ${dbCount} databases`);
                (0, index_1.saveDb)();
            }
            catch (err) {
                if (err.message === 'UNAUTHORIZED')
                    throw err;
                syncLogRepo.addLog(db, 'warn', `Failed to sync databases: ${err.message}`);
            }
            // 6. Sync settings
            try {
                const settings = await httpGet(this.apiUrl, '/settings/', this.token);
                settingsRepo.bulkUpsertSettings(db, settings);
                syncLogRepo.addLog(db, 'info', `Synced ${settings.length} settings`);
                (0, index_1.saveDb)();
            }
            catch (err) {
                if (err.message === 'UNAUTHORIZED')
                    throw err;
                syncLogRepo.addLog(db, 'warn', `Failed to sync settings: ${err.message}`);
            }
            // 7. If superuser, sync users and groups
            if (me.is_superuser) {
                try {
                    const users = await httpGet(this.apiUrl, '/users/', this.token);
                    usersRepo.bulkUpsertUsers(db, users);
                    syncLogRepo.addLog(db, 'info', `Synced ${users.length} users`);
                    (0, index_1.saveDb)();
                }
                catch (err) {
                    if (err.message === 'UNAUTHORIZED')
                        throw err;
                    syncLogRepo.addLog(db, 'warn', `Failed to sync users: ${err.message}`);
                }
                try {
                    const groups = await httpGet(this.apiUrl, '/groups/', this.token);
                    usersRepo.bulkUpsertGroups(db, groups);
                    syncLogRepo.addLog(db, 'info', `Synced ${groups.length} groups`);
                    (0, index_1.saveDb)();
                }
                catch (err) {
                    if (err.message === 'UNAUTHORIZED')
                        throw err;
                    syncLogRepo.addLog(db, 'warn', `Failed to sync groups: ${err.message}`);
                }
            }
            // Update last sync timestamp
            db.run("INSERT OR REPLACE INTO _sync_meta (key, value) VALUES ('last_full_sync', ?)", [new Date().toISOString()]);
            (0, index_1.saveDb)();
        }
        catch (err) {
            if (err.message === 'UNAUTHORIZED') {
                syncLogRepo.addLog(db, 'error', 'Token expired or invalid — need re-authentication');
                (0, index_1.saveDb)();
                throw err;
            }
            syncLogRepo.addLog(db, 'error', `Sync failed: ${err.message}`);
            (0, index_1.saveDb)();
            throw err;
        }
    }
}
exports.FullSync = FullSync;
