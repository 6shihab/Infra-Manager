from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_user, get_accessible_project_ids
from app.audit import log_audit

router = APIRouter(prefix="/components", tags=["components"], dependencies=[Depends(get_current_user)])

from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

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
    project = db.query(models.Project).filter(models.Project.id == component.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    accessible = get_accessible_project_ids(current_user, db)
    if accessible is not None and component.project_id not in accessible:
        raise HTTPException(status_code=403, detail="Not enough permissions")
        
    db_component = models.Component(**component.model_dump())
    db.add(db_component)
    db.commit()
    db.refresh(db_component)
    log_audit(db, current_user.id, "CREATED", "Component", db_component.name)
    return db_component

@router.get("/{component_id}", response_model=schemas.ComponentResponse)
def read_component(component_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_component = db.query(models.Component).filter(models.Component.id == component_id, models.Component.is_deleted == False).first()
    if db_component is None:
        raise HTTPException(status_code=404, detail="Component not found")
    accessible = get_accessible_project_ids(current_user, db)
    if accessible is not None and db_component.project_id not in accessible:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return db_component

@router.put("/{component_id}", response_model=schemas.ComponentResponse)
def update_component(component_id: int, component: schemas.ComponentUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_component = db.query(models.Component).filter(models.Component.id == component_id, models.Component.is_deleted == False).first()
    if db_component is None:
        raise HTTPException(status_code=404, detail="Component not found")
    accessible = get_accessible_project_ids(current_user, db)
    if accessible is not None and db_component.project_id not in accessible:
        raise HTTPException(status_code=403, detail="Not enough permissions")
        
    update_data = component.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_component, key, value)
        
    db.commit()
    db.refresh(db_component)
    log_audit(db, current_user.id, "UPDATED", "Component", db_component.name)
    return db_component

@router.delete("/{component_id}")
def delete_component(component_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_component = db.query(models.Component).filter(models.Component.id == component_id, models.Component.is_deleted == False).first()
    if db_component is None:
        raise HTTPException(status_code=404, detail="Component not found")
    accessible = get_accessible_project_ids(current_user, db)
    if accessible is not None and db_component.project_id not in accessible:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    comp_name = db_component.name
    db_component.is_deleted = True
    db_component.deleted_at = datetime.utcnow()
    db.commit()
    log_audit(db, current_user.id, "DELETED", "Component", comp_name)
    return {"status": "deleted"}
