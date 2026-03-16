import logging
import time
import base64
from datetime import datetime, timezone
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

import webauthn
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    ResidentKeyRequirement,
    UserVerificationRequirement,
    PublicKeyCredentialDescriptor,
    AuthenticatorTransport,
)
from webauthn.helpers import bytes_to_base64url, base64url_to_bytes, options_to_json

from app import schemas, models, auth, dependencies
from app.database import get_db
from app.audit import log_audit
from app.config import settings

from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/webauthn", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

# ---------------------------------------------------------------------------
# In-memory challenge store (thread-safe, 5-min TTL)
# ---------------------------------------------------------------------------
_challenge_store: dict[str, tuple[bytes, float]] = {}
_challenge_lock = Lock()
CHALLENGE_TTL = 300  # seconds
MAX_CHALLENGES = 10_000


def _store_challenge(key: str, challenge: bytes) -> None:
    with _challenge_lock:
        now = time.time()
        if len(_challenge_store) >= MAX_CHALLENGES:
            expired = [k for k, (_, exp) in _challenge_store.items() if exp < now]
            for k in expired:
                del _challenge_store[k]
        _challenge_store[key] = (challenge, now + CHALLENGE_TTL)


def _pop_challenge(key: str) -> bytes | None:
    with _challenge_lock:
        entry = _challenge_store.pop(key, None)
        if entry is None:
            return None
        challenge, expiry = entry
        if time.time() > expiry:
            return None
        return challenge


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_expected_origins() -> list[str]:
    origins = settings.webauthn_origin
    if isinstance(origins, str):
        return [origins]
    return list(origins)


def _transport_str_to_enum(t: str) -> AuthenticatorTransport | None:
    mapping = {
        "usb": AuthenticatorTransport.USB,
        "nfc": AuthenticatorTransport.NFC,
        "ble": AuthenticatorTransport.BLE,
        "internal": AuthenticatorTransport.INTERNAL,
        "hybrid": AuthenticatorTransport.HYBRID,
    }
    return mapping.get(t)


# ---------------------------------------------------------------------------
# Registration endpoints (require auth)
# ---------------------------------------------------------------------------

@router.post("/register/options", response_model=schemas.WebAuthnRegistrationOptionsResponse)
@limiter.limit("5/minute")
def registration_options(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    existing_creds = (
        db.query(models.WebAuthnCredential)
        .filter(models.WebAuthnCredential.user_id == current_user.id)
        .all()
    )

    exclude_credentials = []
    for cred in existing_creds:
        transports = []
        if cred.transports:
            for t in cred.transports:
                enum_val = _transport_str_to_enum(t)
                if enum_val:
                    transports.append(enum_val)
        exclude_credentials.append(
            PublicKeyCredentialDescriptor(
                id=base64url_to_bytes(cred.credential_id),
                transports=transports if transports else None,
            )
        )

    options = webauthn.generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=settings.webauthn_rp_name,
        user_id=str(current_user.id).encode(),
        user_name=current_user.email,
        user_display_name=current_user.full_name or current_user.email,
        exclude_credentials=exclude_credentials if exclude_credentials else None,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )

    _store_challenge(f"reg:{current_user.email}", options.challenge)

    log_audit(db, current_user.id, "PASSKEY_REGISTRATION_INITIATED", "User", current_user.email)

    import json
    return schemas.WebAuthnRegistrationOptionsResponse(
        options=json.loads(options_to_json(options))
    )


@router.post("/register/verify", response_model=schemas.WebAuthnCredentialResponse)
@limiter.limit("5/minute")
def registration_verify(
    request: Request,
    body: schemas.WebAuthnRegistrationVerifyRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    challenge = _pop_challenge(f"reg:{current_user.email}")
    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration challenge expired or not found. Please try again.",
        )

    try:
        verification = webauthn.verify_registration_response(
            credential=body.credential,
            expected_challenge=challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=_get_expected_origins(),
        )
    except Exception as e:
        logger.warning("WebAuthn registration verification failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passkey registration failed. Please try again.",
        )

    credential_id_b64 = bytes_to_base64url(verification.credential_id)
    public_key_b64 = bytes_to_base64url(verification.credential_public_key)

    # Check for duplicate credential
    existing = (
        db.query(models.WebAuthnCredential)
        .filter(models.WebAuthnCredential.credential_id == credential_id_b64)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This passkey is already registered.",
        )

    transports = None
    if hasattr(body.credential, "get"):
        raw_response = body.credential.get("response", {})
        transports = raw_response.get("transports")

    new_cred = models.WebAuthnCredential(
        user_id=current_user.id,
        credential_id=credential_id_b64,
        public_key=public_key_b64,
        sign_count=verification.sign_count,
        transports=transports,
        device_name=body.device_name,
    )
    db.add(new_cred)
    db.commit()
    db.refresh(new_cred)

    log_audit(db, current_user.id, "PASSKEY_REGISTERED", "User", current_user.email)

    return new_cred


@router.get("/credentials", response_model=list[schemas.WebAuthnCredentialResponse])
def list_credentials(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    return (
        db.query(models.WebAuthnCredential)
        .filter(models.WebAuthnCredential.user_id == current_user.id)
        .order_by(models.WebAuthnCredential.created_at.desc())
        .all()
    )


@router.put("/credentials/{credential_id}", response_model=schemas.WebAuthnCredentialResponse)
@limiter.limit("10/minute")
def rename_credential(
    credential_id: str,
    body: schemas.WebAuthnCredentialUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    cred = (
        db.query(models.WebAuthnCredential)
        .filter(
            models.WebAuthnCredential.id == credential_id,
            models.WebAuthnCredential.user_id == current_user.id,
        )
        .first()
    )
    if not cred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Passkey not found.")

    cred.device_name = body.device_name
    db.commit()
    db.refresh(cred)

    log_audit(db, current_user.id, "PASSKEY_RENAMED", "User", body.device_name)

    return cred


@router.delete("/credentials/{credential_id}")
@limiter.limit("5/minute")
def delete_credential(
    credential_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    cred = (
        db.query(models.WebAuthnCredential)
        .filter(
            models.WebAuthnCredential.id == credential_id,
            models.WebAuthnCredential.user_id == current_user.id,
        )
        .first()
    )
    if not cred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Passkey not found.")

    device_name = cred.device_name or "Unknown"
    db.delete(cred)
    db.commit()

    log_audit(db, current_user.id, "PASSKEY_DELETED", "User", device_name)

    return {"status": "deleted"}


@router.delete("/admin/{user_id}")
def admin_remove_passkeys(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_superuser),
):
    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    if target_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    count = (
        db.query(models.WebAuthnCredential)
        .filter(models.WebAuthnCredential.user_id == target_user.id)
        .delete()
    )
    if count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No passkeys found for this user.",
        )
    db.commit()

    log_audit(db, current_user.id, "PASSKEY_ADMIN_REMOVED", "User", target_user.email)

    return {"status": "passkeys_removed", "count": count}


# ---------------------------------------------------------------------------
# Authentication endpoints (no auth required)
# ---------------------------------------------------------------------------

@router.post("/login/options", response_model=schemas.WebAuthnAuthenticationOptionsResponse)
@limiter.limit("10/minute")
def authentication_options(
    request: Request,
    body: schemas.WebAuthnAuthenticationOptionsRequest | None = None,
    db: Session = Depends(get_db),
):
    # Look up credentials: by email if provided, otherwise all credentials.
    # Populating allowCredentials avoids the browser's discoverable-credential
    # picker and goes straight to the biometric/PIN prompt.
    creds = []
    if body and body.email:
        user = db.query(models.User).filter(models.User.email == body.email).first()
        if user:
            creds = (
                db.query(models.WebAuthnCredential)
                .filter(models.WebAuthnCredential.user_id == user.id)
                .all()
            )
    if not creds:
        # No email or no credentials for that email — load all credentials
        # so the browser can match locally without showing a picker.
        creds = db.query(models.WebAuthnCredential).all()

    allow_credentials = None
    if creds:
        allow_credentials = []
        for cred in creds:
            transports = []
            if cred.transports:
                for t in cred.transports:
                    enum_val = _transport_str_to_enum(t)
                    if enum_val:
                        transports.append(enum_val)
            allow_credentials.append(
                PublicKeyCredentialDescriptor(
                    id=base64url_to_bytes(cred.credential_id),
                    transports=transports if transports else None,
                )
            )

    options = webauthn.generate_authentication_options(
        rp_id=settings.webauthn_rp_id,
        user_verification=UserVerificationRequirement.PREFERRED,
        allow_credentials=allow_credentials,
    )

    _store_challenge(f"auth:{bytes_to_base64url(options.challenge)}", options.challenge)

    import json
    return schemas.WebAuthnAuthenticationOptionsResponse(
        options=json.loads(options_to_json(options))
    )


@router.post("/login/verify", response_model=schemas.Token)
@limiter.limit("5/minute")
def authentication_verify(
    request: Request,
    body: schemas.WebAuthnAuthenticationVerifyRequest,
    db: Session = Depends(get_db),
):
    credential_data = body.credential

    # Extract raw_id from the credential response
    raw_id_b64 = credential_data.get("rawId") or credential_data.get("id", "")

    # Look up stored credential
    stored_cred = (
        db.query(models.WebAuthnCredential)
        .filter(models.WebAuthnCredential.credential_id == raw_id_b64)
        .first()
    )
    if not stored_cred:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Passkey not recognized.",
        )

    user = db.query(models.User).filter(models.User.id == stored_cred.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive or not found.",
        )

    # Retrieve the challenge — we need to figure out which challenge key was used.
    # The client's response includes clientDataJSON which contains the challenge.
    # We try to extract it from the response to look up in our store.
    challenge_bytes = None
    try:
        client_data_b64 = credential_data.get("response", {}).get("clientDataJSON", "")
        # Pad base64url
        padded = client_data_b64 + "=" * (4 - len(client_data_b64) % 4)
        client_data_json = base64.urlsafe_b64decode(padded)
        import json
        client_data = json.loads(client_data_json)
        challenge_b64 = client_data.get("challenge", "")
        challenge_bytes = _pop_challenge(f"auth:{challenge_b64}")
    except Exception:
        pass

    if challenge_bytes is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication challenge expired or invalid. Please try again.",
        )

    try:
        expected_origins = _get_expected_origins()
        logger.info("WebAuthn verify: expected_origins=%s, rp_id=%s", expected_origins, settings.webauthn_rp_id)
        verification = webauthn.verify_authentication_response(
            credential=credential_data,
            expected_challenge=challenge_bytes,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=expected_origins,
            credential_public_key=base64url_to_bytes(stored_cred.public_key),
            credential_current_sign_count=stored_cred.sign_count,
        )
    except Exception as e:
        logger.error("WebAuthn authentication verification failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Passkey verification failed.",
        )

    # Update sign count and last used
    stored_cred.sign_count = verification.new_sign_count
    stored_cred.last_used_at = datetime.now(timezone.utc)
    db.commit()

    access_token = auth.create_access_token(data={"sub": user.email})
    log_audit(db, user.id, "LOGIN_PASSKEY", "System", user.email)

    return schemas.Token(access_token=access_token, token_type="bearer", requires_totp=False)
