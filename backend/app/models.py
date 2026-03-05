from sqlalchemy import Column, Integer, String, Enum, ForeignKey
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

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String)
    primary_domain = Column(String)
    environment = Column(Enum(EnvironmentEnum), default=EnvironmentEnum.dev)

    servers = relationship("Server", back_populates="project", cascade="all, delete-orphan")
    databases = relationship("DatabaseInfo", back_populates="project", cascade="all, delete-orphan")
    components = relationship("Component", back_populates="project", cascade="all, delete-orphan")

class Server(Base):
    __tablename__ = "servers"

    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String, nullable=False)
    os = Column(String)
    region = Column(String)
    project_id = Column(Integer, ForeignKey("projects.id"))
    
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
