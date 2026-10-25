import logging

import pytest
from app.core.config import Settings
from app.core.errors import ValidationError
from app.core.logging import log_failure
from app.db.repositories.common import validate_public_payload
from app.db.session import connection_args, create_database, dispose_database
from app.modules.skill_generation.relation_validator import validate_acyclic, validate_endpoints_exist
from pydantic import ValidationError as SchemaError
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url


@pytest.mark.parametrize("field", ["database_url", "migration_database_url"])
@pytest.mark.parametrize("url", [
    "postgresql://postgres:password@db.example.supabase.co:5432/postgres",
    "postgresql://user.example:password@region.pooler.supabase.com:5432/postgres?application_name=socratix",
    "postgresql+psycopg://user:password@host.invalid:5432/postgres?sslmode=require",
])
def test_provider_urls_work_for_application_and_migrations(settings, field, url):
    values = settings.model_dump()
    values[field] = url
    configured = Settings(_env_file=None, **values)
    parsed = make_url(getattr(configured, field).get_secret_value())
    original = make_url(url)
    assert parsed.drivername == "postgresql+psycopg"
    assert (parsed.host, parsed.username, parsed.database) == (
        original.host, original.username, original.database
    )
    assert parsed.query == {**original.query, "sslmode": "require"}


@pytest.mark.asyncio
async def test_standard_url_preserves_password_and_builds_both_engines(settings):
    values = settings.model_dump()
    values["database_url"] = "postgresql://postgres:p%40ss%2Fword@db.example.supabase.co:5432/postgres"
    values["migration_database_url"] = values["database_url"]
    configured = Settings(_env_file=None, **values)
    database = create_database(configured)
    operator = create_engine(
        configured.migration_database_url.get_secret_value(), connect_args=connection_args(configured)
    )
    try:
        for engine in (database.engine, operator):
            assert engine.dialect.driver == "psycopg"
            assert engine.url.password == "p@ss/word"
            assert engine.url.query["sslmode"] == "require"
        assert "p@ss/word" not in repr(configured)
        assert "p%40ss%2Fword" not in repr(configured)
    finally:
        operator.dispose()
        await dispose_database(database)


@pytest.mark.parametrize("mode", ["disable", "allow", "prefer", "verify-ca"])
def test_tls_cannot_silently_downgrade(settings, mode):
    values = settings.model_dump()
    values["database_url"] = f"postgresql+psycopg://user:password@host.invalid/db?sslmode={mode}"
    with pytest.raises(SchemaError):
        Settings(_env_file=None, **values)


def test_transaction_pooler_is_rejected(settings):
    values = settings.model_dump()
    values["database_url"] = "postgresql+psycopg://user:password@host.invalid:6543/db?sslmode=require"
    with pytest.raises(SchemaError):
        Settings(_env_file=None, **values)


def test_auth_url_alias_and_bad_origins(settings):
    values = settings.model_dump()
    origin = values.pop("supabase_url")
    assert Settings(_env_file=None, SUPABASE_AUTH_URL=origin, **values).supabase_url == origin
    with pytest.raises(SchemaError):
        Settings(_env_file=None, SUPABASE_AUTH_URL="https://", **values)


def test_logging_does_not_stringify_provider_secrets(caplog):
    with caplog.at_level(logging.ERROR):
        log_failure("database", RuntimeError("password=DO_NOT_LOG token=PRIVATE"))
    assert "DO_NOT_LOG" not in caplog.text and "PRIVATE" not in caplog.text
    assert "RuntimeError" in caplog.text


def test_private_artifact_fields_rejected_recursively():
    with pytest.raises(ValidationError):
        validate_public_payload({"milestones": [{"hidden_test_suite_ref": "secret"}]})
    validate_public_payload({"student_brief": "Explain a boundary", "requirements": []})


def test_graph_direction_cycle_and_unknown_endpoints():
    validate_acyclic([("loops", "conditionals"), ("conditionals", "comparisons")])
    with pytest.raises(ValidationError):
        validate_acyclic([("loops", "conditionals"), ("conditionals", "loops")])
    with pytest.raises(ValidationError):
        validate_endpoints_exist("loops", "unknown", {"loops"})
    with pytest.raises(ValidationError):
        validate_endpoints_exist("loops", "loops", {"loops"})
