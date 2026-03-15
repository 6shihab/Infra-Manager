import io
import base64
import secrets
from datetime import timedelta

import bcrypt
import pyotp
import qrcode
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
import jwt
from jwt.exceptions import InvalidTokenError

from app import schemas, models, auth, dependencies
from app.database import get_db
from app.audit import log_audit
from app.config import settings

from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter(prefix="/auth/totp", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

BACKUP_CODE_COUNT = 8


def _generate_backup_codes() -> tuple[list[str], list[str]]:
    """Generate backup codes. Returns (plain_codes, hashed_codes)."""
    plain_codes = [secrets.token_hex(4) for _ in range(BACKUP_CODE_COUNT)]
    hashed_codes = [
        bcrypt.hashpw(code.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        for code in plain_codes
    ]
    return plain_codes, hashed_codes


def _verify_backup_code(code: str, hashed_codes: list[str]) -> int | None:
    """Check code against hashed backup codes. Returns index if matched, else None."""
    for i, hashed in enumerate(hashed_codes):
        if bcrypt.checkpw(code.encode("utf-8"), hashed.encode("utf-8")):
            return i
    return None


@router.post("/setup", response_model=schemas.TOTPSetupResponse)
@limiter.limit("5/minute")
def setup_totp(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    if current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TOTP is already enabled. Disable it first.",
        )

    secret = pyotp.random_base32()
    current_user.totp_secret = secret
    db.commit()

    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(
        name=current_user.email, issuer_name="InfraManager"
    )

    img = qrcode.make(provisioning_uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    log_audit(db, current_user.id, "TOTP_SETUP_INITIATED", "User", current_user.email)

    return schemas.TOTPSetupResponse(
        secret=secret,
        qr_code=f"data:image/png;base64,{qr_b64}",
        provisioning_uri=provisioning_uri,
    )


@router.post("/verify", response_model=schemas.TOTPActivateResponse)
@limiter.limit("5/minute")
def verify_totp(
    request: Request,
    body: schemas.TOTPVerifyRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    if current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TOTP is already enabled.",
        )
    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TOTP setup has not been initiated. Call /auth/totp/setup first.",
        )

    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid TOTP code.",
        )

    plain_codes, hashed_codes = _generate_backup_codes()
    current_user.totp_enabled = True
    current_user.totp_backup_codes = hashed_codes
    db.commit()

    log_audit(db, current_user.id, "TOTP_ENABLED", "User", current_user.email)

    return schemas.TOTPActivateResponse(backup_codes=plain_codes)


@router.post("/disable")
@limiter.limit("5/minute")
def disable_totp(
    request: Request,
    body: schemas.TOTPDisableRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    if not current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TOTP is not enabled.",
        )

    if not auth.verify_password(body.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password.",
        )

    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid TOTP code.",
        )

    current_user.totp_enabled = False
    current_user.totp_secret = None
    current_user.totp_backup_codes = None
    db.commit()

    log_audit(db, current_user.id, "TOTP_DISABLED", "User", current_user.email)

    return {"status": "totp_disabled"}


@router.post("/login", response_model=schemas.Token)
@limiter.limit("5/minute")
def login_totp(
    request: Request,
    body: schemas.TOTPLoginRequest,
    db: Session = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired TOTP session.",
    )

    try:
        payload = jwt.decode(
            body.totp_token, settings.secret_key, algorithms=[settings.algorithm]
        )
        if payload.get("type") != "totp_pending":
            raise credentials_exception
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except InvalidTokenError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None or not user.is_active or not user.totp_enabled:
        raise credentials_exception

    # Try TOTP code first
    totp = pyotp.TOTP(user.totp_secret)
    if totp.verify(body.code, valid_window=1):
        access_token = auth.create_access_token(data={"sub": user.email})
        log_audit(db, user.id, "LOGIN_TOTP", "System", user.email)
        return schemas.Token(
            access_token=access_token, token_type="bearer", requires_totp=False
        )

    # Try backup code
    if user.totp_backup_codes:
        idx = _verify_backup_code(body.code, user.totp_backup_codes)
        if idx is not None:
            remaining = list(user.totp_backup_codes)
            remaining.pop(idx)
            user.totp_backup_codes = remaining
            db.commit()

            access_token = auth.create_access_token(data={"sub": user.email})
            log_audit(db, user.id, "LOGIN_TOTP_BACKUP", "System", user.email)
            return schemas.Token(
                access_token=access_token, token_type="bearer", requires_totp=False
            )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid TOTP code.",
    )


@router.post("/backup-codes", response_model=schemas.TOTPActivateResponse)
@limiter.limit("3/minute")
def regenerate_backup_codes(
    request: Request,
    body: schemas.TOTPVerifyRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    if not current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TOTP is not enabled.",
        )

    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid TOTP code.",
        )

    plain_codes, hashed_codes = _generate_backup_codes()
    current_user.totp_backup_codes = hashed_codes
    db.commit()

    log_audit(
        db, current_user.id, "TOTP_BACKUP_CODES_REGENERATED", "User", current_user.email
    )

    return schemas.TOTPActivateResponse(backup_codes=plain_codes)


@router.delete("/admin/{user_id}")
def admin_disable_totp(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_superuser),
):
    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    if not target_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TOTP is not enabled for this user.",
        )

    target_user.totp_enabled = False
    target_user.totp_secret = None
    target_user.totp_backup_codes = None
    db.commit()

    log_audit(
        db, current_user.id, "TOTP_ADMIN_DISABLED", "User", target_user.email
    )

    return {"status": "totp_disabled"}
