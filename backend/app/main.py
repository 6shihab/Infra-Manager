import logging
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app import models
from app.database import engine
from app.config import settings
from app.logging_config import setup_logging
from app.routers import projects, servers, databases, settings as settings_router, components, auth, users, groups, audit_router, notifications as notifications_router
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

app = FastAPI(title="Infra Manager API", lifespan=lifespan)

# Setup Rate Limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000)
        client_ip = request.client.host if request.client else "-"
        logger.info(
            "%s %s %s %dms %s",
            request.method, request.url.path, response.status_code, duration_ms, client_ip,
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response


app.add_middleware(RequestLoggingMiddleware)
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
app.include_router(notifications_router.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/")
def read_root():
    return {"message": "Infra Manager API is running"}
