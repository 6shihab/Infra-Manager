"""
Migrate existing users from PostgreSQL to Keycloak.

This script:
1. Authenticates to Keycloak Admin API using the backend client credentials
2. For each user in the local database without a keycloak_id:
   - Creates the user in Keycloak
   - Assigns the 'superuser' realm role if applicable
   - Stores the Keycloak user ID back in the local database
3. Users will be required to set a new password on first login
   (bcrypt hashes cannot be migrated to Keycloak)

Usage:
    cd backend
    python -m scripts.migrate_users_to_keycloak

Idempotent: skips users that already have a keycloak_id.
"""

import sys
import os

# Add the backend directory to the path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import User
from app.keycloak import keycloak_admin


def migrate_users():
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.keycloak_id == None).all()
        total = len(users)
        print(f"Found {total} users to migrate to Keycloak.")

        success = 0
        failed = 0

        for user in users:
            try:
                # Split full_name into first/last
                name_parts = (user.full_name or "").split(" ", 1)
                first_name = name_parts[0] if name_parts else ""
                last_name = name_parts[1] if len(name_parts) > 1 else ""

                # Check if user already exists in Keycloak by email
                existing_kc_id = keycloak_admin.get_user_id_by_email(user.email)
                if existing_kc_id:
                    # User exists in Keycloak but not linked locally
                    user.keycloak_id = existing_kc_id
                    db.commit()
                    print(f"  [LINKED] {user.email} -> {existing_kc_id} (already existed in Keycloak)")
                    success += 1
                    continue

                # Create user in Keycloak
                keycloak_id = keycloak_admin.create_user(
                    email=user.email,
                    first_name=first_name,
                    last_name=last_name,
                    enabled=user.is_active,
                    require_password_update=True,
                )

                if not keycloak_id:
                    print(f"  [FAIL] {user.email} - no Keycloak ID returned")
                    failed += 1
                    continue

                # Assign superuser role if needed
                if user.is_superuser:
                    try:
                        keycloak_admin.assign_realm_role(keycloak_id, "superuser")
                    except Exception as e:
                        print(f"  [WARN] {user.email} - failed to assign superuser role: {e}")

                # Store keycloak_id in local database
                user.keycloak_id = keycloak_id
                db.commit()

                print(f"  [OK] {user.email} -> {keycloak_id}")
                success += 1

            except Exception as e:
                print(f"  [FAIL] {user.email} - {e}")
                db.rollback()
                failed += 1

        print(f"\nMigration complete: {success} succeeded, {failed} failed out of {total} total.")

    finally:
        db.close()


if __name__ == "__main__":
    migrate_users()
