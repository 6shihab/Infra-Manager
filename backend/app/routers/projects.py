from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_user
from app.audit import log_audit

router = APIRouter(prefix="/projects", tags=["projects"], dependencies=[Depends(get_current_user)])

from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

@router.post("/", response_model=schemas.ProjectResponse)
@limiter.limit("20/minute")
def create_project(request: Request, project: schemas.ProjectCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_project = models.Project(**project.model_dump())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    log_audit(db, current_user.id, "CREATED", "Project", db_project.name)
    return db_project

@router.get("/", response_model=List[schemas.ProjectResponse])
def read_projects(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    projects = db.query(models.Project).filter(models.Project.is_deleted == False).offset(skip).limit(limit).all()
    return projects

@router.get("/{project_id}", response_model=schemas.ProjectResponse)
def read_project(project_id: int, db: Session = Depends(get_db)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.is_deleted == False).first()
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return db_project

@router.put("/{project_id}", response_model=schemas.ProjectResponse)
def update_project(project_id: int, project: schemas.ProjectUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
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
def delete_project(project_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
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
def add_group_to_project(project_id: int, group_id: int, access_level: schemas.AccessLevelEnum = schemas.AccessLevelEnum.VIEWER, db: Session = Depends(get_db)):
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
        return existing
        
    new_access = models.ProjectGroupAccess(project_id=project_id, group_id=group_id, access_level=access_level)
    db.add(new_access)
    db.commit()
    db.refresh(new_access)
    return new_access

@router.delete("/{project_id}/groups/{group_id}")
def remove_group_from_project(project_id: int, group_id: int, db: Session = Depends(get_db)):
    access = db.query(models.ProjectGroupAccess).filter(
        models.ProjectGroupAccess.project_id == project_id,
        models.ProjectGroupAccess.group_id == group_id
    ).first()
    
    if not access:
        raise HTTPException(status_code=404, detail="Access rule not found")
        
    db.delete(access)
    db.commit()
    return {"status": "success"}
