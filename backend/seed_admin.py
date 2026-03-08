import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import User
from app.auth import get_password_hash

ADMIN_EMAIL = "admin@inframanager.local"
ADMIN_PASSWORD = "Admin@1234"
ADMIN_FULL_NAME = "System Administrator"


def seed_admin():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if not user:
            print("Creating default admin user...")
            admin_user = User(
                email=ADMIN_EMAIL,
                full_name=ADMIN_FULL_NAME,
                hashed_password=get_password_hash(ADMIN_PASSWORD),
                is_active=True,
                is_superuser=True,
            )
            db.add(admin_user)
            db.commit()
            print(f"Admin created — Email: {ADMIN_EMAIL}  Password: {ADMIN_PASSWORD}")
        else:
            print(f"Admin user already exists: {ADMIN_EMAIL}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_admin()
