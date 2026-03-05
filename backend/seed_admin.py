from app.database import SessionLocal
from app.models import User
from app.auth import get_password_hash

def seed_admin():
    db = SessionLocal()
    admin_email = "admin@inframanager.local"
    user = db.query(User).filter(User.email == admin_email).first()
    if not user:
        print("Creating default admin user...")
        hashed_password = get_password_hash("admin")
        admin_user = User(
            email=admin_email,
            full_name="System Administrator",
            hashed_password=hashed_password,
            is_active=True,
            is_superuser=True
        )
        db.add(admin_user)
        db.commit()
        print(f"Default admin created. Email: {admin_email}, Password: admin")
    else:
        print("Admin user already exists.")
    db.close()

if __name__ == "__main__":
    seed_admin()
