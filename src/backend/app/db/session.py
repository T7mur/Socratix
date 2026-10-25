from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import Settings


@dataclass
class Database:
    engine: AsyncEngine
    sessions: async_sessionmaker[AsyncSession]


def connection_args(settings: Settings) -> dict:
    return {
        "sslmode": "require",
        "connect_timeout": settings.db_connect_timeout_seconds,
        "options": f"-c statement_timeout={settings.db_statement_timeout_ms}",
    }


def create_database(settings: Settings) -> Database:
    engine = create_async_engine(
        settings.database_url.get_secret_value(),
        connect_args=connection_args(settings),
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout_seconds,
        pool_pre_ping=True,
        hide_parameters=True,
        echo=False,
    )
    return Database(engine, async_sessionmaker(engine, expire_on_commit=False))


async def get_db_session(request: Request):
    async with request.app.state.database.sessions() as session:
        yield session


@asynccontextmanager
async def transaction(session: AsyncSession):
    """Caller-owned atomic unit. Never use a nested commit to hide partial operations."""
    async with session.begin():
        yield session


async def check_connection(database: Database) -> dict:
    async with database.engine.connect() as conn:
        version = await conn.scalar(text("SHOW server_version"))
        tls = await conn.scalar(text("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()"))
        raw = await conn.get_raw_connection()
        client_tls = bool(raw.driver_connection.pgconn.ssl_in_use)
        revision = await conn.scalar(text("SELECT version_num FROM socratix.alembic_version"))
        return {"connected": True, "server_version": version, "tls": client_tls,
                "server_tls": bool(tls), "revision": revision}


async def dispose_database(database: Database) -> None:
    await database.engine.dispose()
