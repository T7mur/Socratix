"""Create/upgrade the private application schema through Alembic. Never drop a database."""

import argparse

from _common import alembic_config, settings, validate_target
from alembic import command


def upgrade_schema(target: str) -> None:
    config = settings()
    validate_target(config, target)
    command.upgrade(alembic_config(), "head")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--target", required=True, choices=["development", "test", "staging"]
    )
    args = parser.parse_args()
    upgrade_schema(args.target)
    print(
        "Schema upgraded to Alembic head. Supabase-managed schemas were not modified."
    )


if __name__ == "__main__":
    main()
