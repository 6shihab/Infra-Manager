from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Any

class Settings(BaseSettings):
    database_url: str
    redis_url: str | None = None
    encryption_key: str | None = None
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7 # 1 week
    audit_log_retention_days: int = 30
    allowed_origins: str | list[str] = ["http://localhost:5173", "http://localhost:3000", "http://localhost:8080"]
    log_level: str = "INFO"
    enable_docs: bool = True

    # WebAuthn / Passkey
    webauthn_rp_id: str = "localhost"
    webauthn_rp_name: str = "InfraManager"
    webauthn_origin: str | list[str] = ["http://localhost:5173", "http://localhost:8080", "http://localhost:17170"]

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> Any:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    @field_validator("webauthn_origin", mode="before")
    @classmethod
    def assemble_webauthn_origins(cls, v: Any) -> Any:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
