from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.api.v1 import identity, reviews
from app.core.config import Settings, get_settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.logging import configure_logging, log_failure
from app.core.security import TokenVerifier
from app.db.session import create_database, dispose_database


def create_app(settings: Settings | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        config = settings or get_settings()
        configure_logging()
        app.state.database = create_database(config)
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            app.state.token_verifier = TokenVerifier(config, client)
            try:
                yield
            finally:
                await dispose_database(app.state.database)

    app = FastAPI(title="Socratix", version="1.0", lifespan=lifespan)
    # Configuration is needed at startup, not while exporting OpenAPI without credentials.
    origins = settings.origins if settings else []
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=False,
            allow_methods=["GET", "POST"],
            allow_headers=["Authorization", "Content-Type"],
        )
    app.include_router(identity.router, prefix="/api/v1")
    app.include_router(reviews.router, prefix="/api/v1")

    async def domain_error(request: Request, exc: Exception):
        status = {ConflictError: 409, ForbiddenError: 403, NotFoundError: 404, ValidationError: 422}[
            type(exc)
        ]
        return JSONResponse(status_code=status, content={"detail": str(exc)})

    for error in (ConflictError, ForbiddenError, NotFoundError, ValidationError):
        app.add_exception_handler(error, domain_error)

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request: Request, exc: SQLAlchemyError):
        log_failure("database", exc)
        status = 409 if isinstance(exc, IntegrityError) else 503
        return JSONResponse(
            status_code=status,
            content={"detail": "Persistence conflict" if status == 409 else "Database unavailable"},
        )

    return app


def create_configured_app() -> FastAPI:
    """Deployment factory: configure CORS and validated credentials before serving requests."""
    return create_app(get_settings())


app = create_app()
