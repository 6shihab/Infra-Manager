import uuid
import logging
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.config import settings
from app.keycloak import validate_keycloak_token

logger = logging.getLogger(__name__)

# Use HTTPBearer so Swagger UI shows a Bearer token input
_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    """Validate a Keycloak-issued JWT and return the local User."""
    cred_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise cred_exception

    token = credentials.credentials

    # Decode and validate the Keycloak token
    try:
        payload = validate_keycloak_token(token)
    except Exception as exc:
        logger.debug("Token validation failed: %s", exc)
        raise cred_exception

    keycloak_sub: str | None = payload.get("sub")
    email: str | None = payload.get("email")

    if not keycloak_sub:
        raise cred_exception

    # Look up by keycloak_id first, then by email as fallback
    user = db.query(models.User).filter(models.User.keycloak_id == keycloak_sub).first()

    if user is None and email:
        # Fallback: match by email and link the keycloak_id (first-login linking)
        user = db.query(models.User).filter(models.User.email == email).first()
        if user:
            user.keycloak_id = keycloak_sub
            db.commit()

    if user is None:
        # Auto-provision: create a local user from Keycloak claims
        realm_roles = payload.get("realm_access", {}).get("roles", [])
        is_superuser = "superuser" in realm_roles

        full_name_parts = []
        if payload.get("given_name"):
            full_name_parts.append(payload["given_name"])
        if payload.get("family_name"):
            full_name_parts.append(payload["family_name"])
        full_name = " ".join(full_name_parts) or payload.get("preferred_username") or email

        user = models.User(
            keycloak_id=keycloak_sub,
            email=email or keycloak_sub,
            hashed_password="keycloak-managed",
            full_name=full_name,
            is_active=True,
            is_superuser=is_superuser,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Auto-provisioned user %s (keycloak_id=%s)", user.email, keycloak_sub)

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
