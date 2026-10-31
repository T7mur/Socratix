"""Supabase Postgres for planning (project dgrgbevyumlmodxknslo), used from the server only.

DATABASE_URL = the Session pooler string (port 5432, IPv4: Render has no IPv6), in the Render secret file.
The browser never gets database credentials. Without DATABASE_URL the database is off and /health/db says so.
"""
import os

from psycopg_pool import ConnectionPool

_pool = None


def pool():
    global _pool
    url = os.getenv("DATABASE_URL")
    if not url:
        return None
    if _pool is None:
        _pool = ConnectionPool(
            url, min_size=0, max_size=int(os.getenv("DB_POOL_SIZE", "5")), open=True,
            check=ConnectionPool.check_connection,  # like pool_pre_ping: drop dead connections before use
            kwargs={"sslmode": "require", "connect_timeout": 10, "options": "-c statement_timeout=5000"},
        )
    return _pool


def ping() -> None:
    """Raises if the database or the planning schema can't be reached."""
    with pool().connection() as conn:
        conn.execute("select 1 from planning.students limit 1")
