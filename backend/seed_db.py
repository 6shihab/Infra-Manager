import sys
import os

# Add the backend directory to Python path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, engine
from app import models

# Ensure tables are built
models.Base.metadata.create_all(bind=engine)

def seed():
    db = SessionLocal()
    
    # Check if we already have projects
    if db.query(models.Project).count() > 0:
        print("Database already contains Data. Skipping seed.")
        return
        
    print("Seeding initial DevOps data...")
    
    # 1. Create a Project
    project = models.Project(
        name="Main ERP System",
        description="The core enterprise resource planning frontend and backend APIs.",
        primary_domain="erp.inframanager.local",
        environment=models.EnvironmentEnum.prod
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    
    # 2. Add Servers
    server1 = models.Server(
        ip_address="10.0.1.55",
        os="Ubuntu 22.04",
        region="us-east-1",
        username="root",
        password="secure_server_password_1",
        project_id=project.id
    )
    server2 = models.Server(
        ip_address="10.0.1.56",
        os="Ubuntu 22.04",
        region="us-east-1",
        username="root",
        password="secure_server_password_2",
        project_id=project.id
    )
    db.add_all([server1, server2])
    
    # 3. Add Database
    db_info = models.DatabaseInfo(
        engine="PostgreSQL 16",
        host="db01.inframanager.local",
        port=5432,
        db_name="erp_production",
        username="db_admin",
        password="super_secret_db_password",
        project_id=project.id
    )
    db.add(db_info)
    
    db.commit()
    print("Seeding complete! You can view the 'Main ERP System' project in the web UI.")

if __name__ == "__main__":
    seed()
