import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_user
from app.audit import log_audit
from app.config import settings
from app.rate_limit import limiter

router = APIRouter(prefix="/trash", tags=["trash"], dependencies=[Depends(get_current_user)])

RESOURCE_TYPES = {"project_folder", "project", "server", "database_engine", "component"}

MODEL_MAP = {
    "project_folder": models.ProjectFolder,
    "project": models.Project,
    "server": models.Server,
    "database_engine": models.DatabaseEngine,
    "component": models.Component,
}

DISPLAY_MAP = {
    "project_folder": "ProjectFolder",
    "project": "Project",
    "server": "Server",
    "database_engine": "DatabaseEngine",
    "component": "Component",
}


def _days_remaining(deleted_at: datetime) -> int:
    if deleted_at is None:
        return 0
    now = datetime.now(timezone.utc)
    if deleted_at.tzinfo is None:
        from datetime import timezone as tz
        deleted_at = deleted_at.replace(tzinfo=tz.utc)
    elapsed = (now - deleted_at).days
    return max(0, settings.audit_log_retention_days - elapsed)


def _can_manage_trash_item(user: models.User, model_type: str, item, db: Session) -> bool:
    """Check if the user can restore/permanently-delete this trash item."""
    if user.is_superuser:
        return True
    if hasattr(item, 'created_by') and item.created_by == user.id:
        return True
    if model_type == "component":
        # Check parent project creator
        project = db.query(models.Project).filter(models.Project.id == item.project_id).first()
        if project and project.created_by == user.id:
            return True
    if model_type == "project":
        # Check Admin role via group/user access
        user_group_ids = [g.id for g in user.groups]
        if user_group_ids:
            access = db.query(models.ProjectGroupAccess).filter(
                models.ProjectGroupAccess.project_id == item.id,
                models.ProjectGroupAccess.group_id.in_(user_group_ids),
                models.ProjectGroupAccess.access_level == "Admin",
            ).first()
            if access:
                return True
        direct = db.query(models.ProjectUserAccess).filter(
            models.ProjectUserAccess.project_id == item.id,
            models.ProjectUserAccess.user_id == user.id,
            models.ProjectUserAccess.access_level == "Admin",
        ).first()
        if direct:
            return True
    return False


def _get_deleted_items(db: Session, user: models.User, model_class, model_type: str) -> list:
    """Query soft-deleted items with access control."""
    base_q = db.query(model_class).filter(model_class.is_deleted == True)

    if not user.is_superuser:
        if model_type == "component":
            # Components: user created the parent project
            accessible_project_ids = db.query(models.Project.id).filter(
                models.Project.created_by == user.id
            )
            base_q = base_q.filter(model_class.project_id.in_(accessible_project_ids))
        elif model_type == "project":
            # Projects: created_by OR Admin via group/user access
            user_group_ids = [g.id for g in user.groups]
            admin_project_ids_group = db.query(models.ProjectGroupAccess.project_id).filter(
                models.ProjectGroupAccess.group_id.in_(user_group_ids),
                models.ProjectGroupAccess.access_level == "Admin",
            ) if user_group_ids else db.query(models.ProjectGroupAccess.project_id).filter(False)
            admin_project_ids_direct = db.query(models.ProjectUserAccess.project_id).filter(
                models.ProjectUserAccess.user_id == user.id,
                models.ProjectUserAccess.access_level == "Admin",
            )
            base_q = base_q.filter(
                or_(
                    model_class.created_by == user.id,
                    model_class.id.in_(admin_project_ids_group),
                    model_class.id.in_(admin_project_ids_direct),
                )
            )
        else:
            # ProjectFolder, Server, DatabaseEngine: created_by only
            base_q = base_q.filter(model_class.created_by == user.id)

    return base_q.order_by(model_class.deleted_at.desc()).all()


@router.get("/", response_model=List[schemas.TrashItemResponse])
def list_trash(
    resource_type: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
    response: Response = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    items = []

    types_to_query = RESOURCE_TYPES
    if resource_type and resource_type in RESOURCE_TYPES:
        types_to_query = {resource_type}

    for rtype in types_to_query:
        model_class = MODEL_MAP[rtype]
        deleted = _get_deleted_items(db, current_user, model_class, rtype)

        for item in deleted:
            parent_name = None
            parent_id = None
            parent_deleted = False

            if rtype == "component":
                project = db.query(models.Project).filter(models.Project.id == item.project_id).first()
                if project:
                    parent_name = project.name
                    parent_id = project.id
                    parent_deleted = project.is_deleted

            items.append(schemas.TrashItemResponse(
                id=item.id,
                name=item.name,
                resource_type=DISPLAY_MAP[rtype],
                deleted_at=item.deleted_at,
                days_remaining=_days_remaining(item.deleted_at),
                parent_name=parent_name,
                parent_id=parent_id,
                parent_deleted=parent_deleted,
            ))

    # Sort by deleted_at descending (most recent first)
    items.sort(key=lambda x: x.deleted_at or datetime.min, reverse=True)

    total = len(items)
    if response:
        response.headers["X-Total-Count"] = str(total)

    return items[skip:skip + limit]


@router.post("/{resource_type}/{item_id}/restore")
@limiter.limit("20/minute")
def restore_item(
    request: Request,
    resource_type: str,
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if resource_type not in RESOURCE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid resource type: {resource_type}")

    model_class = MODEL_MAP[resource_type]
    item = db.query(model_class).filter(model_class.id == item_id, model_class.is_deleted == True).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in trash")

    if not _can_manage_trash_item(current_user, resource_type, item, db):
        raise HTTPException(status_code=403, detail="Not allowed")

    # Type-specific restore logic
    if resource_type == "component":
        project = db.query(models.Project).filter(models.Project.id == item.project_id).first()
        if project and project.is_deleted:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot restore: parent project \"{project.name}\" is still in trash. Restore the project first."
            )

    if resource_type == "project_folder":
        # If parent folder is deleted, move to root
        if item.parent_id:
            parent = db.query(models.ProjectFolder).filter(models.ProjectFolder.id == item.parent_id).first()
            if parent and parent.is_deleted:
                item.parent_id = None

    if resource_type == "project":
        # If folder is deleted, unfile
        if item.folder_id:
            folder = db.query(models.ProjectFolder).filter(models.ProjectFolder.id == item.folder_id).first()
            if folder and folder.is_deleted:
                item.folder_id = None

    item.is_deleted = False
    item.deleted_at = None
    db.commit()

    log_audit(db, current_user.id, "RESTORED", DISPLAY_MAP[resource_type], item.name)
    return {"status": "restored", "name": item.name}


@router.delete("/{resource_type}/{item_id}")
@limiter.limit("20/minute")
def permanently_delete_item(
    request: Request,
    resource_type: str,
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if resource_type not in RESOURCE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid resource type: {resource_type}")

    model_class = MODEL_MAP[resource_type]
    item = db.query(model_class).filter(model_class.id == item_id, model_class.is_deleted == True).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in trash")

    if not _can_manage_trash_item(current_user, resource_type, item, db):
        raise HTTPException(status_code=403, detail="Not allowed")

    item_name = item.name

    # For project folders, unfile projects first
    if resource_type == "project_folder":
        db.query(models.Project).filter(models.Project.folder_id == item_id).update(
            {"folder_id": None}, synchronize_session=False
        )

    db.delete(item)
    db.commit()

    log_audit(db, current_user.id, "PERMANENTLY_DELETED", DISPLAY_MAP[resource_type], item_name)
    return {"status": "permanently_deleted", "name": item_name}
