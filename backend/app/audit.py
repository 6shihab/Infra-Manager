import uuid
import logging
from sqlalchemy.orm import Session
from app.models import AuditLog, User

logger = logging.getLogger(__name__)

def log_audit(
    db: Session,
    user_id: uuid.UUID | None,
    action: str,
    resource_type: str,
    resource_name: str | None = None,
    target_user_ids: list[uuid.UUID] | None = None,
):
    try:
        audit_log = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_name=resource_name
        )
        db.add(audit_log)
        db.commit()
        db.refresh(audit_log)
    except Exception as e:
        logger.exception("Failed to write audit log: %s", e)
        db.rollback()
        return

    if not target_user_ids:
        return

    try:
        from app.notifications import bus
        actor_name: str | None = None
        if user_id is not None:
            actor = db.query(User).filter(User.id == user_id).first()
            if actor:
                actor_name = actor.full_name or actor.email

        event = {
            "id": audit_log.id,
            "type": "AUDIT",
            "action": action,
            "resource_type": resource_type,
            "resource_name": resource_name,
            "timestamp": audit_log.timestamp.isoformat(),
            "actor_name": actor_name,
        }
        bus.publish_to_all(target_user_ids, event)
    except Exception as e:
        logger.exception("Failed to publish notification event: %s", e)
