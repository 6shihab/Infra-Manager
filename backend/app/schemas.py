from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from enum import Enum

class EnvironmentEnum(str, Enum):
    dev = "Dev"
    staging = "Staging"
    prod = "Prod"

# --- Server Schemas ---
class ServerBase(BaseModel):
    ip_address: str
    os: Optional[str] = None
    region: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    ssh_key: Optional[str] = None

class ServerCreate(ServerBase):
    project_id: int

class ServerUpdate(BaseModel):
    ip_address: Optional[str] = None
    os: Optional[str] = None
    region: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    ssh_key: Optional[str] = None

class ServerResponse(ServerBase):
    id: int
    project_id: int
    class Config:
        from_attributes = True

# --- DatabaseInfo Schemas ---
class DatabaseInfoBase(BaseModel):
    engine: str
    host: str
    port: Optional[int] = None
    connection_string_format: Optional[str] = None
    db_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None

class DatabaseInfoCreate(DatabaseInfoBase):
    project_id: int

class DatabaseInfoUpdate(BaseModel):
    engine: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    connection_string_format: Optional[str] = None
    db_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None

class DatabaseInfoResponse(DatabaseInfoBase):
    id: int
    project_id: int
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
    servers: List[ServerResponse] = []
    databases: List[DatabaseInfoResponse] = []
    components: List['ComponentResponse'] = []
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
