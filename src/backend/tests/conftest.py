"""Unit tests need no services. Destructive integration tests require explicit, isolated targets."""

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from dotenv import dotenv_values
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def settings():
    from app.core.config import Settings

    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://example:secret@example.invalid/postgres?sslmode=require",
        supabase_url="https://test-project.supabase.co",
    )


@pytest.fixture
async def db():
    url = os.getenv("TEST_DATABASE_URL")
    if not url or os.getenv("SOCRATIX_TEST_RESET") != "1":
        pytest.skip("Set TEST_DATABASE_URL and SOCRATIX_TEST_RESET=1 for a disposable test target")
    parsed = make_url(url)
    if not parsed.host or not parsed.username or not parsed.database:
        pytest.fail("Integration tests require a complete explicit PostgreSQL target")
    local = parsed.host in {"localhost", "127.0.0.1"} and parsed.database == "socratix_test"
    if not local:
        project = os.getenv("SOCRATIX_TEST_PROJECT_REF", "")
        if not project or (
            parsed.host != f"db.{project}.supabase.co"
            and not (parsed.host.endswith(".pooler.supabase.com") and parsed.username.endswith(f".{project}"))
        ):
            pytest.fail("Integration resets require an explicitly confirmed Supabase test project")
        if parsed.query.get("sslmode") != "require":
            pytest.fail("Hosted integration tests require sslmode=require")
        regular = dotenv_values(ROOT / ".env")
        origins = [
            os.getenv("SUPABASE_AUTH_URL", ""),
            os.getenv("SUPABASE_URL", ""),
            regular.get("SUPABASE_AUTH_URL") or "",
            regular.get("SUPABASE_URL") or "",
        ]
        regular_user = regular.get("SUPABASE_USER") or ""
        if any(project in origin for origin in origins) or regular_user.endswith(f".{project}"):
            pytest.fail("Do not use the application's regular Supabase project for destructive tests")
    engine = create_engine(url, hide_parameters=True)
    config = Config(str(ROOT / "src/backend/alembic.ini"))
    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS socratix CASCADE"))
        conn.commit()
        config.attributes["connection"] = conn
        command.upgrade(config, "head")
    engine.dispose()
    async_engine = create_async_engine(url, hide_parameters=True)
    try:
        yield async_sessionmaker(async_engine, expire_on_commit=False)
    finally:
        await async_engine.dispose()
