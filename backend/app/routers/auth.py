import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import schemas, models, dependencies
from app.database import get_db
from app.audit import log_audit
from app.config import settings

from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(dependencies.get_current_user), db: Session = Depends(get_db)):
    return schemas.UserResponse.model_validate(current_user)


@router.post("/logout")
def logout(current_user: models.User = Depends(dependencies.get_current_user), db: Session = Depends(get_db)):
    """
    Application-level logout. With Keycloak, actual session termination
    happens via the OIDC end-session endpoint on the frontend.
    This endpoint logs the event for auditing.
    """
    log_audit(db, current_user.id, "LOGOUT", "System", current_user.email)
    return {"message": "Successfully logged out"}


@router.get("/oidc-config")
def oidc_config():
    """
    Return the Keycloak OIDC configuration for frontend discovery.
    This allows the frontend to configure itself without hardcoding Keycloak URLs.
    """
    return {
        "authority": f"{settings.keycloak_url}/realms/{settings.keycloak_realm}",
        "client_id": settings.keycloak_frontend_client_id,
        "issuer": f"{settings.keycloak_url}/realms/{settings.keycloak_realm}",
    }
