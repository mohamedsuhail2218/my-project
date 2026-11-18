"""NetPulse AI FastAPI application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api import (
    access_points,
    anomalies,
    auth,
    dashboard,
    devices,
    monitoring,
    reports,
    settings as settings_api,
    tests as tests_api,
    tickets,
    troubleshooting,
)
from app.core.config import PROJECT_DIR, settings
from app.core.database import STARTUP_LOCK_KEY, SessionLocal, init_db
from app.core.logging_config import configure_logging
from app.monitoring.scheduler import scheduler
from app.services.seed import seed_database

configure_logging()
logger = logging.getLogger("netpulse.main")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Cold starts can overlap when a serverless platform scales out. Keep table
    # creation and first-run seeding in a single transaction and, on Postgres,
    # take a transaction-scoped advisory lock so only one instance seeds.
    with SessionLocal() as db:
        if db.get_bind().dialect.name == "postgresql":
            db.execute(
                text("SELECT pg_advisory_xact_lock(:key)"),
                {"key": STARTUP_LOCK_KEY},
            )
        init_db(db.connection())
        seed_database(db)
    await scheduler.start()
    logger.info("NetPulse AI started (environment=%s)", settings.environment)
    yield
    await scheduler.stop()
    logger.info("NetPulse AI stopped")


app = FastAPI(
    title="NetPulse AI API",
    version="1.0.0",
    description=(
        "Intelligent Wi-Fi network monitoring, Isolation Forest anomaly detection, "
        "smart troubleshooting, device governance, issue automation and PDF analytics. "
        "Live measurements are real local diagnostics; simulated records are labelled."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
    response.headers["Cache-Control"] = "no-store" if request.url.path.startswith(settings.api_prefix) else "no-cache"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_, exc: RequestValidationError):
    simplified = []
    for error in exc.errors():
        simplified.append(
            {
                "field": ".".join(str(part) for part in error.get("loc", []) if part != "body"),
                "message": error.get("msg", "Invalid value"),
            }
        )
    return JSONResponse(
        status_code=422,
        content={"detail": "Some fields are invalid", "errors": simplified},
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected server error occurred. Check the server log for details."},
    )


prefix = settings.api_prefix
app.include_router(auth.router, prefix=prefix)
app.include_router(dashboard.router, prefix=prefix)
app.include_router(monitoring.router, prefix=prefix)
app.include_router(access_points.router, prefix=prefix)
app.include_router(devices.router, prefix=prefix)
app.include_router(anomalies.router, prefix=prefix)
app.include_router(troubleshooting.router, prefix=prefix)
app.include_router(tickets.router, prefix=prefix)
app.include_router(tests_api.router, prefix=prefix)
app.include_router(reports.router, prefix=prefix)
app.include_router(settings_api.router, prefix=prefix)


@app.get(f"{prefix}/health", tags=["System"])
def health() -> dict:
    database_status = "connected"
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception:
        database_status = "unavailable"
    return {
        "status": "ok" if database_status == "connected" else "degraded",
        "app": settings.app_name,
        "version": app.version,
        "database": database_status,
        "environment": settings.environment,
        "monitoring_enabled": settings.monitoring_enabled,
        "live_measurement_policy": "No fabricated live telemetry; simulations are labelled",
    }


DIST_DIR = Path(PROJECT_DIR) / "frontend" / "dist"
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        if full_path.startswith(prefix.removeprefix("/")):
            return JSONResponse(status_code=404, content={"detail": "API endpoint not found"})
        if full_path:
            candidate = (DIST_DIR / full_path).resolve()
            if candidate.is_file() and DIST_DIR.resolve() in candidate.parents:
                return FileResponse(candidate)
        return FileResponse(DIST_DIR / "index.html")
