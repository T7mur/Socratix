"""LLM configuration independent of database and identity settings."""
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class LLMSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    elm_base_url: str | None = None
    elm_api_key: SecretStr | None = None
    elm_model: str | None = None
    elm_model_generation: str | None = None
    elm_model_review: str | None = None
    elm_timeout_seconds: float = Field(default=60, gt=0, le=600, allow_inf_nan=False)
    elm_max_attempts: int = Field(default=3, ge=1, le=10)
    app_env: str = "development"

    @model_validator(mode="after")
    def validate_endpoint(self):
        if self.elm_base_url is None:
            return self
        url = urlsplit(self.elm_base_url)
        local = url.hostname in {"localhost", "127.0.0.1", "::1"}
        if (not url.hostname or url.username or url.password or url.query or url.fragment
                or (url.scheme != "https" and not (
                    url.scheme == "http" and local and self.app_env == "development"
                ))):
            raise ValueError("ELM_BASE_URL requires HTTPS (loopback HTTP is development-only)")
        return self
