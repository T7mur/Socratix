"""Send an operator request without starting FastAPI or configuring a database."""
import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src" / "backend"))

from pydantic import ValidationError  # noqa: E402

from app.core.llm_config import LLMSettings  # noqa: E402
from app.integrations.elm import ELMGateway, LLMConfigurationError, LLMError  # noqa: E402


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    source = result.add_mutually_exclusive_group(required=True)
    source.add_argument("--prompt")
    source.add_argument("--prompt-file", type=Path)
    result.add_argument("--system", default="You are a helpful assistant.")
    result.add_argument("--base-url")
    result.add_argument("--model")
    result.add_argument("--timeout", type=float)
    result.add_argument("--env-file", type=Path, default=ROOT / ".env")
    result.add_argument("--json-schema", type=Path)
    return result


async def run(args) -> str:
    overrides = {name: value for name, value in {
        "elm_base_url": args.base_url,
        "elm_model_generation": args.model,
        "elm_timeout_seconds": args.timeout,
    }.items() if value is not None}
    settings = LLMSettings(_env_file=args.env_file, **overrides)
    prompt = args.prompt_file.read_text(encoding="utf-8") if args.prompt_file else args.prompt
    if not prompt.strip():
        raise LLMConfigurationError("Prompt must not be empty")
    schema = None
    if args.json_schema:
        schema = json.loads(args.json_schema.read_text(encoding="utf-8"))
        if not isinstance(schema, dict):
            raise LLMConfigurationError("JSON Schema must be an object")
    async with ELMGateway(settings) as gateway:
        request = dict(operation="operator_request_v1", model_alias="generation",
                       system_prompt=args.system, payload={"prompt": prompt})
        if schema is not None:
            value = await gateway.generate_schema_json(**request, schema=schema)
            return json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False)
        return await gateway.generate_text(**request)


def main(argv=None) -> int:
    args = parser().parse_args(argv)
    try:
        output = asyncio.run(run(args))
        print(output)
        return 0
    except (ValidationError, OSError, ValueError, LLMConfigurationError):
        print("Invalid LLM configuration, prompt file or JSON Schema.", file=sys.stderr)
        return 2
    except LLMError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Request cancelled.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())

