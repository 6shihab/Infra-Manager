import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_active_superuser

router = APIRouter(prefix="/groups", tags=["groups"])

@router.get("/", response_model=List[schemas.GroupResponse])
def read_groups(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_superuser)):
    return db.query(models.Group).offset(skip).limit(limit).all()

@router.post("/", response_model=schemas.GroupResponse)
def create_group(group: schemas.GroupCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_superuser)):
    db_group = models.Group(**group.model_dump())
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    return db_group

@router.delete("/{group_id}")
def delete_group(group_id: uuid.UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_superuser)):
    db_group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not db_group:
        raise HTTPException(status_code=404, detail="Group not found")
    db.delete(db_group)
    db.commit()
    return {"status": "deleted"}

@router.post("/{group_id}/users/{user_id}")
def add_user_to_group(group_id: uuid.UUID, user_id: uuid.UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_superuser)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not group or not user:
        raise HTTPException(status_code=404, detail="Group or User not found")
    
    if user not in group.users:
        group.users.append(user)
        db.commit()
    return {"status": "success", "message": f"User {user_id} added to Group {group_id}"}

@router.delete("/{group_id}/users/{user_id}")
def remove_user_from_group(group_id: uuid.UUID, user_id: uuid.UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_superuser)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not group or not user:
        raise HTTPException(status_code=404, detail="Group or User not found")
    if user in group.users:
        group.users.remove(user)
        db.commit()
    return {"status": "success"}
