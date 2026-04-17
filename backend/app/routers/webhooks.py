import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from starlette.responses import Response
from sqlalchemy.orm import Session

from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_active_superuser
from app.audit import log_audit
from app.webhook_dispatch import dispatch_single_webhook_sync

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

from app.rate_limit import limiter


def _to_response(webhook: models.Webhook, mask_url: bool = True) -> dict:
    return {
        "id": webhook.id,
        "name": webhook.name,
        "url": (webhook.url[:30] + "...") if mask_url and len(webhook.url) > 30 else webhook.url,
        "type": webhook.type.value if webhook.type else "generic",
        "events": webhook.events or [],
        "is_active": webhook.is_active,
        "has_secret": bool(webhook.secret),
        "created_at": webhook.created_at,
        "last_triggered_at": webhook.last_triggered_at,
        "last_status_code": webhook.last_status_code,
        "last_error": webhook.last_error,
        "project_ids": [p.id for p in (webhook.projects or [])],
        "projects": [{"id": p.id, "name": p.name} for p in (webhook.projects or [])],
    }


@router.get("/", response_model=List[schemas.WebhookResponse])
@limiter.limit("20/minute")
def read_webhooks(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_superuser),
):
    webhooks = (
        db.query(models.Webhook)
        .order_by(models.Webhook.created_at.desc())
        .all()
    )
    return [schemas.WebhookResponse(**_to_response(w, mask_url=True)) for w in webhooks]


@router.get("/{webhook_id}", response_model=schemas.WebhookResponse)
@limiter.limit("20/minute")
def read_webhook(
    request: Request,
    webhook_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_superuser),
):
    webhook = db.query(models.Webhook).filter(models.Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return schemas.WebhookResponse(**_to_response(webhook, mask_url=False))


@router.post("/", response_model=schemas.WebhookResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
def create_webhook(
    request: Request,
    body: schemas.WebhookCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_superuser),
):
    webhook = models.Webhook(
        name=body.name,
        url=body.url,
        type=body.type,
        events=body.events,
        is_active=body.is_active,
        secret=body.secret,
        created_by=current_user.id,
    )
    db.add(webhook)
    db.commit()
    db.refresh(webhook)
    if body.project_ids:
        for pid in body.project_ids:
            project = db.query(models.Project).filter(
                models.Project.id == pid, models.Project.is_deleted == False  # noqa: E712
            ).first()
            if project:
                webhook.projects.append(project)
        db.commit()
        db.refresh(webhook)
    log_audit(db, current_user.id, "CREATED", "Webhook", body.name)
    return schemas.WebhookResponse(**_to_response(webhook, mask_url=False))


@router.put("/{webhook_id}", response_model=schemas.WebhookResponse)
@limiter.limit("20/minute")
def update_webhook(
    request: Request,
    webhook_id: uuid.UUID,
    body: schemas.WebhookUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_superuser),
):
    webhook = db.query(models.Webhook).filter(models.Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    if body.name is not None:
        webhook.name = body.name
    if body.url is not None:
        webhook.url = body.url
    if body.type is not None:
        webhook.type = body.type
    if body.events is not None:
        webhook.events = body.events
    if body.is_active is not None:
        webhook.is_active = body.is_active
    if body.secret is not None:
        webhook.secret = body.secret
    if body.project_ids is not None:
        webhook.projects.clear()
        for pid in body.project_ids:
            project = db.query(models.Project).filter(
                models.Project.id == pid, models.Project.is_deleted == False  # noqa: E712
            ).first()
            if project:
                webhook.projects.append(project)

    db.commit()
    db.refresh(webhook)
    log_audit(db, current_user.id, "UPDATED", "Webhook", webhook.name)
    return schemas.WebhookResponse(**_to_response(webhook, mask_url=True))


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("20/minute")
def delete_webhook(
    request: Request,
    webhook_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_superuser),
):
    webhook = db.query(models.Webhook).filter(models.Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    log_audit(db, current_user.id, "DELETED", "Webhook", webhook.name)
    db.delete(webhook)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{webhook_id}/test", response_model=schemas.WebhookTestResponse)
@limiter.limit("5/minute")
def test_webhook(
    request: Request,
    webhook_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_superuser),
):
    webhook = db.query(models.Webhook).filter(models.Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    try:
        success, status_code, response_body = dispatch_single_webhook_sync(
            webhook,
            "SERVER_OFFLINE",
            "server",
            "test-server",
            {
                "id": "00000000-0000-0000-0000-000000000000",
                "name": "test-server",
                "ip_address": "192.168.1.1",
            },
        )
    except Exception as e:
        webhook.last_triggered_at = datetime.now(timezone.utc)
        webhook.last_status_code = 0
        db.commit()
        return schemas.WebhookTestResponse(success=False, status_code=0, response_body=str(e))

    webhook.last_triggered_at = datetime.now(timezone.utc)
    webhook.last_status_code = status_code
    db.commit()

    return schemas.WebhookTestResponse(
        success=success,
        status_code=status_code,
        response_body=response_body[:500] if response_body else "",
    )
