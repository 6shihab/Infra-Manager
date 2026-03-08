import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from cryptography.fernet import Fernet
import jwt
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError

from app import models, schemas
from app.database import get_db
from app.config import settings

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

def is_token_blacklisted(db: Session, token: str) -> bool:
    """Check if a token has been explicitly revoked."""
    blacklisted_token = db.query(models.TokenBlocklist).filter(models.TokenBlocklist.token == token).first()
    return blacklisted_token is not None

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    if is_token_blacklisted(db, token):
        logger.warning("Rejected blacklisted token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except (InvalidTokenError, ValidationError):
        raise credentials_exception
    user = db.query(models.User).filter(models.User.email == token_data.email).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user

def get_current_active_superuser(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_superuser:
        raise HTTPException(status_code=400, detail="The user doesn't have enough privileges")
    return current_user

def get_accessible_project_ids(user: models.User, db: Session) -> set[int] | None:
    """Return project IDs the user can access (creator or group member). Superusers get None (= no filter)."""
    if user.is_superuser:
        return None

    accessible: set[int] = set()

    created = db.query(models.Project.id).filter(
        models.Project.created_by == user.id,
        models.Project.is_deleted == False,
    ).all()
    accessible.update(r.id for r in created)

    user_group_ids = [g.id for g in user.groups]
    if user_group_ids:
        via_group = db.query(models.ProjectGroupAccess.project_id).filter(
            models.ProjectGroupAccess.group_id.in_(user_group_ids)
        ).all()
        accessible.update(r.project_id for r in via_group)

    return accessible


def require_project_role(required_roles: list[str]):
    """
    Dependency to check if the current user has access to a specific project.
    Expects project_id as a path parameter or query parameter.
    """
    def role_checker(project_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
        if current_user.is_superuser:
            return True
        
        # Get all groups the user belongs to
        user_group_ids = [group.id for group in current_user.groups]
        
        if not user_group_ids:
            logger.warning("403 Forbidden: user=%s has no group membership", current_user.id)
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

        # Check if any of these groups grant access to the requested project
        access = db.query(models.ProjectGroupAccess).filter(
            models.ProjectGroupAccess.project_id == project_id,
            models.ProjectGroupAccess.group_id.in_(user_group_ids),
            models.ProjectGroupAccess.access_level.in_(required_roles)
        ).first()

        if access:
            return True

        # Allow the project creator to access their own project
        project = db.query(models.Project).filter(models.Project.id == project_id).first()
        if project and project.created_by == current_user.id:
            return True

        logger.warning("403 Forbidden: user=%s has no access to project=%s", current_user.id, project_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions for this project")
    
    return role_checker
