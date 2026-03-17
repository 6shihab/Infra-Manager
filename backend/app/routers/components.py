import uuid
from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_user, get_accessible_project_ids, require_project_role
from app.audit import log_audit

router = APIRouter(prefix="/components", tags=["components"], dependencies=[Depends(get_current_user)])

from app.rate_limit import limiter


def _require_editor_or_admin(user: models.User, project_id: uuid.UUID, db: Session):
    """Raise 403 if user is not superuser, project creator, or Editor/Admin on this project."""
    if user.is_superuser:
        return
    project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.is_deleted == False).first()
    if project and project.created_by == user.id:
        return
    user_group_ids = [g.id for g in user.groups]
    if user_group_ids:
        if db.query(models.ProjectGroupAccess).filter(
            models.ProjectGroupAccess.project_id == project_id,
            models.ProjectGroupAccess.group_id.in_(user_group_ids),
            models.ProjectGroupAccess.access_level.in_(["Editor", "Admin"]),
        ).first():
            return
    if db.query(models.ProjectUserAccess).filter(
        models.ProjectUserAccess.project_id == project_id,
        models.ProjectUserAccess.user_id == user.id,
        models.ProjectUserAccess.access_level.in_(["Editor", "Admin"]),
    ).first():
        return
    raise HTTPException(status_code=403, detail="Viewer role cannot modify components")


def _require_admin(user: models.User, project_id: uuid.UUID, db: Session):
    """Raise 403 if user is not superuser, project creator, or Admin on this project."""
    if user.is_superuser:
        return
    project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.is_deleted == False).first()
    if project and project.created_by == user.id:
        return
    user_group_ids = [g.id for g in user.groups]
    if user_group_ids:
        if db.query(models.ProjectGroupAccess).filter(
            models.ProjectGroupAccess.project_id == project_id,
            models.ProjectGroupAccess.group_id.in_(user_group_ids),
            models.ProjectGroupAccess.access_level.in_(["Admin"]),
        ).first():
            return
    if db.query(models.ProjectUserAccess).filter(
        models.ProjectUserAccess.project_id == project_id,
        models.ProjectUserAccess.user_id == user.id,
        models.ProjectUserAccess.access_level.in_(["Admin"]),
    ).first():
        return
    raise HTTPException(status_code=403, detail="Admin role required to delete components")

@router.get("/", response_model=List[schemas.ComponentResponse])
def read_components(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    accessible = get_accessible_project_ids(current_user, db)
    q = db.query(models.Component).filter(models.Component.is_deleted == False)
    if accessible is not None:
        q = q.filter(models.Component.project_id.in_(accessible))
    return q.offset(skip).limit(limit).all()

@router.post("/", response_model=schemas.ComponentResponse)
@limiter.limit("20/minute")
def create_component(request: Request, component: schemas.ComponentCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == component.project_id, models.Project.is_deleted == False).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _require_editor_or_admin(current_user, component.project_id, db)

    db_component = models.Component(**component.model_dump())
    db.add(db_component)
    db.commit()
    db.refresh(db_component)
    log_audit(db, current_user.id, "CREATED", "Component", db_component.name)
    return db_component

@router.get("/{component_id}", response_model=schemas.ComponentResponse)
def read_component(component_id: uuid.UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_component = db.query(models.Component).filter(models.Component.id == component_id, models.Component.is_deleted == False).first()
    if db_component is None:
        raise HTTPException(status_code=404, detail="Component not found")
    accessible = get_accessible_project_ids(current_user, db)
    if accessible is not None and db_component.project_id not in accessible:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return db_component

@router.put("/{component_id}", response_model=schemas.ComponentResponse)
def update_component(component_id: uuid.UUID, component: schemas.ComponentUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_component = db.query(models.Component).filter(models.Component.id == component_id, models.Component.is_deleted == False).first()
    if db_component is None:
        raise HTTPException(status_code=404, detail="Component not found")
    _require_editor_or_admin(current_user, db_component.project_id, db)

    update_data = component.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_component, key, value)
        
    db.commit()
    db.refresh(db_component)
    log_audit(db, current_user.id, "UPDATED", "Component", db_component.name)
    return db_component

@router.delete("/{component_id}")
def delete_component(component_id: uuid.UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_component = db.query(models.Component).filter(models.Component.id == component_id, models.Component.is_deleted == False).first()
    if db_component is None:
        raise HTTPException(status_code=404, detail="Component not found")
    _require_admin(current_user, db_component.project_id, db)

    comp_name = db_component.name
    db_component.is_deleted = True
    db_component.deleted_at = datetime.utcnow()
    db.commit()
    log_audit(db, current_user.id, "DELETED", "Component", comp_name)
    return {"status": "deleted"}
