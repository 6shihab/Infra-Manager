from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime
from fastapi_cache.decorator import cache
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_user, get_current_active_superuser, require_project_role
from app.audit import log_audit

router = APIRouter(prefix="/projects", tags=["projects"], dependencies=[Depends(get_current_user)])

from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

@router.post("/", response_model=schemas.ProjectResponse)
@limiter.limit("20/minute")
def create_project(request: Request, project: schemas.ProjectCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_project = models.Project(**project.model_dump(), created_by=current_user.id)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)

    log_audit(db, current_user.id, "CREATED", "Project", db_project.name)
    return db_project

@router.get("/", response_model=List[schemas.ProjectResponse])
def read_projects(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.is_superuser:
        projects = db.query(models.Project).filter(
            models.Project.is_deleted == False
        ).offset(skip).limit(limit).all()
    else:
        user_group_ids = [group.id for group in current_user.groups]
        projects = db.query(models.Project).outerjoin(
            models.ProjectGroupAccess,
            models.ProjectGroupAccess.project_id == models.Project.id
        ).filter(
            models.Project.is_deleted == False,
            or_(
                models.ProjectGroupAccess.group_id.in_(user_group_ids),
                models.Project.created_by == current_user.id
            )
        ).distinct().offset(skip).limit(limit).all()
    return projects

@router.get("/{project_id}", response_model=schemas.ProjectResponse)
def read_project(project_id: int, db: Session = Depends(get_db), _: bool = Depends(require_project_role(["Viewer", "Editor", "Admin"]))):
    db_project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.is_deleted == False).first()
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return db_project

@router.put("/{project_id}", response_model=schemas.ProjectResponse)
def update_project(project_id: int, project: schemas.ProjectUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user), _: bool = Depends(require_project_role(["Editor", "Admin"]))):
    db_project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.is_deleted == False).first()
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
        
    update_data = project.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_project, key, value)
        
    db.commit()
    db.refresh(db_project)
    log_audit(db, current_user.id, "UPDATED", "Project", db_project.name)
    return db_project

@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user), _: bool = Depends(require_project_role(["Admin"]))):
    db_project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.is_deleted == False).first()
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project_name = db_project.name
    db_project.is_deleted = True
    db_project.deleted_at = datetime.utcnow()
    db.commit()
    log_audit(db, current_user.id, "DELETED", "Project", project_name)
    return {"status": "deleted"}

@router.post("/{project_id}/groups/{group_id}", response_model=schemas.ProjectGroupAccessResponse)
def add_group_to_project(project_id: int, group_id: int, access_level: schemas.AccessLevelEnum = schemas.AccessLevelEnum.VIEWER, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_superuser)):
    # Check if project exists
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
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
        log_audit(db, current_user.id, "GRANTED_ACCESS", "Project", project.name)
        return existing

    new_access = models.ProjectGroupAccess(project_id=project_id, group_id=group_id, access_level=access_level)
    db.add(new_access)
    db.commit()
    db.refresh(new_access)
    log_audit(db, current_user.id, "GRANTED_ACCESS", "Project", project.name)
    return new_access

@router.delete("/{project_id}/groups/{group_id}")
def remove_group_from_project(project_id: int, group_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_superuser)):
    access = db.query(models.ProjectGroupAccess).filter(
        models.ProjectGroupAccess.project_id == project_id,
        models.ProjectGroupAccess.group_id == group_id
    ).first()

    if not access:
        raise HTTPException(status_code=404, detail="Access rule not found")

    db.delete(access)
    db.commit()
    log_audit(db, current_user.id, "REVOKED_ACCESS", "Project", str(project_id))
    return {"status": "success"}

@router.post("/{project_id}/servers", response_model=schemas.ProjectServerResponse)
def add_server_to_project(project_id: int, link: schemas.ProjectServerCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user), _: bool = Depends(require_project_role(["Editor", "Admin"]))):
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
    log_audit(db, current_user.id, "ATTACHED", "Server", server.name)
    return project_server

@router.delete("/{project_id}/servers/{server_id}")
def remove_server_from_project(project_id: int, server_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user), _: bool = Depends(require_project_role(["Editor", "Admin"]))):
    link = db.query(models.ProjectServer).filter(
        models.ProjectServer.project_id == project_id,
        models.ProjectServer.server_id == server_id
    ).first()

    if not link:
        raise HTTPException(status_code=404, detail="Server link not found")

    server_name = link.server.name
    db.delete(link)
    db.commit()
    log_audit(db, current_user.id, "DETACHED", "Server", server_name)
    return {"status": "success"}

@router.post("/{project_id}/databases", response_model=schemas.ProjectDatabaseResponse)
def add_database_to_project(project_id: int, link: schemas.ProjectDatabaseCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user), _: bool = Depends(require_project_role(["Editor", "Admin"]))):
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
    log_audit(db, current_user.id, "ATTACHED", "DatabaseEngine", engine.name)
    return project_db

@router.delete("/{project_id}/databases/{database_engine_id}")
def remove_database_from_project(project_id: int, database_engine_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user), _: bool = Depends(require_project_role(["Editor", "Admin"]))):
    link = db.query(models.ProjectDatabase).filter(
        models.ProjectDatabase.project_id == project_id,
        models.ProjectDatabase.database_engine_id == database_engine_id
    ).first()

    if not link:
        raise HTTPException(status_code=404, detail="Database link not found")

    engine_name = link.database_engine.name
    db.delete(link)
    db.commit()
    log_audit(db, current_user.id, "DETACHED", "DatabaseEngine", engine_name)
    return {"status": "success"}
