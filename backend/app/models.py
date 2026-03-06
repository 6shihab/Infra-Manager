from sqlalchemy import Column, Integer, String, Enum, ForeignKey, Boolean, Table, DateTime
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB
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
            
        decrypted_dict = {}
        for k, v in value.items():
            if isinstance(v, str) and v.startswith('gAAAAAB'): # Basic check for Fernet token
                decrypted_val = encryption_service.decrypt(v)
                # Try to load it as JSON if it was a non-string initially, else keep string
                try:
                    import json
                    decrypted_dict[k] = json.loads(decrypted_val)
                except:
                    decrypted_dict[k] = decrypted_val
            else:
                decrypted_dict[k] = encryption_service.decrypt(v) if isinstance(v, str) else v
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

# --- RBAC Models ---

user_group_link = Table(
    'user_group_link',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id', ondelete="CASCADE"), primary_key=True),
    Column('group_id', Integer, ForeignKey('groups.id', ondelete="CASCADE"), primary_key=True)
)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    
    groups = relationship("Group", secondary=user_group_link, back_populates="users")

class Group(Base):
    __tablename__ = "groups"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String)
    
    users = relationship("User", secondary=user_group_link, back_populates="groups")
    project_accesses = relationship("ProjectGroupAccess", back_populates="group", cascade="all, delete-orphan")

class ProjectGroupAccess(Base):
    __tablename__ = "project_group_access"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    access_level = Column(Enum(AccessLevelEnum), default=AccessLevelEnum.VIEWER, nullable=False)

    project = relationship("Project", back_populates="group_accesses")
    group = relationship("Group", back_populates="project_accesses")

# --- Infrastructure Models ---

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String)
    primary_domain = Column(String)
    environment = Column(Enum(EnvironmentEnum), default=EnvironmentEnum.dev)

    # Uptime Monitoring
    is_online = Column(Boolean, nullable=True)
    last_checked_at = Column(DateTime, nullable=True)

    servers = relationship("Server", back_populates="project", cascade="all, delete-orphan")
    databases = relationship("DatabaseInfo", back_populates="project", cascade="all, delete-orphan")
    components = relationship("Component", back_populates="project", cascade="all, delete-orphan")
    group_accesses = relationship("ProjectGroupAccess", back_populates="project", cascade="all, delete-orphan")

class Server(Base):
    __tablename__ = "servers"

    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String, nullable=False)
    os = Column(String)
    region = Column(String)
    project_id = Column(Integer, ForeignKey("projects.id"))
    
    # Uptime Monitoring
    is_online = Column(Boolean, nullable=True)
    last_checked_at = Column(DateTime, nullable=True)
    
    # Credentials
    username = Column(String, nullable=True)
    password = Column(EncryptedString, nullable=True)
    ssh_key = Column(EncryptedString, nullable=True)

    project = relationship("Project", back_populates="servers")

class DatabaseInfo(Base):
    __tablename__ = "database_info"

    id = Column(Integer, primary_key=True, index=True)
    engine = Column(String, nullable=False) # Postgres, MySQL, etc.
    host = Column(String, nullable=False)
    port = Column(Integer)
    connection_string_format = Column(String) # e.g. postgresql://{user}:{pass}@{host}:{port}/{db}
    db_name = Column(String)
    project_id = Column(Integer, ForeignKey("projects.id"))
    
    # Credentials
    username = Column(String, nullable=True)
    password = Column(EncryptedString, nullable=True)

    project = relationship("Project", back_populates="databases")

class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)
    description = Column(String, nullable=True)

class Component(Base):
    __tablename__ = "components"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False) # e.g. "Main Assets Bucket"
    type = Column(String, nullable=False) # e.g. "S3 Bucket", "Redis Cache", "DNS Record"
    custom_fields = Column(EncryptedJSON, default=dict) # Handles arbitrary key-value pairs natively, fully encrypted
    project_id = Column(Integer, ForeignKey("projects.id"))

    project = relationship("Project", back_populates="components")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String, nullable=False) # e.g. 'CREATED', 'DELETED', 'REVEALED'
    resource_type = Column(String, nullable=False) # e.g. 'Project', 'Server'
    resource_name = Column(String, nullable=True) # e.g. "My Project" or "10.0.0.1"
    timestamp = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")

class TokenBlocklist(Base):
    __tablename__ = "token_blocklist"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
