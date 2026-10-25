"""Internal gateway interface from shared_contracts.md; no public DTOs."""
from typing import Protocol


class LLMGatewayProtocol(Protocol):
    async def generate_json(self, *, operation: str, model_alias: str,
                            system_prompt: str, payload: dict, schema: type) -> dict: ...

    async def generate_text(self, *, operation: str, model_alias: str,
                            system_prompt: str, payload: dict) -> str: ...
