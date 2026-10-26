"""Single async Chat Completions boundary; no domain policy or persistence."""
import asyncio
import json
import logging
from collections.abc import Callable
from typing import Any

import httpx
from jsonschema import validators
from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI
from pydantic import BaseModel, ValidationError
from referencing import Registry
from referencing.exceptions import Unresolvable

from app.core.llm_config import LLMSettings


class LLMError(Exception):
    """Safe to display; never contains upstream bodies or input values."""
    code = "provider_failure"
    status_code = None


class LLMConfigurationError(LLMError):
    code = "llm_configuration"


class LLMProviderError(LLMError):
    def __init__(self, message, *, code="provider_failure", status_code=None):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class LLMOutputError(LLMError):
    code = "invalid_model_output"


class ELMGateway:
    def __init__(self, settings: LLMSettings, *, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self._transport = transport
        self._client: AsyncOpenAI | None = None
        self._closed = False
        # SDK/HTTP debug output can contain credentials, payloads or responses.
        for name in ("openai", "httpx", "httpcore"):
            logger = logging.getLogger(name)
            logger.setLevel(logging.CRITICAL)
            logger.disabled = True

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.aclose()

    async def aclose(self) -> None:
        self._closed = True
        if self._client is not None:
            await self._client.close()

    def _connection(self, alias: str) -> tuple[AsyncOpenAI, str]:
        if self._closed:
            raise LLMConfigurationError("LLM gateway is closed")
        if alias not in {"generation", "review"}:
            raise LLMConfigurationError("Unknown LLM model alias")
        model = getattr(self.settings, f"elm_model_{alias}") or self.settings.elm_model
        key = self.settings.elm_api_key
        if not self.settings.elm_base_url or not key or not key.get_secret_value().strip() or not model:
            raise LLMConfigurationError("Set ELM_BASE_URL, ELM_API_KEY and an ELM model")
        if self._client is None:
            print(key.get_secret_value(), self.settings.elm_base_url, model)
            self._client = AsyncOpenAI(
                api_key=key.get_secret_value(), base_url=self.settings.elm_base_url,
                max_retries=0,
                http_client=httpx.AsyncClient(
                    timeout=self.settings.elm_timeout_seconds,
                    follow_redirects=False, transport=self._transport,
                ),
                timeout=self.settings.elm_timeout_seconds,
            )
        return self._client, model

    async def generate_text(self, *, operation: str, model_alias: str,
                            system_prompt: str, payload: dict) -> str:
        return await self._generate(operation, model_alias, system_prompt, payload)

    async def generate_json(self, *, operation: str, model_alias: str,
                            system_prompt: str, payload: dict, schema: type) -> dict:
        if not isinstance(schema, type) or not issubclass(schema, BaseModel):
            raise LLMConfigurationError("JSON schema must be a Pydantic model class")

        def validate(value):
            result = schema.model_validate(value).model_dump(mode="json")
            if not isinstance(result, dict):
                raise ValueError("Expected object")
            return result

        return await self._generate(operation, model_alias, system_prompt, payload,
                                    schema.model_json_schema(), validate)

    async def generate_schema_json(self, *, operation: str, model_alias: str,
                                    system_prompt: str, payload: dict, schema: dict) -> Any:
        """Operator JSON Schema entrypoint; canonical modules use generate_json."""
        try:
            if not isinstance(schema, dict):
                raise ValueError("Schema must be an object")
            validator_type = validators.validator_for(schema)
            validator_type.check_schema(schema)
            # No external schema retrieval/network access through $ref.
            validator = validator_type(schema, registry=Registry())
        except Exception:
            raise LLMConfigurationError("Invalid JSON Schema document") from None

        def validate(value):
            try:
                valid = validator.is_valid(value)
            except Unresolvable:
                raise LLMConfigurationError("JSON Schema contains an unresolved reference") from None
            if not valid:
                raise ValueError("Schema mismatch")
            return value

        return await self._generate(operation, model_alias, system_prompt, payload, schema, validate)

    async def _generate(self, operation: str, alias: str, system: str, payload: dict,
                        schema: dict | None = None, validate: Callable | None = None) -> Any:
        client, model = self._connection(alias)
        try:
            content = json.dumps(payload, ensure_ascii=False, allow_nan=False)
            if schema is not None:
                system += "\nReturn only JSON matching this schema:\n" + json.dumps(schema)
        except (ValueError, TypeError):
            raise LLMConfigurationError("Payload and schema must be JSON serializable") from None
        messages = [{"role": "system", "content": system}, {"role": "user", "content": content}]
        for attempt in range(self.settings.elm_max_attempts):
            try:
                response = await client.chat.completions.create(model=model, messages=messages, stream=False)
            except (APIConnectionError, APIStatusError) as exc:
                print(exc, 'error')
                retry = isinstance(exc, APIConnectionError) or exc.status_code in {408, 429} or exc.status_code >= 500
                if not retry or attempt + 1 == self.settings.elm_max_attempts:
                    status = exc.status_code if isinstance(exc, APIStatusError) else None
                    code = ("provider_timeout" if isinstance(exc, APITimeoutError) or status == 408 else
                            "provider_connection" if isinstance(exc, APIConnectionError) else
                            "provider_auth" if status in {401, 403} else
                            "provider_rate_limit" if status == 429 else
                            "provider_server" if status and status >= 500 else "provider_request")
                    raise LLMProviderError("LLM endpoint request failed", code=code, status_code=status) from None
                await asyncio.sleep(min(0.5 * 2 ** attempt, 4))
                continue
            except Exception:
                raise LLMProviderError("LLM endpoint returned an invalid response") from None
            try:
                choice = response.choices[0]
                text = choice.message.content
                if choice.finish_reason != "stop" or choice.message.refusal or not text or not text.strip():
                    raise ValueError("Incomplete completion")
                if validate is None:
                    return text
                def reject_constant(value):
                    raise ValueError("Non-finite JSON value")
                value = json.loads(text, parse_constant=reject_constant)
                return validate(value)
            except (ValueError, TypeError, AttributeError, IndexError, ValidationError):
                if validate is None or attempt + 1 == self.settings.elm_max_attempts:
                    raise LLMOutputError("LLM returned empty, incomplete or invalid output") from None
                # Do not echo provider content or validation values into correction instructions.
                messages = [*messages[:2], {"role": "user", "content":
                    "Previous output was invalid. Return only complete JSON matching the supplied schema."}]
        raise LLMOutputError("LLM output attempts exhausted")
