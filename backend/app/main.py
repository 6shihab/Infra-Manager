import logging
import time
import uuid as uuid_mod
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.orm import Session
from app import models
from app.database import engine, get_db
from app.config import settings
from app.logging_config import setup_logging
from app.routers import projects, servers, databases, settings as settings_router, components, auth, users, groups, audit_router, notifications as notifications_router, totp as totp_router
from app.monitor import start_scheduler
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
from fastapi_cache.backends.inmemory import InMemoryBackend
import redis.asyncio as redis

# Configure logging before anything else
setup_logging(settings.log_level)
logger = logging.getLogger(__name__)

# Create tables matching models
models.Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting background monitoring service...")
    start_scheduler()

    # Initialize cache
    redis_url = getattr(settings, "redis_url", "redis://localhost:6379")
    try:
        redis_client = redis.from_url(redis_url, encoding="utf8", decode_responses=True)
        await redis_client.ping()
        FastAPICache.init(RedisBackend(redis_client), prefix="fastapi-cache")
        logger.info("Connected to Redis cache.")
    except Exception as e:
        logger.warning("Failed to connect to Redis (%s), falling back to InMemoryCache.", e)
        FastAPICache.init(InMemoryBackend(), prefix="fastapi-cache")

    yield
    logger.info("Shutting down background tasks...")

_docs_kwargs = {} if settings.enable_docs else {"docs_url": None, "redoc_url": None, "openapi_url": None}
app = FastAPI(title="Infra Manager API", lifespan=lifespan, **_docs_kwargs)

# Setup Rate Limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Use incoming X-Request-ID if present, otherwise generate one
        request_id = request.headers.get("X-Request-ID") or str(uuid_mod.uuid4())
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000)
        client_ip = request.client.host if request.client else "-"
        logger.info(
            "[%s] %s %s %s %dms %s",
            request_id, request.method, request.url.path, response.status_code, duration_ms, client_ip,
        )
        response.headers["X-Request-ID"] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        return response


app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    expose_headers=["X-Request-ID", "X-Total-Count"],
)

app.include_router(projects.router)
app.include_router(servers.router)
app.include_router(databases.router)
app.include_router(settings_router.router)
app.include_router(components.router)
app.include_router(auth.router)
app.include_router(totp_router.router)
app.include_router(users.router)
app.include_router(groups.router)
app.include_router(audit_router.router)
app.include_router(notifications_router.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/")
def read_root():
    return {"message": "Infra Manager API is running"}


@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "database": "disconnected"},
        )
