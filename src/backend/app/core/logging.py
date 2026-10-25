"""Only log allowlisted operational fields, never request bodies or exception messages."""

import logging


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    for name in ("sqlalchemy.engine", "sqlalchemy.pool", "httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.CRITICAL)


def log_failure(operation: str, error: Exception) -> None:
    """Do not stringify exceptions: driver/provider messages can contain credentials or PII."""
    logging.getLogger("socratix").error("operation=%s error_type=%s", operation, type(error).__name__)
