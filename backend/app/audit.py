from sqlalchemy.orm import Session
from app.models import AuditLog

def log_audit(db: Session, user_id: int | None, action: str, resource_type: str, resource_name: str | None = None):
    try:
        audit_log = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_name=resource_name
        )
        db.add(audit_log)
        db.commit()
    except Exception as e:
        print(f"Failed to write audit log: {e}")
        db.rollback()
