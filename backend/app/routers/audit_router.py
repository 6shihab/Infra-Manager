from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/audit-logs", tags=["audit"], dependencies=[Depends(get_current_user)])


@router.get("/", response_model=List[schemas.AuditLogResponse])
def read_audit_logs(
    skip: int = 0,
    limit: int = 100,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    search: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = db.query(models.AuditLog)

    if action:
        query = query.filter(models.AuditLog.action == action)
    if resource_type:
        query = query.filter(models.AuditLog.resource_type == resource_type)
    if search:
        query = query.filter(models.AuditLog.resource_name.ilike(f"%{search}%"))
    if from_date:
        query = query.filter(models.AuditLog.timestamp >= from_date)
    if to_date:
        query = query.filter(models.AuditLog.timestamp <= to_date)

    total = query.count()
    logs = query.order_by(models.AuditLog.timestamp.desc()).offset(skip).limit(limit).all()

    response = JSONResponse(
        content=[schemas.AuditLogResponse.model_validate(log).model_dump(mode="json") for log in logs]
    )
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    return response
