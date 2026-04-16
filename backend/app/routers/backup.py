import uuid
import enum
import json
import base64
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import insert

from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_active_superuser
from app.audit import log_audit
from app.rate_limit import limiter
from app.backup_crypto import (
    generate_salt,
    derive_key,
    decrypt_value,
    SENSITIVE_FIELDS,
    encrypt_sensitive_fields,
    decrypt_sensitive_fields,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/backup", tags=["backup"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize_entity(entity, fields: list[str]) -> dict:
    """Convert SQLAlchemy model to plain dict, UUIDs->str, datetimes->ISO."""
    result = {}
    for f in fields:
        val = getattr(entity, f, None)
        if isinstance(val, uuid.UUID):
            val = str(val)
        elif isinstance(val, datetime):
            val = val.isoformat()
        elif isinstance(val, enum.Enum):
            val = val.value
        result[f] = val
    return result


def _export_data(db: Session, passphrase: str, project_id: uuid.UUID | None = None) -> dict:
    """Build the export data payload, optionally scoped to a single project."""
    salt = generate_salt()
    aes_key = derive_key(passphrase, salt)

    data: dict = {}

    if project_id is None:
        # ---- Full export ----
        # Settings
        settings_rows = db.query(models.Setting).all()
        data["settings"] = [
            _serialize_entity(s, ["key", "value", "description"])
            for s in settings_rows
        ]

        # Users (exclude sensitive/legacy columns)
        users = db.query(models.User).all()
        data["users"] = [
            _serialize_entity(u, [
                "id", "keycloak_id", "email", "full_name",
                "is_active", "is_superuser",
            ])
            for u in users
        ]

        # Groups
        groups = db.query(models.Group).all()
        data["groups"] = [
            _serialize_entity(g, ["id", "name", "description"])
            for g in groups
        ]

        # user_group_links (portable: email + group name)
        link_rows = (
            db.query(models.user_group_link)
            .all()
        )
        user_map = {u.id: u.email for u in users}
        group_map = {g.id: g.name for g in groups}
        data["user_group_links"] = [
            {"user_email": user_map.get(r.user_id), "group_name": group_map.get(r.group_id)}
            for r in link_rows
            if user_map.get(r.user_id) and group_map.get(r.group_id)
        ]

        # Project folders
        folders = db.query(models.ProjectFolder).filter(
            models.ProjectFolder.is_deleted == False  # noqa: E712
        ).all()
        data["project_folders"] = [
            _serialize_entity(f, [
                "id", "name", "color", "position", "parent_id", "created_by",
            ])
            for f in folders
        ]

        # Projects
        projects = db.query(models.Project).filter(
            models.Project.is_deleted == False  # noqa: E712
        ).all()
        data["projects"] = [
            _serialize_entity(p, [
                "id", "name", "description", "primary_domain",
                "environment", "deployment_note", "folder_id", "created_by",
            ])
            for p in projects
        ]

        # Servers
        servers = db.query(models.Server).filter(
            models.Server.is_deleted == False  # noqa: E712
        ).all()
        data["servers"] = [
            encrypt_sensitive_fields(
                _serialize_entity(s, [
                    "id", "name", "ip_address", "os", "region",
                    "username", "password", "ssh_key", "created_by",
                ]),
                SENSITIVE_FIELDS["servers"],
                aes_key,
            )
            for s in servers
        ]

        # Database engines
        db_engines = db.query(models.DatabaseEngine).filter(
            models.DatabaseEngine.is_deleted == False  # noqa: E712
        ).all()
        data["database_engines"] = [
            encrypt_sensitive_fields(
                _serialize_entity(de, [
                    "id", "name", "engine", "host", "port",
                    "connection_string_format", "username", "password", "created_by",
                ]),
                SENSITIVE_FIELDS["database_engines"],
                aes_key,
            )
            for de in db_engines
        ]

        # ProjectServer links
        ps_links = db.query(models.ProjectServer).all()
        project_map = {p.id: p.name for p in projects}
        server_map = {s.id: s.name for s in servers}
        data["project_servers"] = [
            encrypt_sensitive_fields(
                {
                    "project_name": project_map.get(ps.project_id),
                    "server_name": server_map.get(ps.server_id),
                    "username": ps.username,
                    "password": ps.password,
                    "ssh_key": ps.ssh_key,
                },
                SENSITIVE_FIELDS["project_servers"],
                aes_key,
            )
            for ps in ps_links
            if project_map.get(ps.project_id) and server_map.get(ps.server_id)
        ]

        # ProjectDatabase links
        pd_links = db.query(models.ProjectDatabase).all()
        de_map = {de.id: de.name for de in db_engines}
        data["project_databases"] = [
            encrypt_sensitive_fields(
                {
                    "project_name": project_map.get(pd.project_id),
                    "database_engine_name": de_map.get(pd.database_engine_id),
                    "db_name": pd.db_name,
                    "username": pd.username,
                    "password": pd.password,
                },
                SENSITIVE_FIELDS["project_databases"],
                aes_key,
            )
            for pd in pd_links
            if project_map.get(pd.project_id) and de_map.get(pd.database_engine_id)
        ]

        # Components
        components = db.query(models.Component).filter(
            models.Component.is_deleted == False  # noqa: E712
        ).all()
        data["components"] = [
            encrypt_sensitive_fields(
                {
                    **_serialize_entity(c, ["id", "name", "type", "project_id"]),
                    "custom_fields": c.custom_fields,  # already decrypted by ORM
                    "project_name": project_map.get(c.project_id),
                },
                SENSITIVE_FIELDS["components"],
                aes_key,
            )
            for c in components
        ]

        # ProjectGroupAccess (portable: project_name + group_name + access_level)
        pga_rows = db.query(models.ProjectGroupAccess).all()
        data["project_group_accesses"] = [
            {
                "project_name": project_map.get(pga.project_id),
                "group_name": group_map.get(pga.group_id),
                "access_level": pga.access_level.value if isinstance(pga.access_level, enum.Enum) else pga.access_level,
            }
            for pga in pga_rows
            if project_map.get(pga.project_id) and group_map.get(pga.group_id)
        ]

        # ProjectUserAccess (portable: project_name + user_email + access_level)
        pua_rows = db.query(models.ProjectUserAccess).all()
        data["project_user_accesses"] = [
            {
                "project_name": project_map.get(pua.project_id),
                "user_email": user_map.get(pua.user_id),
                "access_level": pua.access_level.value if isinstance(pua.access_level, enum.Enum) else pua.access_level,
            }
            for pua in pua_rows
            if project_map.get(pua.project_id) and user_map.get(pua.user_id)
        ]

    else:
        # ---- Project-scoped export ----
        project = (
            db.query(models.Project)
            .filter(models.Project.id == project_id, models.Project.is_deleted == False)  # noqa: E712
            .first()
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_dict = _serialize_entity(project, [
            "id", "name", "description", "primary_domain",
            "environment", "deployment_note", "folder_id", "created_by",
        ])
        data["projects"] = [project_dict]

        # Folder (if any)
        if project.folder_id:
            folder = (
                db.query(models.ProjectFolder)
                .filter(
                    models.ProjectFolder.id == project.folder_id,
                    models.ProjectFolder.is_deleted == False,  # noqa: E712
                )
                .first()
            )
            data["project_folders"] = [
                _serialize_entity(folder, [
                    "id", "name", "color", "position", "parent_id", "created_by",
                ])
            ] if folder else []
        else:
            data["project_folders"] = []

        # Linked servers via ProjectServer
        ps_links = (
            db.query(models.ProjectServer)
            .filter(models.ProjectServer.project_id == project_id)
            .all()
        )
        server_ids = [ps.server_id for ps in ps_links]
        servers = (
            db.query(models.Server)
            .filter(
                models.Server.id.in_(server_ids),
                models.Server.is_deleted == False,  # noqa: E712
            )
            .all()
        ) if server_ids else []
        server_map = {s.id: s.name for s in servers}

        data["servers"] = [
            encrypt_sensitive_fields(
                _serialize_entity(s, [
                    "id", "name", "ip_address", "os", "region",
                    "username", "password", "ssh_key", "created_by",
                ]),
                SENSITIVE_FIELDS["servers"],
                aes_key,
            )
            for s in servers
        ]

        data["project_servers"] = [
            encrypt_sensitive_fields(
                {
                    "project_name": project.name,
                    "server_name": server_map.get(ps.server_id),
                    "username": ps.username,
                    "password": ps.password,
                    "ssh_key": ps.ssh_key,
                },
                SENSITIVE_FIELDS["project_servers"],
                aes_key,
            )
            for ps in ps_links
            if server_map.get(ps.server_id)
        ]

        # Linked database engines via ProjectDatabase
        pd_links = (
            db.query(models.ProjectDatabase)
            .filter(models.ProjectDatabase.project_id == project_id)
            .all()
        )
        de_ids = [pd.database_engine_id for pd in pd_links]
        db_engines = (
            db.query(models.DatabaseEngine)
            .filter(
                models.DatabaseEngine.id.in_(de_ids),
                models.DatabaseEngine.is_deleted == False,  # noqa: E712
            )
            .all()
        ) if de_ids else []
        de_map = {de.id: de.name for de in db_engines}

        data["database_engines"] = [
            encrypt_sensitive_fields(
                _serialize_entity(de, [
                    "id", "name", "engine", "host", "port",
                    "connection_string_format", "username", "password", "created_by",
                ]),
                SENSITIVE_FIELDS["database_engines"],
                aes_key,
            )
            for de in db_engines
        ]

        data["project_databases"] = [
            encrypt_sensitive_fields(
                {
                    "project_name": project.name,
                    "database_engine_name": de_map.get(pd.database_engine_id),
                    "db_name": pd.db_name,
                    "username": pd.username,
                    "password": pd.password,
                },
                SENSITIVE_FIELDS["project_databases"],
                aes_key,
            )
            for pd in pd_links
            if de_map.get(pd.database_engine_id)
        ]

        # Components
        components = (
            db.query(models.Component)
            .filter(
                models.Component.project_id == project_id,
                models.Component.is_deleted == False,  # noqa: E712
            )
            .all()
        )
        data["components"] = [
            encrypt_sensitive_fields(
                {
                    **_serialize_entity(c, ["id", "name", "type", "project_id"]),
                    "custom_fields": c.custom_fields,
                    "project_name": project.name,
                },
                SENSITIVE_FIELDS["components"],
                aes_key,
            )
            for c in components
        ]

        # Group accesses for this project
        pga_rows = (
            db.query(models.ProjectGroupAccess)
            .filter(models.ProjectGroupAccess.project_id == project_id)
            .all()
        )
        group_ids = [pga.group_id for pga in pga_rows]
        groups = (
            db.query(models.Group).filter(models.Group.id.in_(group_ids)).all()
        ) if group_ids else []
        group_map = {g.id: g.name for g in groups}

        data["project_group_accesses"] = [
            {
                "project_name": project.name,
                "group_name": group_map.get(pga.group_id),
                "access_level": pga.access_level.value if isinstance(pga.access_level, enum.Enum) else pga.access_level,
            }
            for pga in pga_rows
            if group_map.get(pga.group_id)
        ]

        # User accesses for this project
        pua_rows = (
            db.query(models.ProjectUserAccess)
            .filter(models.ProjectUserAccess.project_id == project_id)
            .all()
        )
        user_ids = [pua.user_id for pua in pua_rows]
        users_for_access = (
            db.query(models.User).filter(models.User.id.in_(user_ids)).all()
        ) if user_ids else []
        user_map = {u.id: u.email for u in users_for_access}

        data["project_user_accesses"] = [
            {
                "project_name": project.name,
                "user_email": user_map.get(pua.user_id),
                "access_level": pua.access_level.value if isinstance(pua.access_level, enum.Enum) else pua.access_level,
            }
            for pua in pua_rows
            if user_map.get(pua.user_id)
        ]

        # Include referenced groups and users (for portability)
        data["groups"] = [
            _serialize_entity(g, ["id", "name", "description"])
            for g in groups
        ]
        data["users"] = [
            _serialize_entity(u, [
                "id", "keycloak_id", "email", "full_name",
                "is_active", "is_superuser",
            ])
            for u in users_for_access
        ]

    return {
        "salt": base64.b64encode(salt).decode("utf-8"),
        "data": data,
    }


def _parse_and_validate(content: bytes, passphrase: str) -> tuple[dict, bytes]:
    """Parse backup JSON and validate the passphrase. Returns (parsed_data, aes_key)."""
    try:
        parsed = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON file: {exc}")

    version = parsed.get("version")
    if version != "1.0":
        raise HTTPException(status_code=400, detail=f"Unsupported backup version: {version}")

    encryption_info = parsed.get("encryption")
    if not encryption_info or "salt" not in encryption_info:
        raise HTTPException(status_code=400, detail="Missing encryption metadata")

    salt = base64.b64decode(encryption_info["salt"])
    aes_key = derive_key(passphrase, salt)

    # Verify passphrase by attempting to decrypt any non-None sensitive field
    data = parsed.get("data", {})
    test_ok = False
    for entity_type, field_names in SENSITIVE_FIELDS.items():
        records = data.get(entity_type, [])
        for record in records:
            for fname in field_names:
                val = record.get(fname)
                if val is not None and isinstance(val, str) and val != "":
                    try:
                        decrypt_value(val, aes_key)
                        test_ok = True
                    except Exception:
                        raise HTTPException(status_code=400, detail="Invalid passphrase")
                    break
            if test_ok:
                break
        if test_ok:
            break

    return parsed, aes_key


# ---------------------------------------------------------------------------
# Export endpoints
# ---------------------------------------------------------------------------

@router.post("/export/full")
@limiter.limit("5/minute")
def export_full(
    request: Request,
    body: schemas.BackupExportRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_superuser),
):
    result = _export_data(db, body.passphrase)
    now = datetime.now(timezone.utc)
    envelope = {
        "version": "1.0",
        "type": "full_backup",
        "exported_at": now.isoformat(),
        "exported_by": current_user.email,
        "encryption": {
            "method": "AES-256-GCM",
            "kdf": "PBKDF2-SHA256",
            "iterations": 600000,
            "salt": result["salt"],
        },
        "data": result["data"],
    }
    payload = json.dumps(envelope, indent=2, default=str).encode("utf-8")
    date_str = now.strftime("%Y%m%d-%H%M%S")

    log_audit(db, current_user.id, "EXPORTED", "System")

    return StreamingResponse(
        iter([payload]),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="infra-manager-backup-{date_str}.json"',
        },
    )


@router.post("/export/project/{project_id}")
@limiter.limit("5/minute")
def export_project(
    request: Request,
    project_id: uuid.UUID,
    body: schemas.BackupExportRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_superuser),
):
    # Validate project exists
    project = (
        db.query(models.Project)
        .filter(models.Project.id == project_id, models.Project.is_deleted == False)  # noqa: E712
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = _export_data(db, body.passphrase, project_id=project_id)
    now = datetime.now(timezone.utc)
    safe_name = project.name.replace(" ", "_").replace("/", "_")[:50]
    envelope = {
        "version": "1.0",
        "type": "project_export",
        "exported_at": now.isoformat(),
        "exported_by": current_user.email,
        "encryption": {
            "method": "AES-256-GCM",
            "kdf": "PBKDF2-SHA256",
            "iterations": 600000,
            "salt": result["salt"],
        },
        "data": result["data"],
    }
    payload = json.dumps(envelope, indent=2, default=str).encode("utf-8")
    date_str = now.strftime("%Y%m%d-%H%M%S")

    log_audit(db, current_user.id, "EXPORTED", "Project", project.name)

    return StreamingResponse(
        iter([payload]),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="infra-manager-{safe_name}-{date_str}.json"',
        },
    )


# ---------------------------------------------------------------------------
# Import endpoints
# ---------------------------------------------------------------------------

@router.post("/import/preview", response_model=schemas.ImportPreviewResponse)
@limiter.limit("5/minute")
def import_preview(
    request: Request,
    file: UploadFile = File(...),
    passphrase: str = Form(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_superuser),
):
    content = file.file.read()
    parsed, _aes_key = _parse_and_validate(content, passphrase)

    data = parsed.get("data", {})
    summary: dict[str, dict] = {}
    warnings: list[str] = []

    # Settings
    settings_list = data.get("settings", [])
    if settings_list:
        existing_keys = {
            r.key for r in db.query(models.Setting.key).all()
        }
        existing_count = sum(1 for s in settings_list if s.get("key") in existing_keys)
        summary["settings"] = {
            "total": len(settings_list),
            "existing": existing_count,
            "new": len(settings_list) - existing_count,
        }

    # Users
    users_list = data.get("users", [])
    if users_list:
        existing_emails = {
            r.email for r in db.query(models.User.email).all()
        }
        existing_count = sum(1 for u in users_list if u.get("email") in existing_emails)
        summary["users"] = {
            "total": len(users_list),
            "existing": existing_count,
            "new": len(users_list) - existing_count,
        }
        if len(users_list) - existing_count > 0:
            warnings.append("Users will be created without Keycloak accounts")

    # Groups
    groups_list = data.get("groups", [])
    if groups_list:
        existing_names = {
            r.name for r in db.query(models.Group.name).all()
        }
        existing_count = sum(1 for g in groups_list if g.get("name") in existing_names)
        summary["groups"] = {
            "total": len(groups_list),
            "existing": existing_count,
            "new": len(groups_list) - existing_count,
        }

    # Project folders
    folders_list = data.get("project_folders", [])
    if folders_list:
        existing_names = {
            r.name
            for r in db.query(models.ProjectFolder.name).filter(
                models.ProjectFolder.is_deleted == False  # noqa: E712
            ).all()
        }
        existing_count = sum(1 for f in folders_list if f.get("name") in existing_names)
        summary["project_folders"] = {
            "total": len(folders_list),
            "existing": existing_count,
            "new": len(folders_list) - existing_count,
        }

    # Projects
    projects_list = data.get("projects", [])
    if projects_list:
        existing_names = {
            r.name
            for r in db.query(models.Project.name).filter(
                models.Project.is_deleted == False  # noqa: E712
            ).all()
        }
        existing_count = sum(1 for p in projects_list if p.get("name") in existing_names)
        summary["projects"] = {
            "total": len(projects_list),
            "existing": existing_count,
            "new": len(projects_list) - existing_count,
        }

    # Servers
    servers_list = data.get("servers", [])
    if servers_list:
        existing_names = {
            r.name
            for r in db.query(models.Server.name).filter(
                models.Server.is_deleted == False  # noqa: E712
            ).all()
        }
        existing_count = sum(1 for s in servers_list if s.get("name") in existing_names)
        summary["servers"] = {
            "total": len(servers_list),
            "existing": existing_count,
            "new": len(servers_list) - existing_count,
        }

    # Database engines
    de_list = data.get("database_engines", [])
    if de_list:
        existing_names = {
            r.name
            for r in db.query(models.DatabaseEngine.name).filter(
                models.DatabaseEngine.is_deleted == False  # noqa: E712
            ).all()
        }
        existing_count = sum(1 for d in de_list if d.get("name") in existing_names)
        summary["database_engines"] = {
            "total": len(de_list),
            "existing": existing_count,
            "new": len(de_list) - existing_count,
        }

    # Components (match by name + project name)
    comp_list = data.get("components", [])
    if comp_list:
        # Build a set of (component_name, project_name) in DB
        existing_comps = set()
        for c in (
            db.query(models.Component.name, models.Project.name)
            .join(models.Project, models.Component.project_id == models.Project.id)
            .filter(
                models.Component.is_deleted == False,  # noqa: E712
                models.Project.is_deleted == False,  # noqa: E712
            )
            .all()
        ):
            existing_comps.add((c[0], c[1]))

        existing_count = sum(
            1 for c in comp_list
            if (c.get("name"), c.get("project_name")) in existing_comps
        )
        summary["components"] = {
            "total": len(comp_list),
            "existing": existing_count,
            "new": len(comp_list) - existing_count,
        }

    return schemas.ImportPreviewResponse(
        valid=True,
        version=parsed.get("version", ""),
        type=parsed.get("type", ""),
        exported_at=parsed.get("exported_at", ""),
        summary=summary,
        warnings=warnings,
    )


@router.post("/import", response_model=schemas.ImportResponse)
@limiter.limit("5/minute")
def import_backup(
    request: Request,
    file: UploadFile = File(...),
    passphrase: str = Form(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_superuser),
):
    content = file.file.read()
    parsed, aes_key = _parse_and_validate(content, passphrase)

    data = parsed.get("data", {})
    backup_type = parsed.get("type", "full_backup")
    details: list[dict] = []
    created = 0
    skipped = 0
    errors = 0

    try:
        # 1. Settings
        for item in data.get("settings", []):
            key = item.get("key")
            if not key:
                continue
            existing = db.query(models.Setting).filter(models.Setting.key == key).first()
            if existing:
                skipped += 1
                details.append({"type": "setting", "name": key, "action": "skipped", "reason": "Already exists"})
            else:
                db.add(models.Setting(
                    key=key,
                    value=item.get("value", ""),
                    description=item.get("description"),
                ))
                created += 1
                details.append({"type": "setting", "name": key, "action": "created"})
        db.flush()

        # 2. Users
        email_to_user: dict[str, models.User] = {}
        for item in data.get("users", []):
            email = item.get("email")
            if not email:
                continue
            existing = db.query(models.User).filter(models.User.email == email).first()
            if existing:
                email_to_user[email] = existing
                skipped += 1
                details.append({"type": "user", "name": email, "action": "skipped", "reason": "Already exists"})
            else:
                new_user = models.User(
                    email=email,
                    full_name=item.get("full_name"),
                    hashed_password="imported",
                    is_active=item.get("is_active", True),
                    is_superuser=item.get("is_superuser", False),
                )
                db.add(new_user)
                db.flush()
                email_to_user[email] = new_user
                created += 1
                details.append({"type": "user", "name": email, "action": "created"})
        db.flush()

        # 3. Groups
        name_to_group: dict[str, models.Group] = {}
        for item in data.get("groups", []):
            gname = item.get("name")
            if not gname:
                continue
            existing = db.query(models.Group).filter(models.Group.name == gname).first()
            if existing:
                name_to_group[gname] = existing
                skipped += 1
                details.append({"type": "group", "name": gname, "action": "skipped", "reason": "Already exists"})
            else:
                new_group = models.Group(name=gname, description=item.get("description"))
                db.add(new_group)
                db.flush()
                name_to_group[gname] = new_group
                created += 1
                details.append({"type": "group", "name": gname, "action": "created"})
        db.flush()

        # 4. user_group_links
        for item in data.get("user_group_links", []):
            uemail = item.get("user_email")
            gname = item.get("group_name")
            user_obj = email_to_user.get(uemail) if uemail else None
            group_obj = name_to_group.get(gname) if gname else None
            if not user_obj or not group_obj:
                skipped += 1
                details.append({
                    "type": "user_group_link",
                    "name": f"{uemail} -> {gname}",
                    "action": "skipped",
                    "reason": "User or group not found",
                })
                continue
            # Check if link already exists
            existing_link = db.execute(
                models.user_group_link.select().where(
                    models.user_group_link.c.user_id == user_obj.id,
                    models.user_group_link.c.group_id == group_obj.id,
                )
            ).first()
            if existing_link:
                skipped += 1
                details.append({
                    "type": "user_group_link",
                    "name": f"{uemail} -> {gname}",
                    "action": "skipped",
                    "reason": "Already exists",
                })
            else:
                db.execute(
                    insert(models.user_group_link).values(
                        user_id=user_obj.id,
                        group_id=group_obj.id,
                    )
                )
                created += 1
                details.append({
                    "type": "user_group_link",
                    "name": f"{uemail} -> {gname}",
                    "action": "created",
                })
        db.flush()

        # 5. Project folders (sort: None parent first, then the rest)
        old_folder_id_to_new: dict[str, uuid.UUID] = {}
        name_to_folder: dict[str, models.ProjectFolder] = {}
        folders_data = data.get("project_folders", [])
        # Sort so that folders without parent_id come first
        folders_sorted = sorted(folders_data, key=lambda f: (f.get("parent_id") is not None, f.get("parent_id") or ""))
        for item in folders_sorted:
            fname = item.get("name")
            if not fname:
                continue
            old_id = item.get("id")
            parent_id_raw = item.get("parent_id")
            # Resolve parent via old->new map
            new_parent_id = old_folder_id_to_new.get(parent_id_raw) if parent_id_raw else None

            # Match by name + parent
            query = db.query(models.ProjectFolder).filter(
                models.ProjectFolder.name == fname,
                models.ProjectFolder.is_deleted == False,  # noqa: E712
            )
            if new_parent_id:
                query = query.filter(models.ProjectFolder.parent_id == new_parent_id)
            else:
                query = query.filter(models.ProjectFolder.parent_id.is_(None))
            existing = query.first()

            if existing:
                if old_id:
                    old_folder_id_to_new[old_id] = existing.id
                name_to_folder[fname] = existing
                skipped += 1
                details.append({"type": "project_folder", "name": fname, "action": "skipped", "reason": "Already exists"})
            else:
                # Resolve created_by via email if possible
                creator_id = None
                if item.get("created_by"):
                    # created_by in export is a UUID string; try to find user by old id mapping
                    # For simplicity, leave creator_id as None for imported folders
                    creator_id = current_user.id

                new_folder = models.ProjectFolder(
                    name=fname,
                    color=item.get("color"),
                    position=item.get("position", 0),
                    parent_id=new_parent_id,
                    created_by=creator_id,
                )
                db.add(new_folder)
                db.flush()
                if old_id:
                    old_folder_id_to_new[old_id] = new_folder.id
                name_to_folder[fname] = new_folder
                created += 1
                details.append({"type": "project_folder", "name": fname, "action": "created"})
        db.flush()

        # 6. Projects
        name_to_project: dict[str, models.Project] = {}
        for item in data.get("projects", []):
            pname = item.get("name")
            if not pname:
                continue
            existing = (
                db.query(models.Project)
                .filter(models.Project.name == pname, models.Project.is_deleted == False)  # noqa: E712
                .first()
            )
            if existing:
                name_to_project[pname] = existing
                skipped += 1
                details.append({"type": "project", "name": pname, "action": "skipped", "reason": "Already exists"})
            else:
                # Resolve folder_id
                folder_id_raw = item.get("folder_id")
                new_folder_id = old_folder_id_to_new.get(folder_id_raw) if folder_id_raw else None

                # Resolve created_by: use current user as fallback
                creator_id = current_user.id

                env_val = item.get("environment")
                environment = None
                if env_val:
                    try:
                        environment = models.EnvironmentEnum(env_val)
                    except ValueError:
                        environment = models.EnvironmentEnum.dev

                new_project = models.Project(
                    name=pname,
                    description=item.get("description"),
                    primary_domain=item.get("primary_domain"),
                    environment=environment,
                    deployment_note=item.get("deployment_note"),
                    folder_id=new_folder_id,
                    created_by=creator_id,
                )
                db.add(new_project)
                db.flush()
                name_to_project[pname] = new_project
                created += 1
                details.append({"type": "project", "name": pname, "action": "created"})
        db.flush()

        # 7. Servers
        name_to_server: dict[str, models.Server] = {}
        for item in data.get("servers", []):
            sname = item.get("name")
            if not sname:
                continue
            existing = (
                db.query(models.Server)
                .filter(models.Server.name == sname, models.Server.is_deleted == False)  # noqa: E712
                .first()
            )
            if existing:
                name_to_server[sname] = existing
                skipped += 1
                details.append({"type": "server", "name": sname, "action": "skipped", "reason": "Already exists"})
            else:
                decrypted = decrypt_sensitive_fields(item, SENSITIVE_FIELDS["servers"], aes_key)
                new_server = models.Server(
                    name=sname,
                    ip_address=decrypted.get("ip_address", "0.0.0.0"),
                    os=decrypted.get("os"),
                    region=decrypted.get("region"),
                    username=decrypted.get("username"),
                    password=decrypted.get("password"),  # EncryptedString auto-encrypts on bind
                    ssh_key=decrypted.get("ssh_key"),    # EncryptedString auto-encrypts on bind
                    created_by=current_user.id,
                )
                db.add(new_server)
                db.flush()
                name_to_server[sname] = new_server
                created += 1
                details.append({"type": "server", "name": sname, "action": "created"})
        db.flush()

        # 8. Database engines
        name_to_db_engine: dict[str, models.DatabaseEngine] = {}
        for item in data.get("database_engines", []):
            dname = item.get("name")
            if not dname:
                continue
            existing = (
                db.query(models.DatabaseEngine)
                .filter(models.DatabaseEngine.name == dname, models.DatabaseEngine.is_deleted == False)  # noqa: E712
                .first()
            )
            if existing:
                name_to_db_engine[dname] = existing
                skipped += 1
                details.append({"type": "database_engine", "name": dname, "action": "skipped", "reason": "Already exists"})
            else:
                decrypted = decrypt_sensitive_fields(item, SENSITIVE_FIELDS["database_engines"], aes_key)
                new_de = models.DatabaseEngine(
                    name=dname,
                    engine=decrypted.get("engine", "unknown"),
                    host=decrypted.get("host", "unknown"),
                    port=decrypted.get("port"),
                    connection_string_format=decrypted.get("connection_string_format"),
                    username=decrypted.get("username"),
                    password=decrypted.get("password"),  # EncryptedString auto-encrypts on bind
                    created_by=current_user.id,
                )
                db.add(new_de)
                db.flush()
                name_to_db_engine[dname] = new_de
                created += 1
                details.append({"type": "database_engine", "name": dname, "action": "created"})
        db.flush()

        # 9. Project servers
        for item in data.get("project_servers", []):
            pname = item.get("project_name")
            sname = item.get("server_name")
            proj = name_to_project.get(pname) if pname else None
            srv = name_to_server.get(sname) if sname else None
            if not proj or not srv:
                skipped += 1
                details.append({
                    "type": "project_server",
                    "name": f"{pname} -> {sname}",
                    "action": "skipped",
                    "reason": "Project or server not found",
                })
                continue
            existing = (
                db.query(models.ProjectServer)
                .filter(
                    models.ProjectServer.project_id == proj.id,
                    models.ProjectServer.server_id == srv.id,
                )
                .first()
            )
            if existing:
                skipped += 1
                details.append({
                    "type": "project_server",
                    "name": f"{pname} -> {sname}",
                    "action": "skipped",
                    "reason": "Already exists",
                })
            else:
                decrypted = decrypt_sensitive_fields(item, SENSITIVE_FIELDS["project_servers"], aes_key)
                new_ps = models.ProjectServer(
                    project_id=proj.id,
                    server_id=srv.id,
                    username=decrypted.get("username"),
                    password=decrypted.get("password"),
                    ssh_key=decrypted.get("ssh_key"),
                )
                db.add(new_ps)
                created += 1
                details.append({
                    "type": "project_server",
                    "name": f"{pname} -> {sname}",
                    "action": "created",
                })
        db.flush()

        # 10. Project databases
        for item in data.get("project_databases", []):
            pname = item.get("project_name")
            dename = item.get("database_engine_name")
            proj = name_to_project.get(pname) if pname else None
            de_obj = name_to_db_engine.get(dename) if dename else None
            if not proj or not de_obj:
                skipped += 1
                details.append({
                    "type": "project_database",
                    "name": f"{pname} -> {dename}",
                    "action": "skipped",
                    "reason": "Project or database engine not found",
                })
                continue
            existing = (
                db.query(models.ProjectDatabase)
                .filter(
                    models.ProjectDatabase.project_id == proj.id,
                    models.ProjectDatabase.database_engine_id == de_obj.id,
                )
                .first()
            )
            if existing:
                skipped += 1
                details.append({
                    "type": "project_database",
                    "name": f"{pname} -> {dename}",
                    "action": "skipped",
                    "reason": "Already exists",
                })
            else:
                decrypted = decrypt_sensitive_fields(item, SENSITIVE_FIELDS["project_databases"], aes_key)
                new_pd = models.ProjectDatabase(
                    project_id=proj.id,
                    database_engine_id=de_obj.id,
                    db_name=decrypted.get("db_name", ""),
                    username=decrypted.get("username"),
                    password=decrypted.get("password"),
                )
                db.add(new_pd)
                created += 1
                details.append({
                    "type": "project_database",
                    "name": f"{pname} -> {dename}",
                    "action": "created",
                })
        db.flush()

        # 11. Components
        for item in data.get("components", []):
            cname = item.get("name")
            pname = item.get("project_name")
            if not cname or not pname:
                continue
            proj = name_to_project.get(pname)
            if not proj:
                skipped += 1
                details.append({
                    "type": "component",
                    "name": cname,
                    "action": "skipped",
                    "reason": f"Project '{pname}' not found",
                })
                continue
            existing = (
                db.query(models.Component)
                .filter(
                    models.Component.name == cname,
                    models.Component.project_id == proj.id,
                    models.Component.is_deleted == False,  # noqa: E712
                )
                .first()
            )
            if existing:
                skipped += 1
                details.append({"type": "component", "name": cname, "action": "skipped", "reason": "Already exists"})
            else:
                decrypted = decrypt_sensitive_fields(item, SENSITIVE_FIELDS["components"], aes_key)
                # custom_fields is now a dict after decryption; ORM EncryptedJSON will re-encrypt on bind
                custom_fields = decrypted.get("custom_fields")
                if isinstance(custom_fields, str):
                    try:
                        custom_fields = json.loads(custom_fields)
                    except (json.JSONDecodeError, ValueError):
                        custom_fields = {}

                new_comp = models.Component(
                    name=cname,
                    type=decrypted.get("type", "unknown"),
                    custom_fields=custom_fields if isinstance(custom_fields, dict) else {},
                    project_id=proj.id,
                )
                db.add(new_comp)
                created += 1
                details.append({"type": "component", "name": cname, "action": "created"})
        db.flush()

        # 12. Project group accesses
        for item in data.get("project_group_accesses", []):
            pname = item.get("project_name")
            gname = item.get("group_name")
            proj = name_to_project.get(pname) if pname else None
            grp = name_to_group.get(gname) if gname else None
            if not proj or not grp:
                skipped += 1
                details.append({
                    "type": "project_group_access",
                    "name": f"{pname} -> {gname}",
                    "action": "skipped",
                    "reason": "Project or group not found",
                })
                continue
            existing = (
                db.query(models.ProjectGroupAccess)
                .filter(
                    models.ProjectGroupAccess.project_id == proj.id,
                    models.ProjectGroupAccess.group_id == grp.id,
                )
                .first()
            )
            if existing:
                skipped += 1
                details.append({
                    "type": "project_group_access",
                    "name": f"{pname} -> {gname}",
                    "action": "skipped",
                    "reason": "Already exists",
                })
            else:
                access_val = item.get("access_level", "Viewer")
                try:
                    access_level = models.AccessLevelEnum(access_val)
                except ValueError:
                    access_level = models.AccessLevelEnum.VIEWER
                new_pga = models.ProjectGroupAccess(
                    project_id=proj.id,
                    group_id=grp.id,
                    access_level=access_level,
                )
                db.add(new_pga)
                created += 1
                details.append({
                    "type": "project_group_access",
                    "name": f"{pname} -> {gname}",
                    "action": "created",
                })
        db.flush()

        # 13. Project user accesses
        for item in data.get("project_user_accesses", []):
            pname = item.get("project_name")
            uemail = item.get("user_email")
            proj = name_to_project.get(pname) if pname else None
            usr = email_to_user.get(uemail) if uemail else None
            if not proj or not usr:
                skipped += 1
                details.append({
                    "type": "project_user_access",
                    "name": f"{pname} -> {uemail}",
                    "action": "skipped",
                    "reason": "Project or user not found",
                })
                continue
            existing = (
                db.query(models.ProjectUserAccess)
                .filter(
                    models.ProjectUserAccess.project_id == proj.id,
                    models.ProjectUserAccess.user_id == usr.id,
                )
                .first()
            )
            if existing:
                skipped += 1
                details.append({
                    "type": "project_user_access",
                    "name": f"{pname} -> {uemail}",
                    "action": "skipped",
                    "reason": "Already exists",
                })
            else:
                access_val = item.get("access_level", "Viewer")
                try:
                    access_level = models.AccessLevelEnum(access_val)
                except ValueError:
                    access_level = models.AccessLevelEnum.VIEWER
                new_pua = models.ProjectUserAccess(
                    project_id=proj.id,
                    user_id=usr.id,
                    access_level=access_level,
                )
                db.add(new_pua)
                created += 1
                details.append({
                    "type": "project_user_access",
                    "name": f"{pname} -> {uemail}",
                    "action": "created",
                })
        db.flush()

        db.commit()

        audit_resource = "System" if backup_type == "full_backup" else "Project"
        log_audit(db, current_user.id, "IMPORTED", audit_resource)

        return schemas.ImportResponse(
            success=True,
            created=created,
            skipped=skipped,
            errors=errors,
            details=details,
        )

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Import failed: %s", exc)
        errors += 1
        details.append({
            "type": "system",
            "name": "import",
            "action": "error",
            "reason": str(exc),
        })
        return schemas.ImportResponse(
            success=False,
            created=created,
            skipped=skipped,
            errors=errors,
            details=details,
        )
