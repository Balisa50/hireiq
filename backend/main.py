"""
HireIQ FastAPI Application
Enterprise-grade AI hiring platform backend.
Author: HireIQ Engineering
"""

import logging
import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import get_settings
from app.routers.auth_router import router as auth_router
from app.routers.jobs_router import router as jobs_router
from app.routers.companies_router import router as companies_router
from app.routers.interviews_router import router as interviews_router

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("hireiq.main")


@asynccontextmanager
async def application_lifespan(app: FastAPI):
    """Startup and shutdown events."""
    settings = get_settings()
    logger.info("=" * 60)
    logger.info("🚀 HireIQ API starting — environment: %s", settings.environment)
    logger.info("=" * 60)
    yield
    logger.info("HireIQ API shutting down.")


# ── Rate limiter ───────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

# ── FastAPI application ────────────────────────────────────────────────────────
app = FastAPI(
    title="HireIQ API",
    description="Enterprise-grade AI hiring platform",
    version="1.0.0",
    docs_url="/docs" if get_settings().environment == "development" else None,
    redoc_url=None,
    lifespan=application_lifespan,
)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


# ── CORS ───────────────────────────────────────────────────────────────────────
settings = get_settings()

# Build allowed origins list — strip trailing slashes to avoid mismatches
_origins: list[str] = []
if settings.frontend_url:
    _origins.append(settings.frontend_url.rstrip("/"))
if settings.allowed_origins:
    for o in settings.allowed_origins.split(","):
        o = o.strip().rstrip("/")
        if o and o not in _origins:
            _origins.append(o)
# Always allow the canonical production frontend(s)
_production_origins = [
    "https://hireiq-ab.vercel.app",
    "https://hireiq-frontend-three.vercel.app",
]
for o in _production_origins:
    if o not in _origins:
        _origins.append(o)
# Dev convenience
if settings.environment == "development":
    _origins.extend([
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
    ])
# Never fall back to "*" — it is incompatible with allow_credentials=True
allowed_origins = _origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    max_age=600,
)


# ── Security headers middleware ────────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    """Add security headers to every response and attach a request ID for tracing."""
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id

    start_time = time.perf_counter()
    response: Response = await call_next(request)
    duration_ms = round((time.perf_counter() - start_time) * 1000, 1)

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time"] = f"{duration_ms}ms"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'none'; "
        "style-src 'none'; "
        "object-src 'none';"
    )

    logger.info(
        "%s %s → %d (%sms) [%s]",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        request_id,
    )

    return response


# ── Rate limit error handler ───────────────────────────────────────────────────
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "error": "Too many requests. Please slow down and try again shortly.",
            "request_id": getattr(request.state, "request_id", None),
        },
    )


# ── Global error handler ───────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "unknown")
    logger.error(
        "Unhandled exception on %s %s [%s]: %s",
        request.method,
        request.url.path,
        request_id,
        str(exc),
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "Something went wrong on our end. Please try again.",
            "request_id": request_id,
        },
    )


# ── Routes ─────────────────────────────────────────────────────────────────────
app.include_router(auth_router, prefix="/api")
app.include_router(companies_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")
app.include_router(interviews_router, prefix="/api")


# ── Health check ───────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    """Health check endpoint. Frontend pings this every 30 seconds to prevent cold starts."""
    import time as time_module
    return {
        "status": "healthy",
        "service": "hireiq-api",
        "timestamp": time_module.time(),
        "environment": settings.environment,
    }
