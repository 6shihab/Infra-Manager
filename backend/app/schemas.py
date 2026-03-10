from pydantic import BaseModel, field_validator
import re
import ipaddress
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class UserBase(BaseModel):
    email: str
    full_name: Optional[str] = None
    is_active: bool = True
    is_superuser: bool = False

class UserCreate(UserBase):
    password: str
    
    @field_validator('password')
    @classmethod
    def validate_password_complexity(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one number')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v

class UserResponse(UserBase):
    id: int
    class Config:
        from_attributes = True

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def validate_password_complexity(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one number')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v

class AdminPasswordChange(BaseModel):
    new_password: str

    @field_validator('new_password')
    @classmethod
    def validate_password_complexity(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one number')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v

class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None

class GroupCreate(GroupBase):
    pass

class GroupResponse(GroupBase):
    id: int
    users: List['UserResponse'] = []
    class Config:
        from_attributes = True

class AccessLevelEnum(str, Enum):
    VIEWER = "Viewer"
    EDITOR = "Editor"
    ADMIN = "Admin"

class ProjectGroupAccessBase(BaseModel):
    project_id: int
    group_id: int
    access_level: AccessLevelEnum = AccessLevelEnum.VIEWER

class ProjectGroupAccessCreate(ProjectGroupAccessBase):
    pass

class ProjectGroupAccessResponse(ProjectGroupAccessBase):
    id: int
    class Config:
        from_attributes = True

class ProjectUserAccessBase(BaseModel):
    project_id: int
    user_id: int
    access_level: AccessLevelEnum = AccessLevelEnum.VIEWER

class ProjectUserAccessCreate(ProjectUserAccessBase):
    pass

class ProjectUserAccessResponse(ProjectUserAccessBase):
    id: int
    class Config:
        from_attributes = True

class EnvironmentEnum(str, Enum):
    dev = "Dev"
    staging = "Staging"
    prod = "Prod"

# --- Server Schemas ---
class ServerBase(BaseModel):
    name: str
    ip_address: str
    os: Optional[str] = None
    region: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    ssh_key: Optional[str] = None

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: str) -> str:
        try:
            ipaddress.ip_address(v)
            return v
        except ValueError:
            pass
        # Accept hostnames: labels of 1-63 chars separated by dots, optionally trailing dot
        hostname_re = re.compile(
            r'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)*'
            r'[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.?$'
        )
        if hostname_re.match(v):
            return v
        raise ValueError(f"Invalid IP address or hostname: {v}")

class ServerCreate(ServerBase):
    pass

class ServerUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    os: Optional[str] = None
    region: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    ssh_key: Optional[str] = None

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: str) -> str:
        try:
            ipaddress.ip_address(v)
            return v
        except ValueError:
            pass
        hostname_re = re.compile(
            r'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)*'
            r'[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.?$'
        )
        if hostname_re.match(v):
            return v
        raise ValueError(f"Invalid IP address or hostname: {v}")

class ServerResponse(ServerBase):
    id: int
    is_online: Optional[bool] = None
    last_checked_at: Optional[datetime] = None
    can_edit: bool = False
    can_delete: bool = False
    class Config:
        from_attributes = True

class ServerListResponse(BaseModel):
    id: int
    name: str
    ip_address: str
    os: Optional[str] = None
    region: Optional[str] = None
    username: Optional[str] = None
    is_online: Optional[bool] = None
    last_checked_at: Optional[datetime] = None
    created_by: Optional[int] = None
    can_edit: bool = False
    can_delete: bool = False
    class Config:
        from_attributes = True

class ProjectServerCreate(BaseModel):
    server_id: int
    username: Optional[str] = None
    password: Optional[str] = None
    ssh_key: Optional[str] = None

class ProjectServerResponse(BaseModel):
    project_id: int
    server_id: int
    username: Optional[str] = None
    server: ServerResponse
    
    class Config:
        from_attributes = True

# --- DatabaseEngine Schemas ---
class DatabaseEngineBase(BaseModel):
    name: str
    engine: str
    host: str
    port: Optional[int] = None
    connection_string_format: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None

class DatabaseEngineCreate(DatabaseEngineBase):
    pass

class DatabaseEngineUpdate(BaseModel):
    name: Optional[str] = None
    engine: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    connection_string_format: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None

class DatabaseEngineResponse(DatabaseEngineBase):
    id: int
    can_edit: bool = False
    can_delete: bool = False
    class Config:
        from_attributes = True

class DatabaseEngineListResponse(BaseModel):
    id: int
    name: str
    engine: str
    host: str
    port: Optional[int] = None
    connection_string_format: Optional[str] = None
    username: Optional[str] = None
    created_by: Optional[int] = None
    can_edit: bool = False
    can_delete: bool = False
    class Config:
        from_attributes = True

class ProjectDatabaseCreate(BaseModel):
    database_engine_id: int
    db_name: str
    username: Optional[str] = None
    password: Optional[str] = None

class ProjectDatabaseResponse(BaseModel):
    project_id: int
    database_engine_id: int
    db_name: str
    username: Optional[str] = None
    database_engine: DatabaseEngineResponse

    class Config:
        from_attributes = True

class ProjectListResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    primary_domain: Optional[str] = None
    environment: EnvironmentEnum
    is_online: Optional[bool] = None
    last_checked_at: Optional[datetime] = None
    created_by: Optional[int] = None
    server_count: int = 0
    database_count: int = 0
    class Config:
        from_attributes = True

# --- Project Schemas ---
class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    primary_domain: Optional[str] = None
    environment: EnvironmentEnum = EnvironmentEnum.dev

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    primary_domain: Optional[str] = None
    environment: Optional[EnvironmentEnum] = None

class ProjectResponse(ProjectBase):
    id: int
    is_online: Optional[bool] = None
    last_checked_at: Optional[datetime] = None
    created_by: Optional[int] = None
    server_links: List[ProjectServerResponse] = []
    database_links: List[ProjectDatabaseResponse] = []
    components: List['ComponentResponse'] = []
    group_accesses: List[ProjectGroupAccessResponse] = []
    user_accesses: List[ProjectUserAccessResponse] = []
    current_user_role: Optional[str] = None  # "Admin" | "Editor" | "Viewer" | None (superuser/creator get "Admin")
    class Config:
        from_attributes = True

# --- Component Schemas ---
class ComponentBase(BaseModel):
    name: str
    type: str # 'S3 Bucket', 'Redis', 'DNS', etc.
    custom_fields: Dict[str, Any] = {}

class ComponentCreate(ComponentBase):
    project_id: int

class ComponentUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None

class ComponentResponse(ComponentBase):
    id: int
    project_id: int
    class Config:
        from_attributes = True

# --- Setting Schemas ---
class SettingBase(BaseModel):
    key: str
    value: str
    description: Optional[str] = None

class SettingCreate(SettingBase):
    pass

class SettingUpdate(BaseModel):
    value: Optional[str] = None
    description: Optional[str] = None

class SettingResponse(SettingBase):
    class Config:
        from_attributes = True

# --- Audit Schemas ---
class AuditLogBase(BaseModel):
    user_id: Optional[int] = None
    action: str
    resource_type: str
    resource_name: Optional[str] = None

class AuditLogCreate(AuditLogBase):
    pass

class AuditLogResponse(AuditLogBase):
    id: int
    timestamp: datetime
    user: Optional[UserResponse] = None
    class Config:
        from_attributes = True
