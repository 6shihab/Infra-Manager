import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import (
    User, Group, Project, Server, DatabaseEngine,
    ProjectServer, ProjectDatabase, Component,
    ProjectGroupAccess, Setting,
    EnvironmentEnum, AccessLevelEnum,
)
from app.auth import get_password_hash


def seed():
    db = SessionLocal()
    try:
        if db.query(Project).count() > 0:
            print("Database already contains data. Skipping seed.")
            return

        print("Seeding database...")

        # ── 1. Admin user ──────────────────────────────────────────────────
        ADMIN_EMAIL = "admin@inframanager.local"
        admin = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if not admin:
            admin = User(
                email=ADMIN_EMAIL,
                full_name="System Administrator",
                hashed_password=get_password_hash("Admin@1234"),
                is_active=True,
                is_superuser=True,
            )
            db.add(admin)
            db.flush()
            print(f"  Created admin: {ADMIN_EMAIL}")

        # ── 2. Regular users ───────────────────────────────────────────────
        dev1 = User(
            email="dev1@inframanager.local",
            full_name="Alice Dev",
            hashed_password=get_password_hash("Dev1@pass1"),
            is_active=True,
            is_superuser=False,
        )
        dev2 = User(
            email="dev2@inframanager.local",
            full_name="Bob Ops",
            hashed_password=get_password_hash("Dev2@pass1"),
            is_active=True,
            is_superuser=False,
        )
        db.add_all([dev1, dev2])
        db.flush()
        print("  Created users: dev1, dev2")

        # ── 3. Group ───────────────────────────────────────────────────────
        devops_group = Group(
            name="DevOps Team",
            description="Infrastructure engineers with editor access",
        )
        db.add(devops_group)
        db.flush()
        devops_group.users.append(dev1)
        devops_group.users.append(dev2)
        print("  Created group: DevOps Team")

        # ── 4. Projects ────────────────────────────────────────────────────
        erp_project = Project(
            name="Main ERP System",
            description="Core enterprise resource planning platform.",
            primary_domain="erp.inframanager.local",
            environment=EnvironmentEnum.prod,
            created_by=admin.id,
        )
        staging_project = Project(
            name="Staging Platform",
            description="Staging environment for QA and pre-release testing.",
            primary_domain="staging.inframanager.local",
            environment=EnvironmentEnum.staging,
            created_by=admin.id,
        )
        db.add_all([erp_project, staging_project])
        db.flush()
        print("  Created projects: ERP, Staging")

        # ── 5. Grant DevOps Team access to projects ────────────────────────
        db.add_all([
            ProjectGroupAccess(
                project_id=erp_project.id,
                group_id=devops_group.id,
                access_level=AccessLevelEnum.EDITOR,
            ),
            ProjectGroupAccess(
                project_id=staging_project.id,
                group_id=devops_group.id,
                access_level=AccessLevelEnum.EDITOR,
            ),
        ])
        db.flush()
        print("  Granted DevOps Team EDITOR access to both projects")

        # ── 6. Servers ─────────────────────────────────────────────────────
        web01 = Server(
            name="web-01",
            ip_address="10.0.1.10",
            os="Ubuntu 22.04 LTS",
            region="us-east-1",
            username="ubuntu",
            password="S3cur3P@ss!01",
        )
        web02 = Server(
            name="web-02",
            ip_address="10.0.1.11",
            os="Ubuntu 22.04 LTS",
            region="us-east-1",
            username="ubuntu",
            password="S3cur3P@ss!02",
        )
        db_server = Server(
            name="db-server",
            ip_address="10.0.1.50",
            os="Debian 12",
            region="us-east-1",
            username="root",
            password="D@t@b@s3Ro0t!",
        )
        db.add_all([web01, web02, db_server])
        db.flush()
        print("  Created servers: web-01, web-02, db-server")

        # ── 7. Database Engines ────────────────────────────────────────────
        pg_engine = DatabaseEngine(
            name="Primary Postgres",
            engine="PostgreSQL",
            host="10.0.1.50",
            port=5432,
            connection_string_format="postgresql://{user}:{pass}@{host}:{port}/{db}",
            username="db_admin",
            password="Pg@dm1nP@ss!",
        )
        redis_engine = DatabaseEngine(
            name="Redis Cache",
            engine="Redis",
            host="10.0.1.50",
            port=6379,
            connection_string_format="redis://{host}:{port}/0",
            username=None,
            password=None,
        )
        db.add_all([pg_engine, redis_engine])
        db.flush()
        print("  Created database engines: Primary Postgres, Redis Cache")

        # ── 8. Link servers to projects ────────────────────────────────────
        db.add_all([
            ProjectServer(
                project_id=erp_project.id,
                server_id=web01.id,
                username="deploy",
                password="D3pl0y@ERP1!",
            ),
            ProjectServer(
                project_id=erp_project.id,
                server_id=web02.id,
                username="deploy",
                password="D3pl0y@ERP2!",
            ),
            ProjectServer(
                project_id=erp_project.id,
                server_id=db_server.id,
            ),
            ProjectServer(
                project_id=staging_project.id,
                server_id=web01.id,
                username="deploy",
                password="D3pl0y@Stg1!",
            ),
        ])
        print("  Linked servers to projects")

        # ── 9. Link databases to projects ──────────────────────────────────
        db.add_all([
            ProjectDatabase(
                project_id=erp_project.id,
                database_engine_id=pg_engine.id,
                db_name="erp_production",
                username="erp_user",
                password="ErpDbP@ss!",
            ),
            ProjectDatabase(
                project_id=erp_project.id,
                database_engine_id=redis_engine.id,
                db_name="erp_cache",
            ),
            ProjectDatabase(
                project_id=staging_project.id,
                database_engine_id=pg_engine.id,
                db_name="erp_staging",
                username="erp_stg_user",
                password="ErpStgP@ss!",
            ),
        ])
        print("  Linked databases to projects")

        # ── 10. Components ─────────────────────────────────────────────────
        db.add_all([
            Component(
                name="Main Assets S3 Bucket",
                type="S3 Bucket",
                custom_fields={"bucket_name": "erp-assets-prod", "region": "us-east-1", "acl": "private"},
                project_id=erp_project.id,
            ),
            Component(
                name="Cloudflare DNS",
                type="DNS Record",
                custom_fields={"zone_id": "abc123", "record_type": "A", "ttl": "300"},
                project_id=erp_project.id,
            ),
            Component(
                name="Staging S3 Bucket",
                type="S3 Bucket",
                custom_fields={"bucket_name": "erp-assets-staging", "region": "us-east-1", "acl": "private"},
                project_id=staging_project.id,
            ),
        ])
        print("  Created components")

        # ── 11. Settings ───────────────────────────────────────────────────
        defaults = [
            Setting(key="audit_log_retention_days", value="30", description="Days to retain audit logs"),
            Setting(key="auto_logout_minutes", value="30", description="Inactivity auto-logout duration (minutes)"),
            Setting(key="uptime_check_interval_minutes", value="2", description="Uptime monitoring check interval"),
        ]
        for s in defaults:
            if not db.get(Setting, s.key):
                db.add(s)
        print("  Created settings")

        db.commit()
        print("\nSeeding complete!")
        print("  Login: admin@inframanager.local / Admin@1234")
        print("  Login: dev1@inframanager.local  / Dev1@pass1")
        print("  Login: dev2@inframanager.local  / Dev2@pass1")

    except Exception as e:
        db.rollback()
        print(f"Seeding failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
