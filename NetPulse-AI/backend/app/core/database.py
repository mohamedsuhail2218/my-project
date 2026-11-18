"""SQLAlchemy engine, sessions and schema bootstrap."""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

# Stable key used to serialise first-run schema creation and seeding when several
# serverless instances start at once. Transaction-scoped advisory locks work
# through a transaction-pooling proxy and are released automatically on commit.
STARTUP_LOCK_KEY = 0x4E50554C53  # "NPULS"


class Base(DeclarativeBase):
    pass


def _engine_kwargs() -> dict:
    kwargs: dict = {"pool_pre_ping": True, "future": True}
    if settings.database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    else:
        # Serverless functions fan out into many short-lived processes, so keep
        # each pool small and recycle before a managed database or pooler drops
        # an idle connection.
        kwargs["pool_recycle"] = 300
        kwargs["pool_size"] = 2
        kwargs["max_overflow"] = 3
        kwargs["pool_timeout"] = 15
    return kwargs


sqlite_path = settings.sqlite_path
if sqlite_path:
    Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(settings.database_url, **_engine_kwargs())
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(bind=None) -> None:
    """Create tables for a fresh database.

    ``bind`` can be an engine or an open connection. Passing the connection that
    already holds the startup advisory lock keeps table creation and seeding in
    one transaction across concurrent serverless instances. MySQL deployments
    can also apply database/migrations/001_initial_schema.sql.
    """
    from app import models  # noqa: F401  (register all mappings)

    Base.metadata.create_all(bind=bind if bind is not None else engine)
