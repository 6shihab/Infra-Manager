import { Database } from 'sql.js';
import * as projectsRepo from '../db/repositories/projects';
import * as serversRepo from '../db/repositories/servers';
import * as databasesRepo from '../db/repositories/databases';
import * as componentsRepo from '../db/repositories/components';
import * as usersRepo from '../db/repositories/users';
import * as settingsRepo from '../db/repositories/settings';
import * as syncQueueRepo from '../db/repositories/syncQueue';
import * as sessionRepo from '../db/repositories/session';

interface OfflineRequest {
    method: string;
    endpoint: string;
    body?: any;
}

interface OfflineResponse {
    data: any;
    status: number;
    headers?: Record<string, string>;
}

// Parse route params from endpoint patterns
function matchRoute(endpoint: string, pattern: string): Record<string, string> | null {
    // Normalize: strip trailing slashes and query strings
    const cleanEndpoint = endpoint.split('?')[0].replace(/\/+$/, '');
    const cleanPattern = pattern.replace(/\/+$/, '');

    const patternParts = cleanPattern.split('/');
    const endpointParts = cleanEndpoint.split('/');

    if (patternParts.length !== endpointParts.length) return null;

    const params: Record<string, string> = {};
    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
            params[patternParts[i].slice(1)] = endpointParts[i];
        } else if (patternParts[i] !== endpointParts[i]) {
            return null;
        }
    }
    return params;
}

// Parse query string params
function parseQuery(endpoint: string): Record<string, string> {
    const qIdx = endpoint.indexOf('?');
    if (qIdx === -1) return {};
    const qs = endpoint.slice(qIdx + 1);
    const params: Record<string, string> = {};
    for (const pair of qs.split('&')) {
        const [k, v] = pair.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
    return params;
}

/** Get the cached session's user info for RBAC checks */
function getCurrentUser(db: Database): { user_id: string; is_superuser: boolean } | null {
    const session = sessionRepo.getSession(db);
    if (!session) return null;
    return { user_id: session.user_id, is_superuser: session.is_superuser };
}

/** Check if user can mutate a project (Editor or Admin role required) */
function canEditProject(db: Database, projectId: string, userId: string, isSuperuser: boolean): boolean {
    if (isSuperuser) return true;
    const result = db.exec('SELECT current_user_role, created_by FROM projects WHERE id = ?', [projectId]);
    if (result.length === 0 || result[0].values.length === 0) return false;
    const role = result[0].values[0][0] as string | null;
    const createdBy = result[0].values[0][1] as string | null;
    if (createdBy === userId) return true;
    return role === 'Editor' || role === 'Admin';
}

/** Check if user can delete a project (Admin role required) */
function canDeleteProject(db: Database, projectId: string, userId: string, isSuperuser: boolean): boolean {
    if (isSuperuser) return true;
    const result = db.exec('SELECT current_user_role, created_by FROM projects WHERE id = ?', [projectId]);
    if (result.length === 0 || result[0].values.length === 0) return false;
    const role = result[0].values[0][0] as string | null;
    const createdBy = result[0].values[0][1] as string | null;
    if (createdBy === userId) return true;
    return role === 'Admin';
}

/** Check cached can_edit flag on a server */
function canEditServer(db: Database, serverId: string, isSuperuser: boolean): boolean {
    if (isSuperuser) return true;
    const result = db.exec('SELECT can_edit FROM servers WHERE id = ?', [serverId]);
    if (result.length === 0 || result[0].values.length === 0) return false;
    return (result[0].values[0][0] as number) === 1;
}

/** Check cached can_delete flag on a server */
function canDeleteServer(db: Database, serverId: string, isSuperuser: boolean): boolean {
    if (isSuperuser) return true;
    const result = db.exec('SELECT can_delete FROM servers WHERE id = ?', [serverId]);
    if (result.length === 0 || result[0].values.length === 0) return false;
    return (result[0].values[0][0] as number) === 1;
}

/** Check cached can_edit flag on a database engine */
function canEditDatabase(db: Database, engineId: string, isSuperuser: boolean): boolean {
    if (isSuperuser) return true;
    const result = db.exec('SELECT can_edit FROM database_engines WHERE id = ?', [engineId]);
    if (result.length === 0 || result[0].values.length === 0) return false;
    return (result[0].values[0][0] as number) === 1;
}

/** Check cached can_delete flag on a database engine */
function canDeleteDatabase(db: Database, engineId: string, isSuperuser: boolean): boolean {
    if (isSuperuser) return true;
    const result = db.exec('SELECT can_delete FROM database_engines WHERE id = ?', [engineId]);
    if (result.length === 0 || result[0].values.length === 0) return false;
    return (result[0].values[0][0] as number) === 1;
}

const FORBIDDEN: OfflineResponse = { data: { detail: 'Not enough permissions' }, status: 403 };

export function offlineApiDispatcher(db: Database, request: OfflineRequest): OfflineResponse {
    const { method, endpoint, body } = request;
    const m = method.toUpperCase();
    let params: Record<string, string> | null;

    try {
        // ===== AUTH =====
        if (m === 'GET' && matchRoute(endpoint, '/auth/me')) {
            const session = sessionRepo.getSession(db);
            if (!session) return { data: { detail: 'Not authenticated' }, status: 401 };
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
                if (!project) return { data: { detail: 'Not found' }, status: 404 };
                return { data: project, status: 200 };
            }
            if (m === 'PUT') {
                const user = getCurrentUser(db);
                if (!user || !canEditProject(db, params.id, user.user_id, user.is_superuser)) return FORBIDDEN;
                const updated = projectsRepo.updateProject(db, params.id, body);
                syncQueueRepo.enqueue(db, 'PUT', `/projects/${params.id}`, body);
                return { data: updated, status: 200 };
            }
            if (m === 'DELETE') {
                const user = getCurrentUser(db);
                if (!user || !canDeleteProject(db, params.id, user.user_id, user.is_superuser)) return FORBIDDEN;
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
            const user = getCurrentUser(db);
            if (!user || !canEditProject(db, params.id, user.user_id, user.is_superuser)) return FORBIDDEN;
            const serverId = body.server_id;
            projectsRepo.upsertProjectServerLink(db, params.id, body);
            syncQueueRepo.enqueue(db, 'POST', `/projects/${params.id}/servers`, body);
            return { data: { project_id: params.id, server_id: serverId }, status: 201 };
        }

        params = matchRoute(endpoint, '/projects/:id/servers/:serverId');
        if (params && m === 'DELETE') {
            const user = getCurrentUser(db);
            if (!user || !canDeleteProject(db, params.id, user.user_id, user.is_superuser)) return FORBIDDEN;
            projectsRepo.deleteProjectServerLink(db, params.id, params.serverId);
            syncQueueRepo.enqueue(db, 'DELETE', `/projects/${params.id}/servers/${params.serverId}`);
            return { data: { detail: 'Detached' }, status: 200 };
        }

        // ===== PROJECT DATABASE LINKS =====
        params = matchRoute(endpoint, '/projects/:id/databases');
        if (params && m === 'POST') {
            const user = getCurrentUser(db);
            if (!user || !canEditProject(db, params.id, user.user_id, user.is_superuser)) return FORBIDDEN;
            projectsRepo.upsertProjectDatabaseLink(db, params.id, body);
            syncQueueRepo.enqueue(db, 'POST', `/projects/${params.id}/databases`, body);
            return { data: { project_id: params.id, database_engine_id: body.database_engine_id }, status: 201 };
        }

        params = matchRoute(endpoint, '/projects/:id/databases/:dbEngineId');
        if (params && m === 'DELETE') {
            const user = getCurrentUser(db);
            if (!user || !canDeleteProject(db, params.id, user.user_id, user.is_superuser)) return FORBIDDEN;
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
            if (!creds) return { data: { detail: 'Not found or credentials not cached' }, status: 404 };
            if (!creds.password && !creds.ssh_key) {
                return { data: { detail: 'Credentials not available offline' }, status: 404 };
            }
            return { data: creds, status: 200 };
        }

        params = matchRoute(endpoint, '/servers/:id');
        if (params) {
            if (m === 'GET') {
                const server = serversRepo.getServerById(db, params.id);
                if (!server) return { data: { detail: 'Not found' }, status: 404 };
                return { data: server, status: 200 };
            }
            if (m === 'PUT') {
                const user = getCurrentUser(db);
                if (!user || !canEditServer(db, params.id, user.is_superuser)) return FORBIDDEN;
                const updated = serversRepo.updateServer(db, params.id, body);
                syncQueueRepo.enqueue(db, 'PUT', `/servers/${params.id}`, body);
                return { data: updated, status: 200 };
            }
            if (m === 'DELETE') {
                const user = getCurrentUser(db);
                if (!user || !canDeleteServer(db, params.id, user.is_superuser)) return FORBIDDEN;
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
            if (!creds) return { data: { detail: 'Not found or credentials not cached' }, status: 404 };
            if (!creds.password) {
                return { data: { detail: 'Credentials not available offline' }, status: 404 };
            }
            return { data: creds, status: 200 };
        }

        params = matchRoute(endpoint, '/databases/:id');
        if (params) {
            if (m === 'GET') {
                const engine = databasesRepo.getDatabaseById(db, params.id);
                if (!engine) return { data: { detail: 'Not found' }, status: 404 };
                return { data: engine, status: 200 };
            }
            if (m === 'PUT') {
                const user = getCurrentUser(db);
                if (!user || !canEditDatabase(db, params.id, user.is_superuser)) return FORBIDDEN;
                const updated = databasesRepo.updateDatabase(db, params.id, body);
                syncQueueRepo.enqueue(db, 'PUT', `/databases/${params.id}`, body);
                return { data: updated, status: 200 };
            }
            if (m === 'DELETE') {
                const user = getCurrentUser(db);
                if (!user || !canDeleteDatabase(db, params.id, user.is_superuser)) return FORBIDDEN;
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
                if (!comp) return { data: { detail: 'Not found' }, status: 404 };
                return { data: comp, status: 200 };
            }
            if (m === 'PUT') {
                const user = getCurrentUser(db);
                // Component edit requires Editor/Admin on its parent project
                const comp = componentsRepo.getComponentById(db, params.id);
                if (!user || !comp || !canEditProject(db, comp.project_id, user.user_id, user.is_superuser)) return FORBIDDEN;
                const updated = componentsRepo.updateComponent(db, params.id, body);
                syncQueueRepo.enqueue(db, 'PUT', `/components/${params.id}`, body);
                return { data: updated, status: 200 };
            }
            if (m === 'DELETE') {
                const user = getCurrentUser(db);
                // Component delete requires Admin on its parent project
                const comp = componentsRepo.getComponentById(db, params.id);
                if (!user || !comp || !canDeleteProject(db, comp.project_id, user.user_id, user.is_superuser)) return FORBIDDEN;
                componentsRepo.softDeleteComponent(db, params.id);
                syncQueueRepo.enqueue(db, 'DELETE', `/components/${params.id}`);
                return { data: { detail: 'Deleted' }, status: 200 };
            }
        }

        if (m === 'POST' && matchRoute(endpoint, '/components')) {
            const user = getCurrentUser(db);
            if (!user || !body.project_id || !canEditProject(db, body.project_id, user.user_id, user.is_superuser)) return FORBIDDEN;
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
            if (!user) return { data: { detail: 'Not found' }, status: 404 };
            return { data: user, status: 200 };
        }

        // ===== GROUPS (read-only offline) =====
        if (m === 'GET' && matchRoute(endpoint, '/groups')) {
            return { data: usersRepo.listGroups(db), status: 200 };
        }

        params = matchRoute(endpoint, '/groups/:id');
        if (params && m === 'GET') {
            const group = usersRepo.getGroupById(db, params.id);
            if (!group) return { data: { detail: 'Not found' }, status: 404 };
            return { data: group, status: 200 };
        }

        // ===== SETTINGS =====
        if (m === 'GET' && matchRoute(endpoint, '/settings')) {
            return { data: settingsRepo.listSettings(db), status: 200 };
        }

        params = matchRoute(endpoint, '/settings/:key');
        if (params && m === 'PUT') {
            const user = getCurrentUser(db);
            if (!user || !user.is_superuser) return FORBIDDEN;
            settingsRepo.upsertSetting(db, params.key, body.value, body.description);
            syncQueueRepo.enqueue(db, 'PUT', `/settings/${params.key}`, body);
            return { data: { key: params.key, value: body.value }, status: 200 };
        }

        // ===== WEBAUTHN / PASSKEYS (online-only) =====
        if (endpoint.startsWith('/auth/webauthn')) {
            return { data: { detail: 'Passkey operations require an active connection.' }, status: 403 };
        }

        // ===== TOTP (online-only) =====
        if (endpoint.startsWith('/auth/totp')) {
            return { data: { detail: 'Two-factor authentication operations require an active connection.' }, status: 403 };
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

    } catch (err: any) {
        console.error(`[Offline API] Error handling ${m} ${endpoint}:`, err);
        return { data: { detail: err.message || 'Internal offline error' }, status: 500 };
    }
}
