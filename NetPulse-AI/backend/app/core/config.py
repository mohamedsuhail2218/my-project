"""Typed, environment-driven application configuration."""

from __future__ import annotations

import logging
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("netpulse.config")
BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "NetPulse AI"
    environment: str = "development"
    debug: bool = False
    api_prefix: str = "/api"

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'netpulse.db').as_posix()}"

    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=480, ge=5, le=43200)
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    admin_email: str = ""
    admin_password: str = ""
    admin_full_name: str = "NetPulse Administrator"

    monitor_target: str = "1.1.1.1"
    monitor_packet_count: int = Field(default=4, ge=1, le=10)
    monitor_timeout_ms: int = Field(default=1500, ge=250, le=10000)
    monitoring_interval_seconds: int = Field(default=60, ge=15, le=3600)
    monitoring_enabled: bool = True
    monitor_on_startup: bool = True
    device_discovery_enabled: bool = True

    latency_threshold_ms: float = Field(default=150.0, gt=0)
    packet_loss_threshold_pct: float = Field(default=5.0, ge=0, le=100)
    auto_tickets_enabled: bool = True
    auto_anomaly_detection: bool = True
    anomaly_min_samples: int = Field(default=30, ge=8)
    anomaly_contamination: float = Field(default=0.08, gt=0, lt=0.5)

    test_runner_enabled: bool = True
    reports_dir: str = "../reports"

    @field_validator("environment")
    @classmethod
    def validate_environment(cls, value: str) -> str:
        allowed = {"development", "testing", "production"}
        value = value.strip().lower()
        if value not in allowed:
            raise ValueError(f"environment must be one of {sorted(allowed)}")
        return value

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        """Accept the bare Postgres URLs issued by hosting providers.

        Managed services commonly expose ``postgres://`` (or ``postgresql://``)
        URLs, while SQLAlchemy expects an explicit driver. Normalising here keeps
        the deployment configuration copy-pasteable and avoids a missing-driver
        failure on the first request.
        """
        value = value.strip()
        for scheme in ("postgres://", "postgresql://"):
            if value.startswith(scheme):
                return f"postgresql+psycopg2://{value.removeprefix(scheme)}"
        return value

    @model_validator(mode="after")
    def secure_runtime_defaults(self) -> "Settings":
        if self.database_url.startswith("sqlite:///"):
            raw = self.database_url.removeprefix("sqlite:///")
            if raw and raw != ":memory:":
                database_path = Path(raw)
                if not database_path.is_absolute():
                    database_path = (BACKEND_DIR / database_path).resolve()
                self.database_url = f"sqlite:///{database_path.as_posix()}"
        if not self.jwt_secret_key or self.jwt_secret_key.startswith("REPLACE_"):
            if self.environment == "production":
                raise ValueError("JWT_SECRET_KEY must be a strong random value in production")
            self.jwt_secret_key = secrets.token_urlsafe(48)
            logger.warning("JWT_SECRET_KEY not configured; using an ephemeral development key")
        if len(self.jwt_secret_key) < 32 and self.environment == "production":
            raise ValueError("JWT_SECRET_KEY must be at least 32 characters in production")
        if self.environment == "production" and (not self.admin_password or self.admin_password.startswith("REPLACE_")):
            raise ValueError("A strong ADMIN_PASSWORD is required for the initial production bootstrap")
        if self.environment == "production" and self.debug:
            raise ValueError("DEBUG must be false in production")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def reports_path(self) -> Path:
        candidate = Path(self.reports_dir)
        if not candidate.is_absolute():
            candidate = (BACKEND_DIR / candidate).resolve()
        candidate.mkdir(parents=True, exist_ok=True)
        return candidate

    @property
    def sqlite_path(self) -> Path | None:
        if self.database_url.startswith("sqlite:///"):
            raw = self.database_url.removeprefix("sqlite:///")
            if raw and raw != ":memory:":
                path = Path(raw)
                if not path.is_absolute():
                    path = (BACKEND_DIR / path).resolve()
                return path
        return None


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
