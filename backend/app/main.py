from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app import models
from app.database import engine
from app.routers import projects, servers, databases, settings, components, auth, users, groups

# Create tables matching models
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Infra Manager API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(servers.router)
app.include_router(databases.router)
app.include_router(settings.router)
app.include_router(components.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(groups.router)

@app.get("/")
def read_root():
    return {"message": "Infra Manager API is running"}
