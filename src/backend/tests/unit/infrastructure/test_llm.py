import asyncio
import importlib.util
import json
import subprocess
from pathlib import Path

import httpx
import pytest
from app.core.config import Settings
from app.core.llm_config import LLMSettings
from app.integrations.elm import ELMGateway, LLMConfigurationError, LLMOutputError, LLMProviderError
from app.main import create_app
from pydantic import BaseModel, ValidationError

ROOT = Path(__file__).resolve().parents[5]
SCRIPT = ROOT / "src/scripts/llm_request.py"
SPEC = importlib.util.spec_from_file_location("llm_request", SCRIPT)
cli = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cli)
REQUEST = dict(operation="test_v1", model_alias="generation", system_prompt="System", payload={"text": "hi"})


def settings(**overrides):
    return LLMSettings(_env_file=None, elm_base_url="https://example.test/custom/api",
                       elm_api_key="secret-test-key", elm_model="test-model", **overrides)


def completion(content="Hello", *, finish="stop", refusal=None):
    return httpx.Response(200, json={"id": "mock", "object": "chat.completion", "created": 0,
        "model": "test-model", "choices": [{"index": 0, "finish_reason": finish,
        "message": {"role": "assistant", "content": content, "refusal": refusal}}]})


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch):
    import os
    for key in list(os.environ):
        if key.startswith("ELM_") or key == "APP_ENV":
            monkeypatch.delenv(key)


@pytest.fixture(autouse=True)
def no_backoff(monkeypatch):
    async def sleep(_):
        pass
    monkeypatch.setattr("app.integrations.elm.asyncio.sleep", sleep)


async def test_text_request_shape_and_cleanup():
    seen = []
    def handle(request):
        seen.append(request)
        return completion()
    gateway = ELMGateway(settings(), transport=httpx.MockTransport(handle))
    async with gateway:
        assert await gateway.generate_text(**REQUEST) == "Hello"
        assert gateway._client.max_retries == 0
        assert not gateway._client._client.follow_redirects
    assert gateway._client.is_closed()
    assert len(seen) == 1
    assert str(seen[0].url) == "https://example.test/custom/api/chat/completions"
    assert seen[0].headers["authorization"] == "Bearer secret-test-key"
    assert json.loads(seen[0].content) == {"model": "test-model", "stream": False,
        "messages": [{"role": "system", "content": "System"},
                     {"role": "user", "content": '{"text": "hi"}'}]}


class Answer(BaseModel):
    answer: str


async def test_pydantic_json_repair_and_alias():
    seen = []
    def handle(request):
        seen.append(json.loads(request.content))
        return completion("{bad" if len(seen) == 1 else '{"answer":"yes"}')
    async with ELMGateway(settings(elm_model_review="review-model"), transport=httpx.MockTransport(handle)) as g:
        args = {**REQUEST, "model_alias": "review"}
        assert await g.generate_json(**args, schema=Answer) == {"answer": "yes"}
    assert len(seen) == 2
    assert seen[0]["model"] == "review-model"
    assert "properties" in seen[0]["messages"][0]["content"]
    assert "{bad" not in json.dumps(seen[1])


async def test_shared_attempt_budget():
    count = 0
    def handle(request):
        nonlocal count
        count += 1
        return httpx.Response(429, json={"error": "secret-test-key"}) if count == 1 else completion("{}")
    async with ELMGateway(settings(), transport=httpx.MockTransport(handle)) as g:
        with pytest.raises(LLMOutputError):
            await g.generate_json(**REQUEST, schema=Answer)
    assert count == 3


@pytest.mark.parametrize("status, attempts", [(401, 1), (403, 1), (400, 1), (302, 1),
                                                (408, 3), (429, 3), (500, 3)])
async def test_status_retry_and_privacy(status, attempts, caplog):
    count = 0
    def handle(request):
        nonlocal count
        count += 1
        return httpx.Response(status, json={"error": "secret-test-key private input"})
    async with ELMGateway(settings(), transport=httpx.MockTransport(handle)) as g:
        with pytest.raises(LLMProviderError) as error:
            await g.generate_text(**REQUEST)
    assert count == attempts
    assert "secret-test-key" not in str(error.value) + caplog.text
    assert "private input" not in str(error.value) + caplog.text


@pytest.mark.parametrize("error_type", [httpx.ConnectError, httpx.ReadTimeout])
async def test_network_retry(error_type):
    count = 0
    def handle(request):
        nonlocal count
        count += 1
        raise error_type("secret", request=request)
    async with ELMGateway(settings(), transport=httpx.MockTransport(handle)) as g:
        with pytest.raises(LLMProviderError):
            await g.generate_text(**REQUEST)
    assert count == 3


@pytest.mark.parametrize("content, finish, refusal", [("", "stop", None), ("hi", "length", None),
                                                    (None, "stop", "refused")])
async def test_invalid_text(content, finish, refusal):
    async with ELMGateway(settings(), transport=httpx.MockTransport(
            lambda _: completion(content, finish=finish, refusal=refusal))) as g:
        with pytest.raises(LLMOutputError):
            await g.generate_text(**REQUEST)


async def test_schema_cli_path():
    schema = {"type": "object", "required": ["answer"], "properties": {"answer": {"type": "string"}}}
    async with ELMGateway(settings(), transport=httpx.MockTransport(lambda _: completion('{"answer":"ok"}'))) as g:
        assert await g.generate_schema_json(**REQUEST, schema=schema) == {"answer": "ok"}
        with pytest.raises(LLMConfigurationError):
            await g.generate_schema_json(**REQUEST, schema={"type": "bogus"})


async def test_schema_rejection_and_local_refs():
    schema = {"type": "object", "properties": {"answer": {"$ref": "#/$defs/text"}},
              "required": ["answer"], "$defs": {"text": {"type": "string"}}}
    count = 0
    def handle(request):
        nonlocal count
        count += 1
        return completion('{"answer":2}' if count == 1 else '{"answer":"ok"}')
    async with ELMGateway(settings(), transport=httpx.MockTransport(handle)) as g:
        assert await g.generate_schema_json(**REQUEST, schema=schema) == {"answer": "ok"}
    assert count == 2


async def test_remote_schema_reference_is_not_fetched():
    seen = []
    def handle(request):
        seen.append(str(request.url))
        return completion('{}')
    async with ELMGateway(settings(), transport=httpx.MockTransport(handle)) as g:
        with pytest.raises(LLMConfigurationError):
            await g.generate_schema_json(**REQUEST, schema={"$ref": "https://private.test/schema"})
    assert len(seen) == 1
    assert all("private.test" not in url for url in seen)


@pytest.mark.parametrize("content", ['{"answer":NaN}', '[]', 'not json', '{}'])
async def test_json_output_exhaustion(content):
    count = 0
    def handle(request):
        nonlocal count
        count += 1
        return completion(content)
    async with ELMGateway(settings(), transport=httpx.MockTransport(handle)) as g:
        with pytest.raises(LLMOutputError):
            await g.generate_json(**REQUEST, schema=Answer)
    assert count == 3


async def test_configuration_fails_before_network():
    async with ELMGateway(LLMSettings(_env_file=None)) as g:
        with pytest.raises(LLMConfigurationError):
            await g.generate_text(**REQUEST)
        assert g._client is None
    async with ELMGateway(settings()) as g:
        with pytest.raises(LLMConfigurationError):
            await g.generate_text(**{**REQUEST, "model_alias": "unknown"})
        assert g._client is None


@pytest.mark.parametrize("url", ["http://remote.test/v1", "https://user:secret@example.test", "https://example.test?key=secret"])
def test_endpoint_validation(url):
    with pytest.raises(ValidationError) as error:
        LLMSettings(_env_file=None, elm_base_url=url)
    assert "secret" not in str(error.value)


def test_loopback_development_only():
    LLMSettings(_env_file=None, elm_base_url="http://localhost:1234/v1")
    with pytest.raises(ValidationError):
        LLMSettings(_env_file=None, elm_base_url="http://localhost:1234/v1", app_env="production")


async def test_cancellation_and_cleanup():
    async def handle(request):
        raise asyncio.CancelledError()
    gateway = ELMGateway(settings(), transport=httpx.MockTransport(handle))
    with pytest.raises(asyncio.CancelledError):
        async with gateway:
            await gateway.generate_text(**REQUEST)
    assert gateway._client.is_closed()


async def test_app_lifespan_no_network_and_openapi():
    app = create_app(Settings(_env_file=None,
        database_url="postgresql://test:secret@example.invalid/postgres",
        supabase_url="https://example.supabase.co"))
    before = app.openapi()
    async with app.router.lifespan_context(app):
        assert app.state.llm_gateway._client is None
    assert app.state.llm_gateway._closed
    assert app.openapi() == before
    assert "/api/v1/me" in before["paths"]
    assert "/api/v1/reviews" in before["paths"]


def test_cli_precedence_and_output(monkeypatch, tmp_path, capsys):
    env = tmp_path / ".env"
    env.write_text('ELM_BASE_URL=https://file.test/api\nELM_API_KEY=file-secret\nELM_MODEL=file-model\n', encoding="utf-8")
    monkeypatch.setenv("ELM_MODEL_GENERATION", "environment-model")
    seen = []
    class FakeGateway:
        def __init__(self, config):
            seen.append(config)
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def generate_text(self, **kwargs):
            return "result"
    monkeypatch.setattr(cli, "ELMGateway", FakeGateway)
    assert cli.main(["--prompt", "hi", "--env-file", str(env)]) == 0
    assert seen[-1].elm_model_generation == "environment-model"
    assert cli.main(["--prompt", "hi", "--env-file", str(env), "--model", "cli-model"]) == 0
    assert seen[-1].elm_model_generation == "cli-model"
    assert seen[-1].elm_api_key.get_secret_value() == "file-secret"
    assert capsys.readouterr().out == "result\nresult\n"


def test_cli_file_and_json(monkeypatch, tmp_path, capsys):
    prompt = tmp_path / "prompt.txt"
    prompt.write_text("hello", encoding="utf-8")
    schema = tmp_path / "schema.json"
    schema.write_text('{"type":"object"}', encoding="utf-8")
    class FakeGateway:
        def __init__(self, config):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def generate_schema_json(self, **kwargs):
            assert kwargs["payload"] == {"prompt": "hello"}
            assert kwargs["schema"] == {"type": "object"}
            return {"answer": "ok"}
    monkeypatch.setattr(cli, "ELMGateway", FakeGateway)
    assert cli.main(["--prompt-file", str(prompt), "--json-schema", str(schema),
                     "--env-file", str(tmp_path / "missing")]) == 0
    assert json.loads(capsys.readouterr().out) == {"answer": "ok"}


def test_cli_errors(monkeypatch, tmp_path, capsys):
    args = ["--prompt", "hello", "--env-file", str(tmp_path / "missing")]
    assert cli.main(args) == 2
    assert capsys.readouterr().out == ""
    async def failure(_):
        raise LLMProviderError("LLM endpoint request failed")
    monkeypatch.setattr(cli, "run", failure)
    assert cli.main(args) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "LLM endpoint request failed" in captured.err


def test_cli_from_arbitrary_directory(tmp_path):
    import sys
    result = subprocess.run([sys.executable, str(SCRIPT), "--prompt", "hello", "--env-file",
        str(tmp_path / "missing")], cwd=tmp_path, capture_output=True, text=True)
    assert result.returncode == 2
    assert result.stdout == ""
    assert "Traceback" not in result.stderr
