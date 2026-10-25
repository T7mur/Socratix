"""Minimal app composition; provider access remains lazy and server-side."""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import Settings, get_settings
from app.integrations.elm import ELMGateway


def create_app(settings: Settings | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with ELMGateway(settings or get_settings()) as gateway:
            app.state.llm_gateway = gateway
            yield

    return FastAPI(title="Socratix", version="1.0", lifespan=lifespan)


app = create_app()
