from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app import models
from app.database import engine
from app.config import settings
from app.routers import projects, servers, databases, settings as settings_router, components, auth, users, groups, audit_router
from app.monitor import start_scheduler

# Create tables matching models
models.Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting background monitoring service...")
    start_scheduler()
    yield
    print("Shutting down background tasks...")

app = FastAPI(title="Infra Manager API", lifespan=lifespan)

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(servers.router)
app.include_router(databases.router)
app.include_router(settings_router.router)
app.include_router(components.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(groups.router)
app.include_router(audit_router.router)

@app.get("/")
def read_root():
    return {"message": "Infra Manager API is running"}
