import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.responses import Response
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_active_superuser, get_current_user
from app.audit import log_audit
from app.keycloak import keycloak_admin

from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/", response_model=List[schemas.UserResponse])
def read_users(skip: int = 0, limit: int = 100, response: Response = None, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_superuser)):
    base_q = db.query(models.User)
    total = base_q.count()
    if response:
        response.headers["X-Total-Count"] = str(total)
    users = base_q.offset(skip).limit(limit).all()
    result = []
    for u in users:
        resp = schemas.UserResponse.model_validate(u)
        result.append(resp)
    return result

@router.post("/", response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_superuser)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user in Keycloak first
    name_parts = (user.full_name or "").split(" ", 1)
    first_name = name_parts[0] if name_parts else ""
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    try:
        keycloak_id = keycloak_admin.create_user(
            email=user.email,
            first_name=first_name,
            last_name=last_name,
            enabled=user.is_active,
            temporary_password=user.password,
            require_password_update=False,
        )
    except Exception as e:
        logger.error("Failed to create user in Keycloak: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create user in identity provider")

    # Assign superuser role if needed
    if user.is_superuser and keycloak_id:
        try:
            keycloak_admin.assign_realm_role(keycloak_id, "superuser")
        except Exception as e:
            logger.warning("Failed to assign superuser role in Keycloak: %s", e)

    # Create local user record
    db_user = models.User(
        keycloak_id=keycloak_id,
        email=user.email,
        hashed_password="keycloak-managed",
        full_name=user.full_name,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    log_audit(db, current_user.id, "CREATED", "User", db_user.email)
    return db_user

@router.put("/me/password")
@limiter.limit("5/minute")
def change_own_password(request: Request, payload: schemas.PasswordChange, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Change password via Keycloak Admin API."""
    if not current_user.keycloak_id:
        raise HTTPException(status_code=400, detail="User not linked to identity provider")

    try:
        keycloak_admin.set_user_password(current_user.keycloak_id, payload.new_password, temporary=False)
    except Exception as e:
        logger.error("Failed to change password in Keycloak: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update password in identity provider")

    log_audit(db, current_user.id, "PASSWORD_CHANGED", "User", current_user.email)
    return {"status": "password updated"}

@router.put("/{user_id}/password")
@limiter.limit("5/minute")
def admin_change_password(request: Request, user_id: uuid.UUID, payload: schemas.AdminPasswordChange, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_superuser)):
    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if not target_user.keycloak_id:
        raise HTTPException(status_code=400, detail="User not linked to identity provider")

    try:
        keycloak_admin.set_user_password(target_user.keycloak_id, payload.new_password, temporary=False)
    except Exception as e:
        logger.error("Failed to change password in Keycloak: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update password in identity provider")

    log_audit(db, current_user.id, "ADMIN_PASSWORD_CHANGED", "User", target_user.email)
    return {"status": "password updated"}

@router.delete("/{user_id}")
def delete_user(user_id: uuid.UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_superuser)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if db_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    # Delete from Keycloak
    if db_user.keycloak_id:
        try:
            keycloak_admin.delete_user(db_user.keycloak_id)
        except Exception as e:
            logger.warning("Failed to delete user from Keycloak: %s", e)

    db.delete(db_user)
    db.commit()
    log_audit(db, current_user.id, "DELETED", "User", db_user.email)
    return {"status": "deleted"}
