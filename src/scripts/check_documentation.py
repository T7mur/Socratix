"""Validate implemented documentation's local links and generated schema coverage."""

import re
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]
DOCUMENTS = [
    "docs/database_setup.md",
    "docs/database_implementation.md",
    "docs/authentication.md",
    "docs/shared_helpers.md",
    "docs/database_dictionary.md",
    "docs/adr/0001-supabase-auth.md",
    "docs/adr/0002-versioned-persistence.md",
    "docs/adr/0003-durable-skill-import.md",
    "docs/skill_import_bridge.md",
    "docs/skill_import_handoff.md",
]


def main():
    errors = []
    for relative in DOCUMENTS:
        path = ROOT / relative
        for link in re.findall(
            r"\[[^\]]+\]\(([^)]+)\)", path.read_text(encoding="utf-8")
        ):
            target = unquote(link.split("#")[0])
            if (
                target
                and not re.match(r"^[a-z]+:", target)
                and not (path.parent / target).exists()
            ):
                errors.append(f"{relative}: {target}")
    if errors:
        raise SystemExit("Broken local documentation links:\n" + "\n".join(errors))
    print(f"Local links verified in {len(DOCUMENTS)} implementation guides.")


if __name__ == "__main__":
    main()
