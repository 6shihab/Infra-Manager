from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_user
from app.audit import log_audit

router = APIRouter(prefix="/databases", tags=["databases"], dependencies=[Depends(get_current_user)])

from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

@router.get("/", response_model=List[schemas.DatabaseEngineResponse])
def read_databases(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    databases = db.query(models.DatabaseEngine).filter(models.DatabaseEngine.is_deleted == False).offset(skip).limit(limit).all()
    return databases

@router.post("/", response_model=schemas.DatabaseEngineResponse)
@limiter.limit("20/minute")
def create_database(request: Request, database: schemas.DatabaseEngineCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_database = models.DatabaseEngine(**database.model_dump())
    db.add(db_database)
    db.commit()
    db.refresh(db_database)
    log_audit(db, current_user.id, "CREATED", "DatabaseEngine", db_database.name)
    return db_database

@router.get("/{database_id}", response_model=schemas.DatabaseEngineResponse)
def read_database(database_id: int, db: Session = Depends(get_db)):
    db_database = db.query(models.DatabaseEngine).filter(models.DatabaseEngine.id == database_id, models.DatabaseEngine.is_deleted == False).first()
    if db_database is None:
        raise HTTPException(status_code=404, detail="DatabaseEngine not found")
    return db_database

@router.put("/{database_id}", response_model=schemas.DatabaseEngineResponse)
def update_database(database_id: int, database: schemas.DatabaseEngineUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_database = db.query(models.DatabaseEngine).filter(models.DatabaseEngine.id == database_id, models.DatabaseEngine.is_deleted == False).first()
    if db_database is None:
        raise HTTPException(status_code=404, detail="DatabaseEngine not found")
        
    update_data = database.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_database, key, value)
        
    db.commit()
    db.refresh(db_database)
    log_audit(db, current_user.id, "UPDATED", "DatabaseEngine", db_database.name)
    return db_database

@router.delete("/{database_id}")
def delete_database(database_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_database = db.query(models.DatabaseEngine).filter(models.DatabaseEngine.id == database_id, models.DatabaseEngine.is_deleted == False).first()
    if db_database is None:
        raise HTTPException(status_code=404, detail="DatabaseEngine not found")
    
    db_name = db_database.name
    db_database.is_deleted = True
    db_database.deleted_at = datetime.utcnow()
    db.commit()
    log_audit(db, current_user.id, "DELETED", "DatabaseEngine", db_name)
    return {"status": "deleted"}
