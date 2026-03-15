import asyncio
import json
import logging
import uuid
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import jwt
from jwt.exceptions import InvalidTokenError

from app import models
from app.config import settings
from app.database import SessionLocal
from app.notifications import bus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _authenticate_token(token: str, db: Session) -> models.User:
    """Authenticate a raw JWT string (used for SSE where headers can't be sent)."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        email: str = payload.get("sub")
        if not email:
            raise credentials_exception
    except InvalidTokenError:
        raise credentials_exception

    # Check token blacklist
    blacklisted = db.query(models.TokenBlocklist).filter(
        models.TokenBlocklist.token == token
    ).first()
    if blacklisted:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
        )

    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


async def _event_stream(user_id: uuid.UUID):
    queue = bus.subscribe(user_id)
    try:
        yield "event: connected\ndata: {}\n\n"
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30)
                yield f"id: {event['id']}\nevent: notification\ndata: {json.dumps(event)}\n\n"
            except (asyncio.TimeoutError, TimeoutError):
                yield "event: ping\ndata: {}\n\n"
    except (asyncio.CancelledError, GeneratorExit):
        pass
    finally:
        bus.unsubscribe(user_id, queue)


@router.get("/stream")
async def notification_stream(token: str):
    db: Session = SessionLocal()
    try:
        user = _authenticate_token(token, db)
        user_id = user.id
    finally:
        db.close()

    return StreamingResponse(
        _event_stream(user_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
