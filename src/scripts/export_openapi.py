"""Export the API without loading credentials or connecting to external services."""

import json
from pathlib import Path

from app.main import create_app


def main():
    target = Path(__file__).resolve().parents[1] / "shared/openapi/openapi.json"
    target.write_text(
        json.dumps(create_app().openapi(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print("OpenAPI exported. Run npm run generate:types in src/frontend.")


if __name__ == "__main__":
    main()
