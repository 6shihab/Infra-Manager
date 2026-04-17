import uuid
from sqlalchemy import Column, Integer, String, Text, Enum, ForeignKey, Boolean, Table, DateTime
from datetime import datetime, timezone
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.types import JSON, TypeDecorator
from sqlalchemy.orm import relationship
import enum
from app.database import Base
from app.encryption import encryption_service

# --- Encrypted Types for transparent DB storage ---
class EncryptedString(TypeDecorator):
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        return encryption_service.encrypt(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        return encryption_service.decrypt(value)

class EncryptedJSON(TypeDecorator):
    impl = JSON
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if not isinstance(value, dict):
            return value
            
        encrypted_dict = {}
        for k, v in value.items():
            if isinstance(v, str):
                encrypted_dict[k] = encryption_service.encrypt(v)
            else:
                # Store non-strings as encrypted json-strings
                import json
                encrypted_dict[k] = encryption_service.encrypt(json.dumps(v))
        return encrypted_dict

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if not isinstance(value, dict):
            return value

        import json
        decrypted_dict = {}
        for k, v in value.items():
            if not isinstance(v, str):
                # Non-string values (int, bool, float, list, None) pass through as-is
                decrypted_dict[k] = v
            elif v.startswith('gAAAAAB'):
                # Fernet-encrypted token — decrypt and try to restore original type
                decrypted_val = encryption_service.decrypt(v)
                try:
                    decrypted_dict[k] = json.loads(decrypted_val)
                except (json.JSONDecodeError, ValueError):
                    decrypted_dict[k] = decrypted_val
            else:
                # Plain string that wasn't encrypted (edge case / legacy data)
                decrypted_dict[k] = v
        return decrypted_dict

# Cross-database JSON support (SQLite JSON vs Postgres JSONB)
@compiles(JSON, "sqlite")
def compile_json_sqlite(type_, compiler, **kw):
    return "JSON"

@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"

class EnvironmentEnum(str, enum.Enum):
    dev = "Dev"
    staging = "Staging"
    prod = "Prod"

class AccessLevelEnum(str, enum.Enum):
    VIEWER = "Viewer"
    EDITOR = "Editor"
    ADMIN = "Admin"

class WebhookTypeEnum(str, enum.Enum):
    slack = "slack"
    teams = "teams"
    generic = "generic"

# --- RBAC Models ---

user_group_link = Table(
    'user_group_link',
    Base.metadata,
    Column('user_id', PgUUID(as_uuid=True), ForeignKey('users.id', ondelete="CASCADE"), primary_key=True),
    Column('group_id', PgUUID(as_uuid=True), ForeignKey('groups.id', ondelete="CASCADE"), primary_key=True)
)

webhook_projects = Table(
    "webhook_projects",
    Base.metadata,
    Column("webhook_id", PgUUID(as_uuid=True), ForeignKey("webhooks.id", ondelete="CASCADE"), primary_key=True),
    Column("project_id", PgUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
)

class User(Base):
    __tablename__ = "users"
    id = Column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    keycloak_id = Column(String, unique=True, nullable=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    totp_secret = Column(EncryptedString, nullable=True)
    totp_enabled = Column(Boolean, default=False)
    totp_backup_codes = Column(JSON, nullable=True)

    groups = relationship("Group", secondary=user_group_link, back_populates="users")
    created_projects = relationship("Project", back_populates="creator", foreign_keys="Project.created_by")
    webauthn_credentials = relationship("WebAuthnCredential", back_populates="user", cascade="all, delete-orphan")

class Group(Base):
    __tablename__ = "groups"
    id = Column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String)
    
    users = relationship("User", secondary=user_group_link, back_populates="groups")
    project_accesses = relationship("ProjectGroupAccess", back_populates="group", cascade="all, delete-orphan")

class ProjectGroupAccess(Base):
    __tablename__ = "project_group_access"
    id = Column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(PgUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    group_id = Column(PgUUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    access_level = Column(Enum(AccessLevelEnum), default=AccessLevelEnum.VIEWER, nullable=False)

    project = relationship("Project", back_populates="group_accesses")
    group = relationship("Group", back_populates="project_accesses")

class ProjectUserAccess(Base):
    __tablename__ = "project_user_access"
    id = Column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(PgUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    access_level = Column(Enum(AccessLevelEnum), default=AccessLevelEnum.VIEWER, nullable=False)

    project = relationship("Project", back_populates="user_accesses")
    user = relationship("User")

class Webhook(Base):
    __tablename__ = "webhooks"

    id = Column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String(256), nullable=False)
    url = Column(String(2048), nullable=False)
    type = Column(Enum(WebhookTypeEnum), nullable=False)
    events = Column(JSON, nullable=False)
    is_active = Column(Boolean, default=True)
    secret = Column(EncryptedString, nullable=True)
    created_by = Column(PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)
    last_status_code = Column(Integer, nullable=True)
    last_error = Column(String(500), nullable=True)

    creator = relationship("User", foreign_keys=[created_by])
    projects = relationship("Project", secondary="webhook_projects")

# --- Infrastructure Models ---

class ProjectFolder(Base):
    __tablename__ = "project_folders"

    id = Column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String(200), nullable=False)
    color = Column(String(7), nullable=True)  # hex like "#3B82F6"
    position = Column(Integer, default=0)
    parent_id = Column(PgUUID(as_uuid=True), ForeignKey("project_folders.id", ondelete="CASCADE"), nullable=True, index=True)
    created_by = Column(PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Soft Delete
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)

    children = relationship("ProjectFolder", back_populates="parent", cascade="all, delete-orphan")
    parent = relationship("ProjectFolder", back_populates="children", remote_side=[id])
    projects = relationship("Project", back_populates="folder")
    creator = relationship("User", foreign_keys=[created_by])

class Project(Base):
    __tablename__ = "projects"

    id = Column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String)
    primary_domain = Column(String)
    environment = Column(Enum(EnvironmentEnum), default=EnvironmentEnum.dev)
    deployment_note = Column(Text, nullable=True)
    folder_id = Column(PgUUID(as_uuid=True), ForeignKey("project_folders.id", ondelete="SET NULL"), nullable=True, index=True)

    # Uptime Monitoring
    is_online = Column(Boolean, nullable=True)
    last_checked_at = Column(DateTime, nullable=True)

    # Soft Delete
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)

    # Creator tracking
    created_by = Column(PgUUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    folder = relationship("ProjectFolder", back_populates="projects")
    servers = relationship("Server", secondary="project_server", back_populates="projects")
    databases = relationship("DatabaseEngine", secondary="project_database", back_populates="projects")
    server_links = relationship("ProjectServer", back_populates="project", cascade="all, delete-orphan")
    database_links = relationship("ProjectDatabase", back_populates="project", cascade="all, delete-orphan")
    components = relationship("Component", back_populates="project", cascade="all, delete-orphan")
    group_accesses = relationship("ProjectGroupAccess", back_populates="project", cascade="all, delete-orphan")
    user_accesses = relationship("ProjectUserAccess", back_populates="project", cascade="all, delete-orphan")
    creator = relationship("User", back_populates="created_projects", foreign_keys=[created_by])

class ProjectServer(Base):
    __tablename__ = "project_server"
    project_id = Column(PgUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    server_id = Column(PgUUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), primary_key=True)
    
    # Optional Specific Credentials for this project 
    username = Column(String, nullable=True)
    password = Column(EncryptedString, nullable=True)
    ssh_key = Column(EncryptedString, nullable=True)

    project = relationship("Project", back_populates="server_links")
    server = relationship("Server", back_populates="project_links")

class Server(Base):
    __tablename__ = "servers"

    id = Column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, index=True, nullable=False)
    ip_address = Column(String, nullable=False)
    os = Column(String)
    region = Column(String)

    # Uptime Monitoring
    is_online = Column(Boolean, nullable=True)
    last_checked_at = Column(DateTime, nullable=True)

    # Default Credentials
    username = Column(String, nullable=True)
    password = Column(EncryptedString, nullable=True)
    ssh_key = Column(EncryptedString, nullable=True)

    # Soft Delete
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)

    # Ownership
    created_by = Column(PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    creator = relationship("User", foreign_keys=[created_by])

    projects = relationship("Project", secondary="project_server", back_populates="servers")
    project_links = relationship("ProjectServer", back_populates="server", cascade="all, delete-orphan")

class ProjectDatabase(Base):
    __tablename__ = "project_database"
    project_id = Column(PgUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    database_engine_id = Column(PgUUID(as_uuid=True), ForeignKey("database_engines.id", ondelete="CASCADE"), primary_key=True)
    
    # Specifics for this project
    db_name = Column(String, nullable=False)
    # Optional overridden credentials
    username = Column(String, nullable=True)
    password = Column(EncryptedString, nullable=True)

    project = relationship("Project", back_populates="database_links")
    database_engine = relationship("DatabaseEngine", back_populates="project_links")

class DatabaseEngine(Base):
    __tablename__ = "database_engines"

    id = Column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, index=True, nullable=False)
    engine = Column(String, nullable=False) # Postgres, MySQL, etc.
    host = Column(String, nullable=False)
    port = Column(Integer)
    connection_string_format = Column(String) # e.g. postgresql://{user}:{pass}@{host}:{port}/{db}

    # Default Credentials
    username = Column(String, nullable=True)
    password = Column(EncryptedString, nullable=True)

    # Soft Delete
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)

    # Ownership
    created_by = Column(PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    creator = relationship("User", foreign_keys=[created_by])

    projects = relationship("Project", secondary="project_database", back_populates="databases")
    project_links = relationship("ProjectDatabase", back_populates="database_engine", cascade="all, delete-orphan")

class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)
    description = Column(String, nullable=True)

class Component(Base):
    __tablename__ = "components"

    id = Column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, nullable=False) # e.g. "Main Assets Bucket"
    type = Column(String, nullable=False) # e.g. "S3 Bucket", "Redis Cache", "DNS Record"
    custom_fields = Column(EncryptedJSON, default=dict) # Handles arbitrary key-value pairs natively, fully encrypted
    project_id = Column(PgUUID(as_uuid=True), ForeignKey("projects.id"), index=True)

    # Soft Delete
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)

    project = relationship("Project", back_populates="components")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String, nullable=False, index=True) # e.g. 'CREATED', 'DELETED', 'REVEALED'
    resource_type = Column(String, nullable=False, index=True) # e.g. 'Project', 'Server'
    resource_name = Column(String, nullable=True) # e.g. "My Project" or "10.0.0.1"
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    user = relationship("User")

class TokenBlocklist(Base):
    __tablename__ = "token_blocklist"
    id = Column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    jti = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class WebAuthnCredential(Base):
    __tablename__ = "webauthn_credentials"

    id = Column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    credential_id = Column(String, unique=True, nullable=False, index=True)
    public_key = Column(EncryptedString, nullable=False)
    sign_count = Column(Integer, default=0, nullable=False)
    transports = Column(JSON, nullable=True)
    device_name = Column(String(256), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="webauthn_credentials")
