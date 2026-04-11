import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional, Set
from app import schemas, models
from app.database import get_db
from app.dependencies import get_current_user
from app.audit import log_audit
from app.rate_limit import limiter

router = APIRouter(prefix="/project-folders", tags=["project-folders"], dependencies=[Depends(get_current_user)])


def _get_accessible_folder_ids(db: Session, user: models.User) -> Optional[Set[uuid.UUID]]:
    """Get folder IDs the user can see. Returns None for superusers (no filtering)."""
    if user.is_superuser:
        return None

    # 1. Folders the user created
    created_ids = {
        r[0] for r in db.query(models.ProjectFolder.id).filter(
            models.ProjectFolder.created_by == user.id,
            models.ProjectFolder.is_deleted == False,
        ).all()
    }

    # 2. Folder IDs from projects the user can access
    project_folder_ids: set[uuid.UUID] = set()

    # Via direct user access
    for r in db.query(models.Project.folder_id).join(
        models.ProjectUserAccess, models.ProjectUserAccess.project_id == models.Project.id,
    ).filter(
        models.ProjectUserAccess.user_id == user.id,
        models.Project.is_deleted == False, models.Project.folder_id.isnot(None),
    ).all():
        project_folder_ids.add(r[0])

    # Via group access
    user_group_ids = [g.id for g in user.groups]
    if user_group_ids:
        for r in db.query(models.Project.folder_id).join(
            models.ProjectGroupAccess, models.ProjectGroupAccess.project_id == models.Project.id,
        ).filter(
            models.ProjectGroupAccess.group_id.in_(user_group_ids),
            models.Project.is_deleted == False, models.Project.folder_id.isnot(None),
        ).all():
            project_folder_ids.add(r[0])

    # Via project creator
    for r in db.query(models.Project.folder_id).filter(
        models.Project.created_by == user.id,
        models.Project.is_deleted == False, models.Project.folder_id.isnot(None),
    ).all():
        project_folder_ids.add(r[0])

    # 3. Walk up parent chains so ancestor folders are visible
    all_ids = created_ids | project_folder_ids
    folder_parents = {
        r[0]: r[1] for r in db.query(
            models.ProjectFolder.id, models.ProjectFolder.parent_id,
        ).filter(models.ProjectFolder.is_deleted == False).all()
    }
    for fid in list(all_ids):
        parent = folder_parents.get(fid)
        while parent:
            all_ids.add(parent)
            parent = folder_parents.get(parent)

    return all_ids


def _build_tree(folders: list[models.ProjectFolder]) -> list[dict]:
    """Build a nested tree from a flat list of folders."""
    by_id = {}
    for f in folders:
        by_id[f.id] = {
            "id": f.id, "name": f.name, "color": f.color,
            "position": f.position, "parent_id": f.parent_id,
            "created_by": f.created_by,
            "children": [],
        }
    roots = []
    for f in folders:
        node = by_id[f.id]
        if f.parent_id and f.parent_id in by_id:
            by_id[f.parent_id]["children"].append(node)
        else:
            roots.append(node)
    return roots


@router.get("/", response_model=List[schemas.ProjectFolderResponse])
def read_folders(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    query = db.query(models.ProjectFolder).filter(models.ProjectFolder.is_deleted == False)
    accessible_ids = _get_accessible_folder_ids(db, current_user)
    if accessible_ids is not None:
        query = query.filter(models.ProjectFolder.id.in_(accessible_ids))
    all_folders = query.order_by(models.ProjectFolder.position, models.ProjectFolder.name).all()
    return _build_tree(all_folders)


@router.get("/flat", response_model=List[schemas.ProjectFolderResponse])
def read_folders_flat(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Return folders as a flat list (used by desktop sync and dropdowns)."""
    query = db.query(models.ProjectFolder).filter(models.ProjectFolder.is_deleted == False)
    accessible_ids = _get_accessible_folder_ids(db, current_user)
    if accessible_ids is not None:
        query = query.filter(models.ProjectFolder.id.in_(accessible_ids))
    return query.order_by(models.ProjectFolder.position, models.ProjectFolder.name).all()


@router.post("/", response_model=schemas.ProjectFolderResponse)
@limiter.limit("20/minute")
def create_folder(request: Request, folder: schemas.ProjectFolderCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Validate parent exists if provided
    if folder.parent_id:
        parent = db.query(models.ProjectFolder).filter(
            models.ProjectFolder.id == folder.parent_id,
            models.ProjectFolder.is_deleted == False,
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent folder not found")

    db_folder = models.ProjectFolder(**folder.model_dump(), created_by=current_user.id)
    db.add(db_folder)
    db.commit()
    db.refresh(db_folder)
    log_audit(db, current_user.id, "CREATED", "ProjectFolder", db_folder.name)
    return db_folder


@router.put("/{folder_id}", response_model=schemas.ProjectFolderResponse)
@limiter.limit("20/minute")
def update_folder(request: Request, folder_id: uuid.UUID, folder: schemas.ProjectFolderUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_folder = db.query(models.ProjectFolder).filter(
        models.ProjectFolder.id == folder_id,
        models.ProjectFolder.is_deleted == False,
    ).first()
    if not db_folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if not current_user.is_superuser and db_folder.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    # Prevent setting parent to self or own descendant
    if folder.parent_id is not None:
        if folder.parent_id == folder_id:
            raise HTTPException(status_code=400, detail="Folder cannot be its own parent")
        # Walk up from proposed parent to check for cycles
        check_id = folder.parent_id
        while check_id:
            if check_id == folder_id:
                raise HTTPException(status_code=400, detail="Cannot move folder into its own descendant")
            ancestor = db.query(models.ProjectFolder).filter(models.ProjectFolder.id == check_id).first()
            check_id = ancestor.parent_id if ancestor else None

    update_data = folder.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_folder, key, value)
    db.commit()
    db.refresh(db_folder)
    log_audit(db, current_user.id, "UPDATED", "ProjectFolder", db_folder.name)
    return db_folder


def _collect_descendant_ids(db: Session, folder_id: uuid.UUID) -> list[uuid.UUID]:
    """Collect all descendant folder IDs (breadth-first)."""
    ids = []
    queue = [folder_id]
    while queue:
        current = queue.pop(0)
        child_ids = [
            r[0] for r in db.query(models.ProjectFolder.id).filter(
                models.ProjectFolder.parent_id == current,
                models.ProjectFolder.is_deleted == False,
            ).all()
        ]
        ids.extend(child_ids)
        queue.extend(child_ids)
    return ids


@router.delete("/{folder_id}")
@limiter.limit("20/minute")
def delete_folder(request: Request, folder_id: uuid.UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_folder = db.query(models.ProjectFolder).filter(
        models.ProjectFolder.id == folder_id,
        models.ProjectFolder.is_deleted == False,
    ).first()
    if not db_folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if not current_user.is_superuser and db_folder.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    folder_name = db_folder.name
    # Collect all descendant folder IDs
    descendant_ids = _collect_descendant_ids(db, folder_id)
    all_folder_ids = [folder_id] + descendant_ids

    # Unfile all projects in this folder and its descendants
    db.query(models.Project).filter(models.Project.folder_id.in_(all_folder_ids)).update({"folder_id": None}, synchronize_session=False)
    # Soft delete all descendants
    now = datetime.utcnow()
    for fid in all_folder_ids:
        db.query(models.ProjectFolder).filter(models.ProjectFolder.id == fid).update(
            {"is_deleted": True, "deleted_at": now}, synchronize_session=False
        )
    db.commit()
    log_audit(db, current_user.id, "DELETED", "ProjectFolder", folder_name)
    return {"status": "deleted"}
