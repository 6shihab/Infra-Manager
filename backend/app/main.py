from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app import models
from app.database import engine
from app.config import settings
from app.routers import projects, servers, databases, settings as settings_router, components, auth, users, groups, audit_router
from app.monitor import start_scheduler
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
from fastapi_cache.backends.inmemory import InMemoryBackend
import redis.asyncio as redis

# Create tables matching models
models.Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting background monitoring service...")
    start_scheduler()
    
    # Initialize cache
    redis_url = getattr(settings, "redis_url", "redis://localhost:6379")
    try:
        redis_client = redis.from_url(redis_url, encoding="utf8", decode_responses=True)
        # Try to ping to see if Redis is actually up
        await redis_client.ping()
        FastAPICache.init(RedisBackend(redis_client), prefix="fastapi-cache")
        print("Connected to Redis cache.")
    except Exception as e:
        print(f"Failed to connect to Redis ({e}), falling back to InMemoryCache.")
        FastAPICache.init(InMemoryBackend(), prefix="fastapi-cache")
        
    yield
    print("Shutting down background tasks...")

app = FastAPI(title="Infra Manager API", lifespan=lifespan)

# Setup Rate Limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response

app.add_middleware(SecurityHeadersMiddleware)

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
