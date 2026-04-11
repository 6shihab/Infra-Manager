import uuid
from pydantic import BaseModel, Field, field_validator
import re
import ipaddress
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class Token(BaseModel):
    access_token: str
    token_type: str
    requires_totp: bool = False

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
    id: uuid.UUID
    totp_enabled: bool = False
    has_passkeys: bool = False
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
    id: uuid.UUID
    users: List['UserResponse'] = []
    class Config:
        from_attributes = True

class AccessLevelEnum(str, Enum):
    VIEWER = "Viewer"
    EDITOR = "Editor"
    ADMIN = "Admin"

class ProjectGroupAccessBase(BaseModel):
    project_id: uuid.UUID
    group_id: uuid.UUID
    access_level: AccessLevelEnum = AccessLevelEnum.VIEWER

class ProjectGroupAccessCreate(ProjectGroupAccessBase):
    pass

class ProjectGroupAccessResponse(ProjectGroupAccessBase):
    id: uuid.UUID
    class Config:
        from_attributes = True

class ProjectUserAccessBase(BaseModel):
    project_id: uuid.UUID
    user_id: uuid.UUID
    access_level: AccessLevelEnum = AccessLevelEnum.VIEWER

class ProjectUserAccessCreate(ProjectUserAccessBase):
    pass

class ProjectUserAccessResponse(ProjectUserAccessBase):
    id: uuid.UUID
    class Config:
        from_attributes = True

class EnvironmentEnum(str, Enum):
    dev = "Dev"
    staging = "Staging"
    prod = "Prod"

# --- Server Schemas ---
def _validate_ip_or_hostname(v: str) -> str:
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

class ServerBase(BaseModel):
    name: str = Field(max_length=256)
    ip_address: str = Field(max_length=256)
    os: Optional[str] = Field(default=None, max_length=128)
    region: Optional[str] = Field(default=None, max_length=128)
    username: Optional[str] = Field(default=None, max_length=256)
    password: Optional[str] = Field(default=None, max_length=1000)
    ssh_key: Optional[str] = Field(default=None, max_length=10000)

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: str) -> str:
        return _validate_ip_or_hostname(v)

class ServerCreate(ServerBase):
    pass

class ServerUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=256)
    ip_address: Optional[str] = Field(default=None, max_length=256)
    os: Optional[str] = Field(default=None, max_length=128)
    region: Optional[str] = Field(default=None, max_length=128)
    username: Optional[str] = Field(default=None, max_length=256)
    password: Optional[str] = Field(default=None, max_length=1000)
    ssh_key: Optional[str] = Field(default=None, max_length=10000)

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: str) -> str:
        return _validate_ip_or_hostname(v)

class ServerResponse(ServerBase):
    id: uuid.UUID
    is_online: Optional[bool] = None
    last_checked_at: Optional[datetime] = None
    can_edit: bool = False
    can_delete: bool = False
    class Config:
        from_attributes = True

class ServerListResponse(BaseModel):
    id: uuid.UUID
    name: str
    ip_address: str
    os: Optional[str] = None
    region: Optional[str] = None
    username: Optional[str] = None
    is_online: Optional[bool] = None
    last_checked_at: Optional[datetime] = None
    created_by: Optional[uuid.UUID] = None
    can_edit: bool = False
    can_delete: bool = False
    class Config:
        from_attributes = True

class ServerCredentialsResponse(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    ssh_key: Optional[str] = None
    class Config:
        from_attributes = True

class ProjectServerCreate(BaseModel):
    server_id: uuid.UUID
    username: Optional[str] = None
    password: Optional[str] = None
    ssh_key: Optional[str] = None

class ProjectServerResponse(BaseModel):
    project_id: uuid.UUID
    server_id: uuid.UUID
    username: Optional[str] = None
    password: Optional[str] = None
    ssh_key: Optional[str] = None
    server: ServerResponse

    class Config:
        from_attributes = True

# --- DatabaseEngine Schemas ---
class DatabaseEngineBase(BaseModel):
    name: str = Field(max_length=256)
    engine: str = Field(max_length=64)
    host: str = Field(max_length=256)
    port: Optional[int] = None
    connection_string_format: Optional[str] = Field(default=None, max_length=1000)
    username: Optional[str] = Field(default=None, max_length=256)
    password: Optional[str] = Field(default=None, max_length=1000)

class DatabaseEngineCreate(DatabaseEngineBase):
    pass

class DatabaseEngineUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=256)
    engine: Optional[str] = Field(default=None, max_length=64)
    host: Optional[str] = Field(default=None, max_length=256)
    port: Optional[int] = None
    connection_string_format: Optional[str] = Field(default=None, max_length=1000)
    username: Optional[str] = Field(default=None, max_length=256)
    password: Optional[str] = Field(default=None, max_length=1000)

class DatabaseEngineResponse(DatabaseEngineBase):
    id: uuid.UUID
    can_edit: bool = False
    can_delete: bool = False
    class Config:
        from_attributes = True

class DatabaseEngineListResponse(BaseModel):
    id: uuid.UUID
    name: str
    engine: str
    host: str
    port: Optional[int] = None
    connection_string_format: Optional[str] = None
    username: Optional[str] = None
    created_by: Optional[uuid.UUID] = None
    can_edit: bool = False
    can_delete: bool = False
    class Config:
        from_attributes = True

class DatabaseCredentialsResponse(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    class Config:
        from_attributes = True

class ProjectDatabaseCreate(BaseModel):
    database_engine_id: uuid.UUID
    db_name: str
    username: Optional[str] = None
    password: Optional[str] = None

class ProjectDatabaseResponse(BaseModel):
    project_id: uuid.UUID
    database_engine_id: uuid.UUID
    db_name: str
    username: Optional[str] = None
    password: Optional[str] = None
    database_engine: DatabaseEngineResponse

    class Config:
        from_attributes = True

# --- Project Folder Schemas ---
class ProjectFolderCreate(BaseModel):
    name: str = Field(..., max_length=200)
    color: Optional[str] = Field(None, max_length=7)
    position: int = 0
    parent_id: Optional[uuid.UUID] = None

class ProjectFolderUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    color: Optional[str] = Field(None, max_length=7)
    position: Optional[int] = None
    parent_id: Optional[uuid.UUID] = None

class ProjectFolderResponse(BaseModel):
    id: uuid.UUID
    name: str
    color: Optional[str] = None
    position: int = 0
    parent_id: Optional[uuid.UUID] = None
    children: List['ProjectFolderResponse'] = []
    class Config:
        from_attributes = True

ProjectFolderResponse.model_rebuild()

class ProjectListResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    primary_domain: Optional[str] = None
    environment: EnvironmentEnum
    is_online: Optional[bool] = None
    last_checked_at: Optional[datetime] = None
    created_by: Optional[uuid.UUID] = None
    folder_id: Optional[uuid.UUID] = None
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
    deployment_note: Optional[str] = None
    folder_id: Optional[uuid.UUID] = None

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    primary_domain: Optional[str] = None
    environment: Optional[EnvironmentEnum] = None
    deployment_note: Optional[str] = None
    folder_id: Optional[uuid.UUID] = None

class ProjectResponse(ProjectBase):
    id: uuid.UUID
    is_online: Optional[bool] = None
    last_checked_at: Optional[datetime] = None
    created_by: Optional[uuid.UUID] = None
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
    project_id: uuid.UUID

class ComponentUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None

class ComponentResponse(ComponentBase):
    id: uuid.UUID
    project_id: uuid.UUID
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

# --- TOTP / 2FA Schemas ---
class TOTPSetupResponse(BaseModel):
    secret: str
    qr_code: str
    provisioning_uri: str

class TOTPVerifyRequest(BaseModel):
    code: str

class TOTPActivateResponse(BaseModel):
    backup_codes: List[str]

class TOTPDisableRequest(BaseModel):
    password: str
    code: str

class TOTPLoginRequest(BaseModel):
    totp_token: str
    code: str

# --- WebAuthn / Passkey Schemas ---
class WebAuthnRegistrationOptionsResponse(BaseModel):
    options: dict

class WebAuthnRegistrationVerifyRequest(BaseModel):
    credential: dict
    device_name: str = Field(default="My Passkey", max_length=256)

class WebAuthnCredentialResponse(BaseModel):
    id: uuid.UUID
    credential_id: str
    device_name: Optional[str] = None
    created_at: datetime
    last_used_at: Optional[datetime] = None
    transports: Optional[List[str]] = None
    class Config:
        from_attributes = True

class WebAuthnCredentialUpdate(BaseModel):
    device_name: str = Field(max_length=256)

class WebAuthnAuthenticationOptionsResponse(BaseModel):
    options: dict

class WebAuthnAuthenticationVerifyRequest(BaseModel):
    credential: dict

# --- Audit Schemas ---
class AuditLogBase(BaseModel):
    user_id: Optional[uuid.UUID] = None
    action: str
    resource_type: str
    resource_name: Optional[str] = None

class AuditLogCreate(AuditLogBase):
    pass

class AuditLogResponse(AuditLogBase):
    id: uuid.UUID
    timestamp: datetime
    user: Optional[UserResponse] = None
    class Config:
        from_attributes = True

# --- Trash / Recycle Bin ---
class TrashItemResponse(BaseModel):
    id: uuid.UUID
    name: str
    resource_type: str
    deleted_at: datetime
    days_remaining: int
    parent_name: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    parent_deleted: bool = False
