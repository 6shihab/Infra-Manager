from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/databases", tags=["databases"], dependencies=[Depends(get_current_user)])

@router.get("/", response_model=List[schemas.DatabaseInfoResponse])
def read_databases(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    databases = db.query(models.DatabaseInfo).offset(skip).limit(limit).all()
    return databases

@router.post("/", response_model=schemas.DatabaseInfoResponse)
def create_database(database: schemas.DatabaseInfoCreate, db: Session = Depends(get_db)):
    # Verify project exists
    project = db.query(models.Project).filter(models.Project.id == database.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    db_database = models.DatabaseInfo(**database.model_dump())
    db.add(db_database)
    db.commit()
    db.refresh(db_database)
    return db_database

@router.get("/{database_id}", response_model=schemas.DatabaseInfoResponse)
def read_database(database_id: int, db: Session = Depends(get_db)):
    db_database = db.query(models.DatabaseInfo).filter(models.DatabaseInfo.id == database_id).first()
    if db_database is None:
        raise HTTPException(status_code=404, detail="Database not found")
    return db_database

@router.put("/{database_id}", response_model=schemas.DatabaseInfoResponse)
def update_database(database_id: int, database: schemas.DatabaseInfoUpdate, db: Session = Depends(get_db)):
    db_database = db.query(models.DatabaseInfo).filter(models.DatabaseInfo.id == database_id).first()
    if db_database is None:
        raise HTTPException(status_code=404, detail="Database not found")
        
    update_data = database.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_database, key, value)
        
    db.commit()
    db.refresh(db_database)
    return db_database

@router.delete("/{database_id}")
def delete_database(database_id: int, db: Session = Depends(get_db)):
    db_database = db.query(models.DatabaseInfo).filter(models.DatabaseInfo.id == database_id).first()
    if db_database is None:
        raise HTTPException(status_code=404, detail="Database not found")
    db.delete(db_database)
    db.commit()
    return {"status": "deleted"}
