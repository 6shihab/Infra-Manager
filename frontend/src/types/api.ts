// Shared API response types — mirrors backend Pydantic schemas (backend/app/schemas.py)

// --- Enums ---
export type EnvironmentEnum = 'Dev' | 'Staging' | 'Prod';
export type AccessLevel = 'Viewer' | 'Editor' | 'Admin';

// --- User ---
export interface User {
    id: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
    is_superuser: boolean;
    totp_enabled: boolean;
    has_passkeys: boolean;
}

// --- WebAuthn / Passkey ---
export interface PasskeyCredential {
    id: string;
    credential_id: string;
    device_name: string | null;
    created_at: string;
    last_used_at: string | null;
    transports: string[] | null;
}

// --- Group ---
export interface Group {
    id: string;
    name: string;
    description: string | null;
    users: User[];
}

// --- Access Control ---
export interface ProjectGroupAccess {
    id: string;
    project_id: string;
    group_id: string;
    access_level: AccessLevel;
}

export interface ProjectUserAccess {
    id: string;
    project_id: string;
    user_id: string;
    access_level: AccessLevel;
}

// --- Server ---
export interface Server {
    id: string;
    name: string;
    ip_address: string;
    os: string | null;
    region: string | null;
    username: string | null;
    password: string | null;
    ssh_key: string | null;
    is_online: boolean | null;
    last_checked_at: string | null;
    can_edit: boolean;
    can_delete: boolean;
}

export interface ServerListItem {
    id: string;
    name: string;
    ip_address: string;
    os: string | null;
    region: string | null;
    username: string | null;
    is_online: boolean | null;
    last_checked_at: string | null;
    created_by: string | null;
    can_edit: boolean;
    can_delete: boolean;
}

// --- Database Engine ---
export interface DatabaseEngine {
    id: string;
    name: string;
    engine: string;
    host: string;
    port: number | null;
    connection_string_format: string | null;
    username: string | null;
    password: string | null;
    can_edit: boolean;
    can_delete: boolean;
}

export interface DatabaseEngineListItem {
    id: string;
    name: string;
    engine: string;
    host: string;
    port: number | null;
    connection_string_format: string | null;
    username: string | null;
    created_by: string | null;
    can_edit: boolean;
    can_delete: boolean;
}

// --- Server/Database Links (project-scoped) ---
export interface ServerLink {
    project_id: string;
    server_id: string;
    username: string | null;
    password: string | null;
    ssh_key: string | null;
    server: Server;
}

export interface DatabaseLink {
    project_id: string;
    database_engine_id: string;
    db_name: string;
    username: string | null;
    password: string | null;
    database_engine: DatabaseEngine;
}

// --- Component ---
export interface Component {
    id: string;
    project_id: string;
    name: string;
    type: string;
    custom_fields: Record<string, unknown>;
}

// --- Project Folder ---
export interface ProjectFolder {
    id: string;
    name: string;
    color: string | null;
    position: number;
    parent_id: string | null;
    children: ProjectFolder[];
}

// --- Project ---
export interface ProjectListItem {
    id: string;
    name: string;
    description: string | null;
    primary_domain: string | null;
    environment: EnvironmentEnum;
    is_online: boolean | null;
    last_checked_at: string | null;
    created_by: string | null;
    folder_id: string | null;
    server_count: number;
    database_count: number;
}

export interface Project {
    id: string;
    name: string;
    description: string | null;
    primary_domain: string | null;
    environment: EnvironmentEnum;
    deployment_note: string | null;
    is_online: boolean | null;
    last_checked_at: string | null;
    created_by: string | null;
    folder_id: string | null;
    server_links: ServerLink[];
    database_links: DatabaseLink[];
    components: Component[];
    group_accesses: ProjectGroupAccess[];
    user_accesses: ProjectUserAccess[];
    current_user_role: string | null;
}

export type ProjectDetail = Project;

// --- Audit Log ---
export interface AuditLogEntry {
    id: string;
    user_id: string | null;
    action: string;
    resource_type: string;
    resource_name: string | null;
    timestamp: string;
    user: User | null;
}

// --- Setting ---
export interface Setting {
    key: string;
    value: string;
    description: string | null;
}

// --- Trash ---
export interface TrashItem {
    id: string;
    name: string;
    resource_type: string;
    deleted_at: string;
    days_remaining: number;
    parent_name: string | null;
    parent_id: string | null;
    parent_deleted: boolean;
}

// --- Utility type for Axios error shape ---
export interface ApiError {
    response?: {
        data?: {
            detail?: string | Array<{ msg: string }>;
        };
    };
    code?: string;
    message?: string;
}
