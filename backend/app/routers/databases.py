import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from datetime import datetime
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_user, get_accessible_project_ids
from app.audit import log_audit

router = APIRouter(prefix="/databases", tags=["databases"], dependencies=[Depends(get_current_user)])

from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)


def _can_access_database(user: models.User, db_engine: models.DatabaseEngine, db: Session) -> bool:
    """Return True if the user owns the engine or it is linked to an accessible project."""
    if user.is_superuser:
        return True
    if db_engine.created_by == user.id:
        return True
    project_ids = get_accessible_project_ids(user, db)
    if not project_ids:
        return False
    return db.query(models.ProjectDatabase).filter(
        models.ProjectDatabase.database_engine_id == db_engine.id,
        models.ProjectDatabase.project_id.in_(project_ids),
    ).first() is not None


def _get_linked_project_ids_db(engine_id: uuid.UUID, db: Session):
    return [
        r.project_id for r in db.query(models.ProjectDatabase).filter(
            models.ProjectDatabase.database_engine_id == engine_id
        ).all()
    ]


def _can_edit_database(user: models.User, db_engine: models.DatabaseEngine, db: Session) -> bool:
    """Superuser, creator, or Editor/Admin on a linked project."""
    if user.is_superuser:
        return True
    if db_engine.created_by == user.id:
        return True
    linked_project_ids = _get_linked_project_ids_db(db_engine.id, db)
    if not linked_project_ids:
        return False
    user_group_ids = [g.id for g in user.groups]
    if user_group_ids:
        if db.query(models.ProjectGroupAccess).filter(
            models.ProjectGroupAccess.project_id.in_(linked_project_ids),
            models.ProjectGroupAccess.group_id.in_(user_group_ids),
            models.ProjectGroupAccess.access_level.in_(["Editor", "Admin"]),
        ).first():
            return True
    return db.query(models.ProjectUserAccess).filter(
        models.ProjectUserAccess.project_id.in_(linked_project_ids),
        models.ProjectUserAccess.user_id == user.id,
        models.ProjectUserAccess.access_level.in_(["Editor", "Admin"]),
    ).first() is not None


def _can_delete_database(user: models.User, db_engine: models.DatabaseEngine, db: Session) -> bool:
    """Superuser, creator, or Admin (not Editor) on a linked project."""
    if user.is_superuser:
        return True
    if db_engine.created_by == user.id:
        return True
    linked_project_ids = _get_linked_project_ids_db(db_engine.id, db)
    if not linked_project_ids:
        return False
    user_group_ids = [g.id for g in user.groups]
    if user_group_ids:
        if db.query(models.ProjectGroupAccess).filter(
            models.ProjectGroupAccess.project_id.in_(linked_project_ids),
            models.ProjectGroupAccess.group_id.in_(user_group_ids),
            models.ProjectGroupAccess.access_level.in_(["Admin"]),
        ).first():
            return True
    return db.query(models.ProjectUserAccess).filter(
        models.ProjectUserAccess.project_id.in_(linked_project_ids),
        models.ProjectUserAccess.user_id == user.id,
        models.ProjectUserAccess.access_level.in_(["Admin"]),
    ).first() is not None


@router.get("/", response_model=List[schemas.DatabaseEngineListResponse])
def read_databases(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.is_superuser:
        engines = db.query(models.DatabaseEngine).filter(models.DatabaseEngine.is_deleted == False).offset(skip).limit(limit).all()
        for e in engines:
            e.can_edit = True
            e.can_delete = True
        return engines

    # Build accessible project IDs in a single subquery (avoids extra round-trips)
    user_group_ids = [g.id for g in current_user.groups]
    project_ids_q = db.query(models.Project.id).filter(
        models.Project.is_deleted == False,
        models.Project.created_by == current_user.id,
    )
    if user_group_ids:
        via_group_q = db.query(models.ProjectGroupAccess.project_id).join(
            models.Project, models.Project.id == models.ProjectGroupAccess.project_id
        ).filter(
            models.ProjectGroupAccess.group_id.in_(user_group_ids),
            models.Project.is_deleted == False,
        )
        project_ids_q = project_ids_q.union(via_group_q)
    via_direct_user_q = db.query(models.ProjectUserAccess.project_id).join(
        models.Project, models.Project.id == models.ProjectUserAccess.project_id
    ).filter(
        models.ProjectUserAccess.user_id == current_user.id,
        models.Project.is_deleted == False,
    )
    project_ids_q = project_ids_q.union(via_direct_user_q)

    # Engines created by this user
    owned = db.query(models.DatabaseEngine.id).filter(models.DatabaseEngine.created_by == current_user.id)

    # Engines linked to accessible projects
    via_project = db.query(models.ProjectDatabase.database_engine_id).filter(
        models.ProjectDatabase.project_id.in_(project_ids_q)
    ).distinct()
    all_ids = owned.union(via_project)

    engines = (
        db.query(models.DatabaseEngine)
        .filter(models.DatabaseEngine.id.in_(all_ids), models.DatabaseEngine.is_deleted == False)
        .offset(skip)
        .limit(limit)
        .all()
    )
    for e in engines:
        e.can_edit = _can_edit_database(current_user, e, db)
        e.can_delete = _can_delete_database(current_user, e, db)
    return engines


@router.post("/", response_model=schemas.DatabaseEngineResponse)
@limiter.limit("20/minute")
def create_database(
    request: Request,
    database: schemas.DatabaseEngineCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_database = models.DatabaseEngine(**database.model_dump(), created_by=current_user.id)
    db.add(db_database)
    db.commit()
    db.refresh(db_database)
    log_audit(db, current_user.id, "CREATED", "DatabaseEngine", db_database.name)
    return db_database


@router.get("/{database_id}", response_model=schemas.DatabaseEngineResponse)
def read_database(
    database_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_database = db.query(models.DatabaseEngine).filter(
        models.DatabaseEngine.id == database_id, models.DatabaseEngine.is_deleted == False
    ).first()
    if db_database is None:
        raise HTTPException(status_code=404, detail="DatabaseEngine not found")
    if not _can_access_database(current_user, db_database, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    return db_database


@router.put("/{database_id}", response_model=schemas.DatabaseEngineResponse)
def update_database(
    database_id: uuid.UUID,
    database: schemas.DatabaseEngineUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_database = db.query(models.DatabaseEngine).filter(
        models.DatabaseEngine.id == database_id, models.DatabaseEngine.is_deleted == False
    ).first()
    if db_database is None:
        raise HTTPException(status_code=404, detail="DatabaseEngine not found")
    if not _can_edit_database(current_user, db_database, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    update_data = database.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_database, key, value)

    db.commit()
    db.refresh(db_database)
    log_audit(db, current_user.id, "UPDATED", "DatabaseEngine", db_database.name)
    return db_database


@router.delete("/{database_id}")
def delete_database(
    database_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_database = db.query(models.DatabaseEngine).filter(
        models.DatabaseEngine.id == database_id, models.DatabaseEngine.is_deleted == False
    ).first()
    if db_database is None:
        raise HTTPException(status_code=404, detail="DatabaseEngine not found")
    if not _can_delete_database(current_user, db_database, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    links = db.query(models.ProjectDatabase).filter(
        models.ProjectDatabase.database_engine_id == database_id
    ).all()
    if links:
        project_ids = [l.project_id for l in links]
        projects = db.query(models.Project).filter(models.Project.id.in_(project_ids), models.Project.is_deleted == False).all()
        names = ", ".join(p.name for p in projects)
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: this database engine is linked to project(s): {names}. Remove it from all projects first."
        )

    db_name = db_database.name
    db_database.is_deleted = True
    db_database.deleted_at = datetime.utcnow()
    db.commit()
    log_audit(db, current_user.id, "DELETED", "DatabaseEngine", db_name)
    return {"status": "deleted"}
