import inspect

from app.contracts.llm import LLMGatewayProtocol
from app.integrations.elm import ELMGateway


def test_gateway_preserves_canonical_keyword_only_interfaces():
    for name in ("generate_json", "generate_text"):
        interface = inspect.signature(getattr(LLMGatewayProtocol, name))
        implementation = inspect.signature(getattr(ELMGateway, name))
        assert implementation == interface
        assert inspect.iscoroutinefunction(getattr(ELMGateway, name))
        assert all(parameter.kind == inspect.Parameter.KEYWORD_ONLY
                   for key, parameter in implementation.parameters.items() if key != "self")
