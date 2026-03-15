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
exports.offlineApiDispatcher = offlineApiDispatcher;
const projectsRepo = __importStar(require("../db/repositories/projects"));
const serversRepo = __importStar(require("../db/repositories/servers"));
const databasesRepo = __importStar(require("../db/repositories/databases"));
const componentsRepo = __importStar(require("../db/repositories/components"));
const usersRepo = __importStar(require("../db/repositories/users"));
const settingsRepo = __importStar(require("../db/repositories/settings"));
const syncQueueRepo = __importStar(require("../db/repositories/syncQueue"));
const sessionRepo = __importStar(require("../db/repositories/session"));
// Parse route params from endpoint patterns
function matchRoute(endpoint, pattern) {
    // Normalize: strip trailing slashes and query strings
    const cleanEndpoint = endpoint.split('?')[0].replace(/\/+$/, '');
    const cleanPattern = pattern.replace(/\/+$/, '');
    const patternParts = cleanPattern.split('/');
    const endpointParts = cleanEndpoint.split('/');
    if (patternParts.length !== endpointParts.length)
        return null;
    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
            params[patternParts[i].slice(1)] = endpointParts[i];
        }
        else if (patternParts[i] !== endpointParts[i]) {
            return null;
        }
    }
    return params;
}
// Parse query string params
function parseQuery(endpoint) {
    const qIdx = endpoint.indexOf('?');
    if (qIdx === -1)
        return {};
    const qs = endpoint.slice(qIdx + 1);
    const params = {};
    for (const pair of qs.split('&')) {
        const [k, v] = pair.split('=');
        if (k)
            params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
    return params;
}
function offlineApiDispatcher(db, request) {
    const { method, endpoint, body } = request;
    const m = method.toUpperCase();
    let params;
    try {
        // ===== AUTH =====
        if (m === 'GET' && matchRoute(endpoint, '/auth/me')) {
            const session = sessionRepo.getSession(db);
            if (!session)
                return { data: { detail: 'Not authenticated' }, status: 401 };
            return {
                data: {
                    id: session.user_id,
                    email: session.email,
                    full_name: session.full_name,
                    is_superuser: session.is_superuser,
                    totp_enabled: session.totp_enabled,
                },
                status: 200,
            };
        }
        // ===== PROJECTS =====
        if (m === 'GET' && matchRoute(endpoint, '/projects')) {
            return { data: projectsRepo.listProjects(db), status: 200 };
        }
        params = matchRoute(endpoint, '/projects/:id');
        if (params) {
            if (m === 'GET') {
                const project = projectsRepo.getProjectById(db, params.id);
                if (!project)
                    return { data: { detail: 'Not found' }, status: 404 };
                return { data: project, status: 200 };
            }
            if (m === 'PUT') {
                const updated = projectsRepo.updateProject(db, params.id, body);
                syncQueueRepo.enqueue(db, 'PUT', `/projects/${params.id}`, body);
                return { data: updated, status: 200 };
            }
            if (m === 'DELETE') {
                projectsRepo.softDeleteProject(db, params.id);
                syncQueueRepo.enqueue(db, 'DELETE', `/projects/${params.id}`);
                return { data: { detail: 'Deleted' }, status: 200 };
            }
        }
        if (m === 'POST' && matchRoute(endpoint, '/projects')) {
            const created = projectsRepo.createProject(db, body);
            syncQueueRepo.enqueue(db, 'POST', '/projects/', body, created.id);
            return { data: created, status: 201 };
        }
        // ===== PROJECT SERVER LINKS =====
        params = matchRoute(endpoint, '/projects/:id/servers');
        if (params && m === 'POST') {
            const serverId = body.server_id;
            projectsRepo.upsertProjectServerLink(db, params.id, body);
            syncQueueRepo.enqueue(db, 'POST', `/projects/${params.id}/servers`, body);
            return { data: { project_id: params.id, server_id: serverId }, status: 201 };
        }
        params = matchRoute(endpoint, '/projects/:id/servers/:serverId');
        if (params && m === 'DELETE') {
            projectsRepo.deleteProjectServerLink(db, params.id, params.serverId);
            syncQueueRepo.enqueue(db, 'DELETE', `/projects/${params.id}/servers/${params.serverId}`);
            return { data: { detail: 'Detached' }, status: 200 };
        }
        // ===== PROJECT DATABASE LINKS =====
        params = matchRoute(endpoint, '/projects/:id/databases');
        if (params && m === 'POST') {
            projectsRepo.upsertProjectDatabaseLink(db, params.id, body);
            syncQueueRepo.enqueue(db, 'POST', `/projects/${params.id}/databases`, body);
            return { data: { project_id: params.id, database_engine_id: body.database_engine_id }, status: 201 };
        }
        params = matchRoute(endpoint, '/projects/:id/databases/:dbEngineId');
        if (params && m === 'DELETE') {
            projectsRepo.deleteProjectDatabaseLink(db, params.id, params.dbEngineId);
            syncQueueRepo.enqueue(db, 'DELETE', `/projects/${params.id}/databases/${params.dbEngineId}`);
            return { data: { detail: 'Detached' }, status: 200 };
        }
        // ===== SERVERS =====
        if (m === 'GET' && matchRoute(endpoint, '/servers')) {
            return { data: serversRepo.listServers(db), status: 200 };
        }
        params = matchRoute(endpoint, '/servers/:id/credentials');
        if (params && m === 'GET') {
            const creds = serversRepo.getServerCredentials(db, params.id);
            if (!creds)
                return { data: { detail: 'Not found or credentials not cached' }, status: 404 };
            if (!creds.password && !creds.ssh_key) {
                return { data: { detail: 'Credentials not available offline' }, status: 404 };
            }
            return { data: creds, status: 200 };
        }
        params = matchRoute(endpoint, '/servers/:id');
        if (params) {
            if (m === 'GET') {
                const server = serversRepo.getServerById(db, params.id);
                if (!server)
                    return { data: { detail: 'Not found' }, status: 404 };
                return { data: server, status: 200 };
            }
            if (m === 'PUT') {
                const updated = serversRepo.updateServer(db, params.id, body);
                syncQueueRepo.enqueue(db, 'PUT', `/servers/${params.id}`, body);
                return { data: updated, status: 200 };
            }
            if (m === 'DELETE') {
                serversRepo.softDeleteServer(db, params.id);
                syncQueueRepo.enqueue(db, 'DELETE', `/servers/${params.id}`);
                return { data: { detail: 'Deleted' }, status: 200 };
            }
        }
        if (m === 'POST' && matchRoute(endpoint, '/servers')) {
            const created = serversRepo.createServer(db, body);
            syncQueueRepo.enqueue(db, 'POST', '/servers/', body, created.id);
            return { data: created, status: 201 };
        }
        // ===== DATABASES =====
        if (m === 'GET' && matchRoute(endpoint, '/databases')) {
            return { data: databasesRepo.listDatabases(db), status: 200 };
        }
        params = matchRoute(endpoint, '/databases/:id/credentials');
        if (params && m === 'GET') {
            const creds = databasesRepo.getDatabaseCredentials(db, params.id);
            if (!creds)
                return { data: { detail: 'Not found or credentials not cached' }, status: 404 };
            if (!creds.password) {
                return { data: { detail: 'Credentials not available offline' }, status: 404 };
            }
            return { data: creds, status: 200 };
        }
        params = matchRoute(endpoint, '/databases/:id');
        if (params) {
            if (m === 'GET') {
                const engine = databasesRepo.getDatabaseById(db, params.id);
                if (!engine)
                    return { data: { detail: 'Not found' }, status: 404 };
                return { data: engine, status: 200 };
            }
            if (m === 'PUT') {
                const updated = databasesRepo.updateDatabase(db, params.id, body);
                syncQueueRepo.enqueue(db, 'PUT', `/databases/${params.id}`, body);
                return { data: updated, status: 200 };
            }
            if (m === 'DELETE') {
                databasesRepo.softDeleteDatabase(db, params.id);
                syncQueueRepo.enqueue(db, 'DELETE', `/databases/${params.id}`);
                return { data: { detail: 'Deleted' }, status: 200 };
            }
        }
        if (m === 'POST' && matchRoute(endpoint, '/databases')) {
            const created = databasesRepo.createDatabase(db, body);
            syncQueueRepo.enqueue(db, 'POST', '/databases/', body, created.id);
            return { data: created, status: 201 };
        }
        // ===== COMPONENTS =====
        if (m === 'GET' && matchRoute(endpoint, '/components')) {
            return { data: componentsRepo.listComponents(db), status: 200 };
        }
        params = matchRoute(endpoint, '/components/:id');
        if (params) {
            if (m === 'GET') {
                const comp = componentsRepo.getComponentById(db, params.id);
                if (!comp)
                    return { data: { detail: 'Not found' }, status: 404 };
                return { data: comp, status: 200 };
            }
            if (m === 'PUT') {
                const updated = componentsRepo.updateComponent(db, params.id, body);
                syncQueueRepo.enqueue(db, 'PUT', `/components/${params.id}`, body);
                return { data: updated, status: 200 };
            }
            if (m === 'DELETE') {
                componentsRepo.softDeleteComponent(db, params.id);
                syncQueueRepo.enqueue(db, 'DELETE', `/components/${params.id}`);
                return { data: { detail: 'Deleted' }, status: 200 };
            }
        }
        if (m === 'POST' && matchRoute(endpoint, '/components')) {
            const created = componentsRepo.createComponent(db, body);
            syncQueueRepo.enqueue(db, 'POST', '/components/', body, created.id);
            return { data: created, status: 201 };
        }
        // ===== USERS (read-only offline) =====
        if (m === 'GET' && matchRoute(endpoint, '/users')) {
            return { data: usersRepo.listUsers(db), status: 200 };
        }
        params = matchRoute(endpoint, '/users/:id');
        if (params && m === 'GET') {
            const user = usersRepo.getUserById(db, params.id);
            if (!user)
                return { data: { detail: 'Not found' }, status: 404 };
            return { data: user, status: 200 };
        }
        // ===== GROUPS (read-only offline) =====
        if (m === 'GET' && matchRoute(endpoint, '/groups')) {
            return { data: usersRepo.listGroups(db), status: 200 };
        }
        params = matchRoute(endpoint, '/groups/:id');
        if (params && m === 'GET') {
            const group = usersRepo.getGroupById(db, params.id);
            if (!group)
                return { data: { detail: 'Not found' }, status: 404 };
            return { data: group, status: 200 };
        }
        // ===== SETTINGS =====
        if (m === 'GET' && matchRoute(endpoint, '/settings')) {
            return { data: settingsRepo.listSettings(db), status: 200 };
        }
        params = matchRoute(endpoint, '/settings/:key');
        if (params && m === 'PUT') {
            settingsRepo.upsertSetting(db, params.key, body.value, body.description);
            syncQueueRepo.enqueue(db, 'PUT', `/settings/${params.key}`, body);
            return { data: { key: params.key, value: body.value }, status: 200 };
        }
        // ===== AUDIT LOGS (not available offline) =====
        if (m === 'GET' && matchRoute(endpoint, '/audit-logs')) {
            return { data: [], status: 200, headers: { 'x-total-count': '0' } };
        }
        // ===== NOTIFICATIONS (not available offline) =====
        if (matchRoute(endpoint, '/notifications/stream')) {
            return { data: { detail: 'Not available offline' }, status: 503 };
        }
        // ===== HEALTH =====
        if (m === 'GET' && matchRoute(endpoint, '/health')) {
            return { data: { status: 'offline' }, status: 200 };
        }
        // Fallback: unhandled endpoint
        console.warn(`[Offline API] Unhandled: ${m} ${endpoint}`);
        return { data: { detail: `Not available offline: ${m} ${endpoint}` }, status: 503 };
    }
    catch (err) {
        console.error(`[Offline API] Error handling ${m} ${endpoint}:`, err);
        return { data: { detail: err.message || 'Internal offline error' }, status: 500 };
    }
}
