"""Shared paths and migration configuration for operator commands."""

from pathlib import Path
from urllib.parse import urlparse

from alembic.config import Config
from app.core.config import Settings
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[2]


def settings() -> Settings:
    return Settings(_env_file=ROOT / ".env")


def alembic_config() -> Config:
    return Config(str(ROOT / "src" / "backend" / "alembic.ini"))


def validate_target(config: Settings, target: str) -> None:
    if target not in {"development", "test", "staging"} or target != config.app_env:
        raise ValueError(
            "Explicit target must match APP_ENV and be development, test or staging"
        )
    project = urlparse(config.supabase_url).hostname.split(".")[0]
    for secret in (config.database_url, config.migration_database_url):
        if secret is None:
            continue
        url = make_url(secret.get_secret_value())
        if url.host != f"db.{project}.supabase.co" and not (
            url.host.endswith(".pooler.supabase.com")
            and url.username.endswith(f".{project}")
        ):
            raise ValueError(
                "Database URL must belong to the configured Supabase project"
            )
