"""Application settings compose the independently usable LLM settings."""
from functools import lru_cache

from app.core.llm_config import LLMSettings


class Settings(LLMSettings):
    """Extend with other reviewed backend configuration during integration."""


@lru_cache
def get_settings() -> Settings:
    return Settings()
