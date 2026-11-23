"""Pydantic request/response schemas with validation at the API boundary."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ----------------------------- auth ---------------------------------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)


class UserOut(ORMModel):
    id: int
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: UserOut


class CreateUserRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=10, max_length=256)
    role: Literal["viewer", "analyst", "admin"] = "viewer"


# ----------------------------- access points -------------------------
class AccessPointBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    location: str = Field(min_length=2, max_length=160)
    ip_address: str = Field(min_length=3, max_length=45)
    mac_address: str | None = Field(default=None, max_length=32)
    vendor: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    is_simulated: bool = False
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, value: str) -> str:
        import ipaddress

        try:
            return str(ipaddress.ip_address(value.strip()))
        except ValueError as exc:
            raise ValueError("Enter a valid IPv4 or IPv6 address") from exc

    @field_validator("mac_address")
    @classmethod
    def clean_mac(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        import re

        cleaned = value.strip().upper().replace("-", ":")
        if not re.fullmatch(r"([0-9A-F]{2}:){5}[0-9A-F]{2}", cleaned):
            raise ValueError("MAC address must use the AA:BB:CC:DD:EE:FF format")
        return cleaned


class AccessPointCreate(AccessPointBase):
    pass


class AccessPointUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    location: str | None = Field(default=None, min_length=2, max_length=160)
    ip_address: str | None = Field(default=None, min_length=3, max_length=45)
    mac_address: str | None = Field(default=None, max_length=32)
    vendor: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    is_simulated: bool | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, value: str | None) -> str | None:
        if value is None:
            return value
        import ipaddress

        try:
            return str(ipaddress.ip_address(value.strip()))
        except ValueError as exc:
            raise ValueError("Enter a valid IPv4 or IPv6 address") from exc


class AccessPointOut(ORMModel):
    id: int
    name: str
    location: str
    ip_address: str
    mac_address: str | None
    vendor: str | None
    model: str | None
    is_simulated: bool
    status: str
    last_checked_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class AccessPointHistoryOut(ORMModel):
    id: int
    change_type: str
    changes: dict[str, Any]
    changed_by: int | None
    changed_at: datetime


class AccessPointDetail(AccessPointOut):
    history: list[AccessPointHistoryOut] = []


# ----------------------------- monitoring ----------------------------
class MeasurementOut(ORMModel):
    id: int
    access_point_id: int | None
    latency_ms: float | None
    packet_loss_pct: float
    jitter_ms: float | None
    is_online: bool
    probe_target: str
    data_origin: str
    error_message: str | None
    recorded_at: datetime


class InterfaceInfo(BaseModel):
    name: str
    addresses: list[str]
    is_up: bool
    speed_mbps: int | None = None


class NetworkInfo(BaseModel):
    hostname: str
    platform: str
    interfaces: list[InterfaceInfo]
    probe_target: str
    monitoring_enabled: bool
    monitoring_interval_seconds: int
    collected_at: datetime


class MonitoringRunResponse(BaseModel):
    measurement: MeasurementOut | None
    message: str
    latency_threshold_ms: float
    packet_loss_threshold_pct: float


class MonitoringHistory(BaseModel):
    measurements: list[MeasurementOut]
    hours: int


# ----------------------------- devices -------------------------------
class DeviceOut(ORMModel):
    id: int
    display_name: str | None
    hostname: str | None
    ip_address: str
    mac_masked: str | None
    is_approved: bool
    is_active: bool
    first_seen_at: datetime
    last_seen_at: datetime
    notes: str | None


class DeviceDiscoveryResult(BaseModel):
    discovered: int
    new_devices: int
    duplicates_ignored: int
    method: str
    message: str
    devices: list[DeviceOut]


class DeviceUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)
    is_approved: bool | None = None


# ----------------------------- anomalies -----------------------------
class AnomalyOut(ORMModel):
    id: int
    measurement_id: int | None
    access_point_id: int | None
    anomaly_score: float
    severity: str
    detected_at: datetime
    explanation: str
    features: dict[str, Any]
    model_version: str
    used_sample_baseline: bool


class AnomalyDetectionSummary(BaseModel):
    status: str
    model_version: str
    training_samples: int
    sample_baseline_used: bool
    measurements_scored: int
    anomalies_found: int
    detected: list[AnomalyOut]
    message: str


# ----------------------------- troubleshooting -----------------------
class TroubleshootingRequest(BaseModel):
    access_point_id: int | None = None


class TroubleshootingOut(ORMModel):
    id: int
    measurement_id: int | None
    access_point_id: int | None
    issue_type: str
    severity: str
    detected_issue: str
    possible_causes: list[str]
    recommended_steps: list[str]
    related_incident_ids: list[int]
    safety_note: str
    generated_at: datetime
    is_active: bool


# ----------------------------- tickets -------------------------------
class TicketCommentCreate(BaseModel):
    comment: str = Field(min_length=1, max_length=3000)


class TicketCommentOut(ORMModel):
    id: int
    ticket_id: int
    user_id: int | None
    comment: str
    created_at: datetime
    author_name: str | None = None


class TicketOut(ORMModel):
    id: int
    ticket_number: str
    title: str
    description: str
    priority: str
    status: str
    issue_type: str
    fingerprint: str
    source: str
    access_point_id: int | None
    anomaly_event_id: int | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    comments: list[TicketCommentOut] = []


class TicketUpdate(BaseModel):
    status: Literal["Open", "In Progress", "Resolved"] | None = None
    priority: Literal["Low", "Medium", "High", "Critical"] | None = None


class TicketCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=3, max_length=5000)
    priority: Literal["Low", "Medium", "High", "Critical"] = "Medium"
    issue_type: str = Field(default="manual", max_length=60)
    access_point_id: int | None = None


class TicketStats(BaseModel):
    open: int
    in_progress: int
    resolved: int
    critical: int
    total: int


# ----------------------------- automated tests -----------------------
class TestResultOut(ORMModel):
    id: int
    run_id: str
    suite: str
    test_name: str
    status: str
    duration_ms: float
    details: str | None
    executed_at: datetime


class TestRunResponse(BaseModel):
    run_id: str
    status: str
    message: str


class TestSummary(BaseModel):
    results: list[TestResultOut]
    runs: list[dict[str, Any]]
    latest_run_id: str | None
    passed: int
    failed: int
    skipped: int


# ----------------------------- reports -------------------------------
class ReportOut(BaseModel):
    filename: str
    title: str
    report_type: str
    size_bytes: int
    generated_at: datetime
    download_url: str


class ReportGenerateRequest(BaseModel):
    report_type: Literal[
        "executive", "uptime", "latency", "packet_loss", "access_points",
        "anomalies", "issues", "testing", "intelligence"
    ]
    hours: int = Field(default=168, ge=1, le=2160)


# ----------------------------- settings ------------------------------
class SettingsOut(BaseModel):
    latency_threshold_ms: float
    packet_loss_threshold_pct: float
    monitoring_interval_seconds: int
    monitor_target: str
    auto_tickets_enabled: bool
    auto_anomaly_detection: bool
    device_discovery_enabled: bool
    theme_default: str = "dark"
    organization_name: str = "NetPulse AI"


class SettingsUpdate(BaseModel):
    latency_threshold_ms: float | None = Field(default=None, gt=0, le=5000)
    packet_loss_threshold_pct: float | None = Field(default=None, ge=0, le=100)
    auto_tickets_enabled: bool | None = None
    auto_anomaly_detection: bool | None = None
    theme_default: Literal["dark", "light"] | None = None
    organization_name: str | None = Field(default=None, min_length=2, max_length=120)


class MessageResponse(BaseModel):
    message: str
