from fastapi import APIRouter, Depends, HTTPException, Request, status
from datetime import datetime
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_user, get_accessible_project_ids
from app.audit import log_audit

router = APIRouter(prefix="/servers", tags=["servers"], dependencies=[Depends(get_current_user)])

from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)


def _can_access_server(user: models.User, server: models.Server, db: Session) -> bool:
    """Return True if the user owns the server or it is linked to an accessible project."""
    if user.is_superuser:
        return True
    if server.created_by == user.id:
        return True
    project_ids = get_accessible_project_ids(user, db)
    if not project_ids:
        return False
    return db.query(models.ProjectServer).filter(
        models.ProjectServer.server_id == server.id,
        models.ProjectServer.project_id.in_(project_ids),
    ).first() is not None


def _get_linked_project_ids(server_id: int, db: Session):
    return [
        r.project_id for r in db.query(models.ProjectServer).filter(
            models.ProjectServer.server_id == server_id
        ).all()
    ]


def _can_edit_server(user: models.User, server: models.Server, db: Session) -> bool:
    """Superuser, creator, or Editor/Admin on a linked project."""
    if user.is_superuser:
        return True
    if server.created_by == user.id:
        return True
    user_group_ids = [g.id for g in user.groups]
    if not user_group_ids:
        return False
    linked_project_ids = _get_linked_project_ids(server.id, db)
    if not linked_project_ids:
        return False
    return db.query(models.ProjectGroupAccess).filter(
        models.ProjectGroupAccess.project_id.in_(linked_project_ids),
        models.ProjectGroupAccess.group_id.in_(user_group_ids),
        models.ProjectGroupAccess.access_level.in_(["Editor", "Admin"]),
    ).first() is not None


def _can_delete_server(user: models.User, server: models.Server, db: Session) -> bool:
    """Superuser, creator, or Admin (not Editor) on a linked project."""
    if user.is_superuser:
        return True
    if server.created_by == user.id:
        return True
    user_group_ids = [g.id for g in user.groups]
    if not user_group_ids:
        return False
    linked_project_ids = _get_linked_project_ids(server.id, db)
    if not linked_project_ids:
        return False
    return db.query(models.ProjectGroupAccess).filter(
        models.ProjectGroupAccess.project_id.in_(linked_project_ids),
        models.ProjectGroupAccess.group_id.in_(user_group_ids),
        models.ProjectGroupAccess.access_level.in_(["Admin"]),
    ).first() is not None


@router.get("/", response_model=List[schemas.ServerListResponse])
def read_servers(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.is_superuser:
        servers = db.query(models.Server).filter(models.Server.is_deleted == False).offset(skip).limit(limit).all()
        for s in servers:
            s.can_edit = True
            s.can_delete = True
        return servers

    # Build accessible project IDs in a single subquery (avoids extra round-trips)
    user_group_ids = [g.id for g in current_user.groups]
    project_ids_q = db.query(models.Project.id).filter(
        models.Project.is_deleted == False,
        models.Project.created_by == current_user.id,
    )
    if user_group_ids:
        via_group_q = db.query(models.ProjectGroupAccess.project_id).filter(
            models.ProjectGroupAccess.group_id.in_(user_group_ids)
        )
        project_ids_q = project_ids_q.union(via_group_q)

    # Servers created by this user
    owned = db.query(models.Server.id).filter(models.Server.created_by == current_user.id)

    # Servers linked to accessible projects
    via_project = db.query(models.ProjectServer.server_id).filter(
        models.ProjectServer.project_id.in_(project_ids_q)
    ).distinct()
    all_ids = owned.union(via_project)

    servers = (
        db.query(models.Server)
        .filter(models.Server.id.in_(all_ids), models.Server.is_deleted == False)
        .offset(skip)
        .limit(limit)
        .all()
    )
    for s in servers:
        s.can_edit = _can_edit_server(current_user, s, db)
        s.can_delete = _can_delete_server(current_user, s, db)
    return servers


@router.post("/", response_model=schemas.ServerResponse)
@limiter.limit("20/minute")
def create_server(
    request: Request,
    server: schemas.ServerCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_server = models.Server(**server.model_dump(), created_by=current_user.id)
    db.add(db_server)
    db.commit()
    db.refresh(db_server)
    log_audit(db, current_user.id, "CREATED", "Server", db_server.name)
    return db_server


@router.get("/{server_id}", response_model=schemas.ServerResponse)
def read_server(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_server = db.query(models.Server).filter(
        models.Server.id == server_id, models.Server.is_deleted == False
    ).first()
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    if not _can_access_server(current_user, db_server, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    return db_server


@router.put("/{server_id}", response_model=schemas.ServerResponse)
def update_server(
    server_id: int,
    server: schemas.ServerUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_server = db.query(models.Server).filter(
        models.Server.id == server_id, models.Server.is_deleted == False
    ).first()
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    if not _can_edit_server(current_user, db_server, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    update_data = server.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_server, key, value)

    db.commit()
    db.refresh(db_server)
    log_audit(db, current_user.id, "UPDATED", "Server", db_server.name)
    return db_server


@router.delete("/{server_id}")
def delete_server(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_server = db.query(models.Server).filter(
        models.Server.id == server_id, models.Server.is_deleted == False
    ).first()
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    if not _can_delete_server(current_user, db_server, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    server_name = db_server.name
    db_server.is_deleted = True
    db_server.deleted_at = datetime.utcnow()
    db.commit()
    log_audit(db, current_user.id, "DELETED", "Server", server_name)
    return {"status": "deleted"}
