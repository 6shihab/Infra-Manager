from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models
from app.database import get_db

router = APIRouter(prefix="/components", tags=["components"])

@router.get("/", response_model=List[schemas.ComponentResponse])
def read_components(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    components = db.query(models.Component).offset(skip).limit(limit).all()
    return components

@router.post("/", response_model=schemas.ComponentResponse)
def create_component(component: schemas.ComponentCreate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == component.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    db_component = models.Component(**component.model_dump())
    db.add(db_component)
    db.commit()
    db.refresh(db_component)
    return db_component

@router.get("/{component_id}", response_model=schemas.ComponentResponse)
def read_component(component_id: int, db: Session = Depends(get_db)):
    db_component = db.query(models.Component).filter(models.Component.id == component_id).first()
    if db_component is None:
        raise HTTPException(status_code=404, detail="Component not found")
    return db_component

@router.put("/{component_id}", response_model=schemas.ComponentResponse)
def update_component(component_id: int, component: schemas.ComponentUpdate, db: Session = Depends(get_db)):
    db_component = db.query(models.Component).filter(models.Component.id == component_id).first()
    if db_component is None:
        raise HTTPException(status_code=404, detail="Component not found")
        
    update_data = component.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_component, key, value)
        
    db.commit()
    db.refresh(db_component)
    return db_component

@router.delete("/{component_id}")
def delete_component(component_id: int, db: Session = Depends(get_db)):
    db_component = db.query(models.Component).filter(models.Component.id == component_id).first()
    if db_component is None:
        raise HTTPException(status_code=404, detail="Component not found")
    db.delete(db_component)
    db.commit()
    return {"status": "deleted"}
