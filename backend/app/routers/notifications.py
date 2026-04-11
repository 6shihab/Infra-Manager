import asyncio
import json
import logging
import uuid
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.database import SessionLocal
from app.keycloak import validate_keycloak_token
from app.notifications import bus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _authenticate_token(token: str, db: Session) -> models.User:
    """Authenticate a Keycloak-issued JWT (used for SSE where headers can't be sent)."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    try:
        payload = validate_keycloak_token(token)
        keycloak_id: str = payload.get("sub")
        if not keycloak_id:
            raise credentials_exception
    except Exception:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.keycloak_id == keycloak_id).first()
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
