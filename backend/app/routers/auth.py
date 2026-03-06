from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app import schemas, models, auth, dependencies
from app.database import get_db
from app.audit import log_audit

router = APIRouter(prefix="/auth", tags=["auth"])

from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

@router.post("/token", response_model=schemas.Token)
@limiter.limit("5/minute")
def login_for_access_token(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": user.email})
    log_audit(db, user.id, "LOGIN", "System", user.email)
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(dependencies.get_current_user)):
    return current_user

@router.post("/logout")
def logout(token: str = Depends(dependencies.oauth2_scheme), db: Session = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_user)):
    blocked = models.TokenBlocklist(token=token)
    db.add(blocked)
    try:
        db.commit()
    except IntegrityError:
        db.rollback() # Token already in blocklist, that's fine
    
    log_audit(db, current_user.id, "LOGOUT", "System", current_user.email)
    return {"message": "Successfully logged out"}
