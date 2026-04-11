"""
MFA credential management via Keycloak Admin API.

Allows users to list, rename, and delete their own MFA credentials
(TOTP authenticators and passkeys) without leaving the application.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app import models
from app.dependencies import get_current_user
from app.keycloak import keycloak_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mfa", tags=["mfa"])


class CredentialOut(BaseModel):
    id: str
    type: str
    label: str | None = None
    created_date: int | None = None


class MFAStatusOut(BaseModel):
    totp: list[CredentialOut]
    passkeys: list[CredentialOut]


class LabelUpdate(BaseModel):
    label: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_user_credentials(keycloak_id: str) -> list[dict]:
    """Fetch all credentials for a user from Keycloak."""
    import httpx
    resp = httpx.get(
        f"{keycloak_admin._base}/users/{keycloak_id}/credentials",
        headers=keycloak_admin._headers(),
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def _credential_belongs_to_user(keycloak_id: str, credential_id: str) -> bool:
    """Verify a credential ID belongs to the given user (prevents IDOR)."""
    creds = _get_user_credentials(keycloak_id)
    return any(c["id"] == credential_id for c in creds)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/credentials", response_model=MFAStatusOut)
def get_mfa_credentials(current_user: models.User = Depends(get_current_user)):
    """List the current user's MFA credentials (TOTP devices and passkeys)."""
    if not current_user.keycloak_id:
        raise HTTPException(status_code=400, detail="User not linked to Keycloak")

    creds = _get_user_credentials(current_user.keycloak_id)

    totp = []
    passkeys = []
    for c in creds:
        ctype = c.get("type", "")
        item = CredentialOut(
            id=c["id"],
            type=ctype,
            label=c.get("userLabel") or None,
            created_date=c.get("createdDate"),
        )
        if ctype == "otp":
            totp.append(item)
        elif ctype == "webauthn-passwordless":
            passkeys.append(item)

    return MFAStatusOut(totp=totp, passkeys=passkeys)


@router.delete("/credentials/{credential_id}", status_code=204)
def delete_mfa_credential(
    credential_id: str,
    current_user: models.User = Depends(get_current_user),
):
    """Delete one of the current user's MFA credentials."""
    if not current_user.keycloak_id:
        raise HTTPException(status_code=400, detail="User not linked to Keycloak")

    # Verify ownership
    if not _credential_belongs_to_user(current_user.keycloak_id, credential_id):
        raise HTTPException(status_code=404, detail="Credential not found")

    import httpx
    resp = httpx.delete(
        f"{keycloak_admin._base}/users/{current_user.keycloak_id}/credentials/{credential_id}",
        headers=keycloak_admin._headers(),
        timeout=10,
    )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Credential not found")
    resp.raise_for_status()


@router.put("/credentials/{credential_id}/label", status_code=204)
def update_credential_label(
    credential_id: str,
    body: LabelUpdate,
    current_user: models.User = Depends(get_current_user),
):
    """Rename one of the current user's MFA credentials."""
    if not current_user.keycloak_id:
        raise HTTPException(status_code=400, detail="User not linked to Keycloak")

    # Verify ownership
    if not _credential_belongs_to_user(current_user.keycloak_id, credential_id):
        raise HTTPException(status_code=404, detail="Credential not found")

    import httpx
    resp = httpx.put(
        f"{keycloak_admin._base}/users/{current_user.keycloak_id}/credentials/{credential_id}/userLabel",
        content=body.label,
        headers={**keycloak_admin._headers(), "Content-Type": "text/plain"},
        timeout=10,
    )
    resp.raise_for_status()
