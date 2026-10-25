"""One controlled migration session, outside API startup. Never modify Supabase-managed schemas."""

from alembic import context
from sqlalchemy import create_engine, pool, text

from app.core.config import get_settings
from app.db import models  # noqa: F401
from app.db.base import Base
from app.db.session import connection_args

config = context.config


def include_object(obj, name, type_, reflected, compare_to):
    return getattr(obj, "schema", "socratix") == "socratix"


def include_name(name, type_, parent_names):
    if type_ == "schema":
        return name == "socratix"
    if type_ == "table":
        return parent_names.get("schema_name") == "socratix"
    return True


def configure(connection=None):
    options = dict(
        target_metadata=Base.metadata,
        version_table_schema="socratix",
        include_schemas=True,
        include_object=include_object,
        include_name=include_name,
        compare_type=True,
    )
    if connection is None:
        context.configure(
            url="postgresql+psycopg://", literal_binds=True, dialect_opts={"paramstyle": "named"}, **options
        )
    else:
        context.configure(connection=connection, **options)


def run(connection):
    connection.execute(text("CREATE SCHEMA IF NOT EXISTS socratix"))
    connection.commit()
    configure(connection)
    with context.begin_transaction():
        connection.execute(text("SELECT pg_advisory_xact_lock(73142000)"))
        context.run_migrations()


if context.is_offline_mode():
    configure()
    with context.begin_transaction():
        context.execute("CREATE SCHEMA IF NOT EXISTS socratix")
        context.run_migrations()
else:
    supplied = config.attributes.get("connection")
    if supplied is not None:
        run(supplied)
    else:
        settings = get_settings()
        url = (settings.migration_database_url or settings.database_url).get_secret_value()
        engine = create_engine(
            url, poolclass=pool.NullPool, connect_args=connection_args(settings), hide_parameters=True
        )
        try:
            with engine.connect() as connection:
                run(connection)
        finally:
            engine.dispose()
