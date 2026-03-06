from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_user
from app.audit import log_audit

router = APIRouter(prefix="/servers", tags=["servers"], dependencies=[Depends(get_current_user)])

from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

@router.get("/", response_model=List[schemas.ServerResponse])
def read_servers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    servers = db.query(models.Server).filter(models.Server.is_deleted == False).offset(skip).limit(limit).all()
    return servers

@router.post("/", response_model=schemas.ServerResponse)
@limiter.limit("20/minute")
def create_server(request: Request, server: schemas.ServerCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Verify project exists
    project = db.query(models.Project).filter(models.Project.id == server.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    db_server = models.Server(**server.model_dump())
    db.add(db_server)
    db.commit()
    db.refresh(db_server)
    log_audit(db, current_user.id, "CREATED", "Server", db_server.ip_address)
    return db_server

@router.get("/{server_id}", response_model=schemas.ServerResponse)
def read_server(server_id: int, db: Session = Depends(get_db)):
    db_server = db.query(models.Server).filter(models.Server.id == server_id, models.Server.is_deleted == False).first()
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    return db_server

@router.put("/{server_id}", response_model=schemas.ServerResponse)
def update_server(server_id: int, server: schemas.ServerUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_server = db.query(models.Server).filter(models.Server.id == server_id, models.Server.is_deleted == False).first()
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
        
    update_data = server.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_server, key, value)
        
    db.commit()
    db.refresh(db_server)
    log_audit(db, current_user.id, "UPDATED", "Server", db_server.ip_address)
    return db_server

@router.delete("/{server_id}")
def delete_server(server_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_server = db.query(models.Server).filter(models.Server.id == server_id, models.Server.is_deleted == False).first()
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    
    server_ip = db_server.ip_address
    db_server.is_deleted = True
    db_server.deleted_at = datetime.utcnow()
    db.commit()
    log_audit(db, current_user.id, "DELETED", "Server", server_ip)
    return {"status": "deleted"}
