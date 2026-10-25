"""Validated configuration. Importing the app does not connect to external services."""

from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


def normalize_database_url(value: str | SecretStr) -> SecretStr:
    """Select psycopg and encrypted transport without requiring edits to provider URLs."""
    raw = value.get_secret_value() if isinstance(value, SecretStr) else value
    try:
        url = make_url(raw)
    except (ArgumentError, TypeError, ValueError):
        raise ValueError("Use a complete PostgreSQL connection URL") from None
    if url.drivername not in {"postgresql", "postgresql+psycopg"} or not url.host or not url.database:
        raise ValueError("Use a complete postgresql:// connection URL")
    if url.query.get("sslmode", "require") != "require":
        raise ValueError("Database connections require sslmode=require")
    query = {**url.query, "sslmode": "require"}
    normalized = url.set(drivername="postgresql+psycopg", query=query)
    return SecretStr(normalized.render_as_string(hide_password=False))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", populate_by_name=True, hide_input_in_errors=True
    )
    app_env: Literal["development", "test", "staging", "production"] = "development"
    database_url: SecretStr
    migration_database_url: SecretStr | None = None
    db_pool_size: int = Field(default=5, ge=1, le=100)
    db_max_overflow: int = Field(default=5, ge=0, le=100)
    db_pool_timeout_seconds: int = Field(default=30, ge=1)
    db_connect_timeout_seconds: int = Field(default=10, ge=1)
    db_statement_timeout_ms: int = Field(default=15000, ge=100)
    cors_origins: str = "http://localhost:3000"
    supabase_url: str = Field(validation_alias=AliasChoices("SUPABASE_AUTH_URL", "SUPABASE_URL"))
    supabase_jwt_audience: str = "authenticated"
    supabase_jwt_algorithm: str = "ES256"

    @field_validator("database_url", "migration_database_url", mode="before")
    @classmethod
    def normalize_connections(cls, value):
        return normalize_database_url(value) if value is not None else None

    @model_validator(mode="after")
    def validate_connections(self):
        for secret in (self.database_url, self.migration_database_url):
            if secret is None:
                continue
            url = make_url(secret.get_secret_value())
            if url.port == 6543:
                raise ValueError("Use Supabase direct or session-pooler port 5432, not transaction pooling")
        if not self.supabase_url.startswith("https://") or self.supabase_url.endswith("/"):
            raise ValueError("SUPABASE_URL must be HTTPS without a trailing slash")
        auth_url = urlparse(self.supabase_url)
        if not auth_url.hostname or auth_url.path or auth_url.query or auth_url.fragment or auth_url.username:
            raise ValueError("Use the HTTPS Supabase project Auth origin, without paths or credentials")
        if (
            self.app_env in {"staging", "production"}
            and make_url(self.database_url.get_secret_value()).username.split(".")[0] == "postgres"
        ):
            raise ValueError("The public API requires a restricted database LOGIN, not postgres")
        if self.supabase_jwt_algorithm not in {"ES256", "RS256"}:
            raise ValueError("Configure an asymmetric Supabase signing key (ES256 or RS256)")
        return self

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url}/auth/v1"

    @property
    def jwks_url(self) -> str:
        return f"{self.jwt_issuer}/.well-known/jwks.json"

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
