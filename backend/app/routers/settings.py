from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_user, get_current_active_superuser

router = APIRouter(
    prefix="/settings",
    tags=["Settings"]
)

# Initialize default settings if they don't exist
def init_default_settings(db: Session):
    defaults = [
        {"key": "app_name", "value": "InfraManager", "description": "Global Application Name"},
        {"key": "theme", "value": "dark", "description": "Default UI Theme (dark/light)"},
        {"key": "admin_email", "value": "admin@inframanager", "description": "Admin Contact Email"},
        {"key": "admin_name", "value": "DevOps Admin", "description": "Admin Display Name"}
    ]
    for d in defaults:
        existing = db.query(models.Setting).filter(models.Setting.key == d["key"]).first()
        if not existing:
            new_setting = models.Setting(**d)
            db.add(new_setting)
    db.commit()

@router.get("/", response_model=List[schemas.SettingResponse])
def get_all_settings(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    init_default_settings(db)
    settings = db.query(models.Setting).all()
    return settings

@router.put("/{key}", response_model=schemas.SettingResponse)
def update_setting(key: str, setting_update: schemas.SettingUpdate, db: Session = Depends(get_db), _: models.User = Depends(get_current_active_superuser)):
    setting = db.query(models.Setting).filter(models.Setting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    update_data = setting_update.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(setting, k, v)
        
    db.commit()
    db.refresh(setting)
    return setting
