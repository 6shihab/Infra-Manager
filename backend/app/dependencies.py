import uuid
import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import jwt
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError

from app import models, schemas
from app.database import get_db
from app.config import settings

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

def is_token_blacklisted(db: Session, jti: str) -> bool:
    """Check if a token's jti has been explicitly revoked."""
    return db.query(models.TokenBlocklist).filter(models.TokenBlocklist.jti == jti).first() is not None

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") == "totp_pending":
            raise credentials_exception
        email: str = payload.get("sub")
        jti: str = payload.get("jti")
        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except (InvalidTokenError, ValidationError):
        raise credentials_exception

    if jti and is_token_blacklisted(db, jti):
        logger.warning("Rejected blacklisted token jti=%s", jti)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(models.User).filter(models.User.email == token_data.email).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")
    return user

def get_current_active_superuser(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The user doesn't have enough privileges")
    return current_user

def get_accessible_project_ids(user: models.User, db: Session) -> set[uuid.UUID] | None:
    """Return project IDs the user can access (creator or group member). Superusers get None (= no filter)."""
    if user.is_superuser:
        return None

    accessible: set[uuid.UUID] = set()

    created = db.query(models.Project.id).filter(
        models.Project.created_by == user.id,
        models.Project.is_deleted == False,
    ).all()
    accessible.update(r.id for r in created)

    user_group_ids = [g.id for g in user.groups]
    if user_group_ids:
        via_group = db.query(models.ProjectGroupAccess.project_id).join(
            models.Project,
            models.Project.id == models.ProjectGroupAccess.project_id
        ).filter(
            models.ProjectGroupAccess.group_id.in_(user_group_ids),
            models.Project.is_deleted == False,
        ).all()
        accessible.update(r.project_id for r in via_group)

    via_user = db.query(models.ProjectUserAccess.project_id).join(
        models.Project,
        models.Project.id == models.ProjectUserAccess.project_id
    ).filter(
        models.ProjectUserAccess.user_id == user.id,
        models.Project.is_deleted == False,
    ).all()
    accessible.update(r.project_id for r in via_user)

    return accessible


def require_project_role(required_roles: list[str]):
    """
    Dependency to check if the current user has access to a specific project.
    Expects project_id as a path parameter or query parameter.
    """
    def role_checker(project_id: uuid.UUID, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
        if current_user.is_superuser:
            return True

        # Resolve the project once — reject immediately if deleted or missing
        project = db.query(models.Project).filter(
            models.Project.id == project_id,
            models.Project.is_deleted == False,
        ).first()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        # Creator always has full access
        if project.created_by == current_user.id:
            return True

        # Check group-based access
        user_group_ids = [group.id for group in current_user.groups]
        if user_group_ids:
            access = db.query(models.ProjectGroupAccess).filter(
                models.ProjectGroupAccess.project_id == project_id,
                models.ProjectGroupAccess.group_id.in_(user_group_ids),
                models.ProjectGroupAccess.access_level.in_(required_roles)
            ).first()
            if access:
                return True

        # Check direct user access
        direct = db.query(models.ProjectUserAccess).filter(
            models.ProjectUserAccess.project_id == project_id,
            models.ProjectUserAccess.user_id == current_user.id,
            models.ProjectUserAccess.access_level.in_(required_roles)
        ).first()
        if direct:
            return True

        logger.warning("403 Forbidden: user=%s has no access to project=%s", current_user.id, project_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions for this project")
    
    return role_checker
