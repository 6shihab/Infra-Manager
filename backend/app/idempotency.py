"""
Idempotency middleware for POST requests.

When a client sends a POST request with an X-Idempotency-Key header,
the response is cached so that retries with the same key return the
cached result instead of creating duplicate resources.
"""
import json
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse

logger = logging.getLogger(__name__)

# In-memory cache for idempotency keys (key -> {status, body, headers})
# In production with multiple workers, this should use Redis via FastAPICache.
_idempotency_cache: dict[str, dict] = {}
MAX_CACHE_SIZE = 10_000
CACHE_TTL_SECONDS = 3600  # 1 hour


class IdempotencyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Only apply to POST requests with the idempotency header
        if request.method != "POST":
            return await call_next(request)

        idempotency_key = request.headers.get("X-Idempotency-Key")
        if not idempotency_key:
            return await call_next(request)

        # Check cache
        if idempotency_key in _idempotency_cache:
            cached = _idempotency_cache[idempotency_key]
            logger.info("Idempotency cache hit for key %s", idempotency_key)
            return JSONResponse(
                status_code=cached["status"],
                content=cached["body"],
            )

        # Process the request
        response = await call_next(request)

        # Only cache successful responses (2xx)
        if 200 <= response.status_code < 300:
            # Read the response body
            body_bytes = b""
            async for chunk in response.body_iterator:
                body_bytes += chunk

            try:
                body_json = json.loads(body_bytes)
            except (json.JSONDecodeError, ValueError):
                body_json = body_bytes.decode("utf-8", errors="replace")

            # Evict oldest entries if cache is too large
            if len(_idempotency_cache) >= MAX_CACHE_SIZE:
                oldest_key = next(iter(_idempotency_cache))
                del _idempotency_cache[oldest_key]

            _idempotency_cache[idempotency_key] = {
                "status": response.status_code,
                "body": body_json,
            }

            # Return a new response since we consumed the body iterator
            return JSONResponse(
                status_code=response.status_code,
                content=body_json,
                headers=dict(response.headers),
            )

        return response
