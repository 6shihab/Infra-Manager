from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

engine_args = {}
if settings.database_url and settings.database_url.startswith("postgresql"):
    engine_args = {
        "pool_size": 20,
        "max_overflow": 10,
        "pool_timeout": 30,
        "pool_recycle": 1800
    }
elif settings.database_url and settings.database_url.startswith("sqlite"):
    engine_args = {"connect_args": {"check_same_thread": False}}

engine = create_engine(settings.database_url, **engine_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
