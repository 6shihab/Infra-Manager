import uuid
from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.responses import Response
from datetime import datetime
from fastapi_cache.decorator import cache
from sqlalchemy import or_, func
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_user, get_current_active_superuser, require_project_role
from app.audit import log_audit
from app.routers.servers import _can_edit_server, _can_delete_server
from app.routers.databases import _can_edit_database, _can_delete_database

router = APIRouter(prefix="/projects", tags=["projects"], dependencies=[Depends(get_current_user)])

from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)


def _get_user_project_role(db: Session, user: models.User, project_id: uuid.UUID) -> str:
    """Return the effective role for a user on a project: Admin, Editor, or Viewer."""
    if user.is_superuser:
        return "Admin"
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if project and project.created_by == user.id:
        return "Admin"
    user_group_ids = [g.id for g in user.groups]
    # Role priority: Admin > Editor > Viewer — check both group and direct user access
    for role in ("Admin", "Editor", "Viewer"):
        if user_group_ids:
            access = db.query(models.ProjectGroupAccess).filter(
                models.ProjectGroupAccess.project_id == project_id,
                models.ProjectGroupAccess.group_id.in_(user_group_ids),
                models.ProjectGroupAccess.access_level == role,
            ).first()
            if access:
                return role
        direct = db.query(models.ProjectUserAccess).filter(
            models.ProjectUserAccess.project_id == project_id,
            models.ProjectUserAccess.user_id == user.id,
            models.ProjectUserAccess.access_level == role,
        ).first()
        if direct:
            return role
    return "Viewer"


def _project_member_ids(db: Session, project_id: uuid.UUID) -> list[int]:
    """Return all user IDs that have access to a project (via group access or creator)."""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    creator_id = project.created_by if project and project.created_by else None

    accesses = db.query(models.ProjectGroupAccess).filter(
        models.ProjectGroupAccess.project_id == project_id
    ).all()
    group_ids = [a.group_id for a in accesses]

    user_ids: set[int] = set()
    if creator_id:
        user_ids.add(creator_id)
    if group_ids:
        rows = db.query(models.user_group_link.c.user_id).filter(
            models.user_group_link.c.group_id.in_(group_ids)
        ).distinct().all()
        user_ids.update(r[0] for r in rows)

    direct_users = db.query(models.ProjectUserAccess.user_id).filter(
        models.ProjectUserAccess.project_id == project_id
    ).all()
    user_ids.update(r[0] for r in direct_users)

    return list(user_ids)

@router.post("/", response_model=schemas.ProjectResponse)
@limiter.limit("20/minute")
def create_project(request: Request, project: schemas.ProjectCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_project = models.Project(**project.model_dump(), created_by=current_user.id)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)

    log_audit(db, current_user.id, "CREATED", "Project", db_project.name)
    return db_project

@router.get("/", response_model=List[schemas.ProjectListResponse])
def read_projects(skip: int = 0, limit: int = 100, response: Response = None, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.is_superuser:
        base_q = db.query(models.Project).filter(models.Project.is_deleted == False)
    else:
        user_group_ids = [g.id for g in current_user.groups]
        base_q = db.query(models.Project).filter(models.Project.is_deleted == False)
        direct_project_ids = db.query(models.ProjectUserAccess.project_id).filter(
            models.ProjectUserAccess.user_id == current_user.id
        )
        if user_group_ids:
            base_q = base_q.filter(
                or_(
                    models.Project.created_by == current_user.id,
                    models.Project.id.in_(
                        db.query(models.ProjectGroupAccess.project_id).filter(
                            models.ProjectGroupAccess.group_id.in_(user_group_ids)
                        )
                    ),
                    models.Project.id.in_(direct_project_ids)
                )
            )
        else:
            base_q = base_q.filter(
                or_(
                    models.Project.created_by == current_user.id,
                    models.Project.id.in_(direct_project_ids)
                )
            )

    total = base_q.count()
    if response:
        response.headers["X-Total-Count"] = str(total)
    projects = base_q.offset(skip).limit(limit).all()

    if not projects:
        return []

    project_ids = [p.id for p in projects]

    server_counts = dict(
        db.query(models.ProjectServer.project_id, func.count(models.ProjectServer.server_id))
        .filter(models.ProjectServer.project_id.in_(project_ids))
        .group_by(models.ProjectServer.project_id)
        .all()
    )
    db_counts = dict(
        db.query(models.ProjectDatabase.project_id, func.count(models.ProjectDatabase.database_engine_id))
        .filter(models.ProjectDatabase.project_id.in_(project_ids))
        .group_by(models.ProjectDatabase.project_id)
        .all()
    )

    return [
        schemas.ProjectListResponse(
            id=p.id, name=p.name, description=p.description,
            primary_domain=p.primary_domain, environment=p.environment,
            is_online=p.is_online, last_checked_at=p.last_checked_at,
            created_by=p.created_by,
            server_count=server_counts.get(p.id, 0),
            database_count=db_counts.get(p.id, 0),
        )
        for p in projects
    ]

@router.get("/{project_id}", response_model=schemas.ProjectResponse)
def read_project(project_id: uuid.UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user), _: bool = Depends(require_project_role(["Viewer", "Editor", "Admin"]))):
    db_project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.is_deleted == False).first()
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    role = _get_user_project_role(db, current_user, project_id)
    # Attach role to the ORM object temporarily for the response serializer
    db_project.current_user_role = role
    active_server_links = [l for l in db_project.server_links if not l.server.is_deleted]
    for link in active_server_links:
        link.server.can_edit = _can_edit_server(current_user, link.server, db)
        link.server.can_delete = _can_delete_server(current_user, link.server, db)
    db_project.server_links = active_server_links
    active_db_links = [l for l in db_project.database_links if not l.database_engine.is_deleted]
    for link in active_db_links:
        link.database_engine.can_edit = _can_edit_database(current_user, link.database_engine, db)
        link.database_engine.can_delete = _can_delete_database(current_user, link.database_engine, db)
    db_project.database_links = active_db_links
    db_project.components = [c for c in db_project.components if not c.is_deleted]
    return db_project

@router.put("/{project_id}", response_model=schemas.ProjectResponse)
def update_project(project_id: uuid.UUID, project: schemas.ProjectUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user), _: bool = Depends(require_project_role(["Editor", "Admin"]))):
    db_project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.is_deleted == False).first()
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
        
    update_data = project.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_project, key, value)
        
    db.commit()
    db.refresh(db_project)
    log_audit(db, current_user.id, "UPDATED", "Project", db_project.name,
              target_user_ids=_project_member_ids(db, project_id))
    return db_project

@router.delete("/{project_id}")
def delete_project(project_id: uuid.UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user), _: bool = Depends(require_project_role(["Admin"]))):
    db_project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.is_deleted == False).first()
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project_name = db_project.name
    member_ids = _project_member_ids(db, project_id)
    db_project.is_deleted = True
    db_project.deleted_at = datetime.utcnow()
    db.commit()
    log_audit(db, current_user.id, "DELETED", "Project", project_name,
              target_user_ids=member_ids)
    return {"status": "deleted"}

@router.post("/{project_id}/groups/{group_id}", response_model=schemas.ProjectGroupAccessResponse)
def add_group_to_project(project_id: uuid.UUID, group_id: uuid.UUID, access_level: schemas.AccessLevelEnum = schemas.AccessLevelEnum.VIEWER, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_superuser)):
    # Check if project exists
    project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.is_deleted == False).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check if group exists
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
         raise HTTPException(status_code=404, detail="Group not found")

    # Check for existing mapping
    existing = db.query(models.ProjectGroupAccess).filter(
        models.ProjectGroupAccess.project_id == project_id,
        models.ProjectGroupAccess.group_id == group_id
    ).first()

    if existing:
        existing.access_level = access_level
        db.commit()
        db.refresh(existing)
        group_user_ids = [u.id for u in group.users]
        log_audit(db, current_user.id, "GRANTED_ACCESS", "Project", project.name,
                  target_user_ids=group_user_ids)
        return existing

    new_access = models.ProjectGroupAccess(project_id=project_id, group_id=group_id, access_level=access_level)
    db.add(new_access)
    db.commit()
    db.refresh(new_access)
    group_user_ids = [u.id for u in group.users]
    log_audit(db, current_user.id, "GRANTED_ACCESS", "Project", project.name,
              target_user_ids=group_user_ids)
    return new_access

@router.delete("/{project_id}/groups/{group_id}")
def remove_group_from_project(project_id: uuid.UUID, group_id: uuid.UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_superuser)):
    access = db.query(models.ProjectGroupAccess).filter(
        models.ProjectGroupAccess.project_id == project_id,
        models.ProjectGroupAccess.group_id == group_id
    ).first()

    if not access:
        raise HTTPException(status_code=404, detail="Access rule not found")

    revoked_group = db.query(models.Group).filter(models.Group.id == group_id).first()
    revoked_user_ids = [u.id for u in revoked_group.users] if revoked_group else []
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    project_name = project.name if project else str(project_id)

    db.delete(access)
    db.commit()
    log_audit(db, current_user.id, "REVOKED_ACCESS", "Project", project_name,
              target_user_ids=revoked_user_ids)
    return {"status": "success"}

@router.post("/{project_id}/servers", response_model=schemas.ProjectServerResponse)
def add_server_to_project(project_id: uuid.UUID, link: schemas.ProjectServerCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user), _: bool = Depends(require_project_role(["Editor", "Admin"]))):
    project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.is_deleted == False).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    server = db.query(models.Server).filter(models.Server.id == link.server_id, models.Server.is_deleted == False).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    existing = db.query(models.ProjectServer).filter(
        models.ProjectServer.project_id == project_id,
        models.ProjectServer.server_id == link.server_id
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Server already attached to this project")

    project_server = models.ProjectServer(project_id=project_id, **link.model_dump())
    db.add(project_server)
    db.commit()
    db.refresh(project_server)
    log_audit(db, current_user.id, "ATTACHED", "Server", server.name,
              target_user_ids=_project_member_ids(db, project_id))
    return project_server

@router.delete("/{project_id}/servers/{server_id}")
def remove_server_from_project(project_id: uuid.UUID, server_id: uuid.UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user), _: bool = Depends(require_project_role(["Editor", "Admin"]))):
    link = db.query(models.ProjectServer).filter(
        models.ProjectServer.project_id == project_id,
        models.ProjectServer.server_id == server_id
    ).first()

    if not link:
        raise HTTPException(status_code=404, detail="Server link not found")

    server_name = link.server.name
    member_ids = _project_member_ids(db, project_id)
    db.delete(link)
    db.commit()
    log_audit(db, current_user.id, "DETACHED", "Server", server_name,
              target_user_ids=member_ids)
    return {"status": "success"}

@router.post("/{project_id}/databases", response_model=schemas.ProjectDatabaseResponse)
def add_database_to_project(project_id: uuid.UUID, link: schemas.ProjectDatabaseCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user), _: bool = Depends(require_project_role(["Editor", "Admin"]))):
    project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.is_deleted == False).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    engine = db.query(models.DatabaseEngine).filter(models.DatabaseEngine.id == link.database_engine_id, models.DatabaseEngine.is_deleted == False).first()
    if not engine:
        raise HTTPException(status_code=404, detail="DatabaseEngine not found")

    existing = db.query(models.ProjectDatabase).filter(
        models.ProjectDatabase.project_id == project_id,
        models.ProjectDatabase.database_engine_id == link.database_engine_id
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Database Engine already attached to this project")

    project_db = models.ProjectDatabase(project_id=project_id, **link.model_dump())
    db.add(project_db)
    db.commit()
    db.refresh(project_db)
    log_audit(db, current_user.id, "ATTACHED", "DatabaseEngine", engine.name,
              target_user_ids=_project_member_ids(db, project_id))
    return project_db

@router.delete("/{project_id}/databases/{database_engine_id}")
def remove_database_from_project(project_id: uuid.UUID, database_engine_id: uuid.UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user), _: bool = Depends(require_project_role(["Editor", "Admin"]))):
    link = db.query(models.ProjectDatabase).filter(
        models.ProjectDatabase.project_id == project_id,
        models.ProjectDatabase.database_engine_id == database_engine_id
    ).first()

    if not link:
        raise HTTPException(status_code=404, detail="Database link not found")

    engine_name = link.database_engine.name
    member_ids = _project_member_ids(db, project_id)
    db.delete(link)
    db.commit()
    log_audit(db, current_user.id, "DETACHED", "DatabaseEngine", engine_name,
              target_user_ids=member_ids)
    return {"status": "success"}

@router.post("/{project_id}/users/{user_id}", response_model=schemas.ProjectUserAccessResponse)
def add_user_to_project(project_id: uuid.UUID, user_id: uuid.UUID, access_level: schemas.AccessLevelEnum = schemas.AccessLevelEnum.VIEWER, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_superuser)):
    project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.is_deleted == False).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = db.query(models.ProjectUserAccess).filter(
        models.ProjectUserAccess.project_id == project_id,
        models.ProjectUserAccess.user_id == user_id
    ).first()

    if existing:
        existing.access_level = access_level
        db.commit()
        db.refresh(existing)
        log_audit(db, current_user.id, "GRANTED_ACCESS", "Project", project.name,
                  target_user_ids=[user_id])
        return existing

    new_access = models.ProjectUserAccess(project_id=project_id, user_id=user_id, access_level=access_level)
    db.add(new_access)
    db.commit()
    db.refresh(new_access)
    log_audit(db, current_user.id, "GRANTED_ACCESS", "Project", project.name,
              target_user_ids=[user_id])
    return new_access

@router.delete("/{project_id}/users/{user_id}")
def remove_user_from_project(project_id: uuid.UUID, user_id: uuid.UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_superuser)):
    access = db.query(models.ProjectUserAccess).filter(
        models.ProjectUserAccess.project_id == project_id,
        models.ProjectUserAccess.user_id == user_id
    ).first()

    if not access:
        raise HTTPException(status_code=404, detail="User access not found")

    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    project_name = project.name if project else str(project_id)

    db.delete(access)
    db.commit()
    log_audit(db, current_user.id, "REVOKED_ACCESS", "Project", project_name,
              target_user_ids=[user_id])
    return {"status": "success"}
