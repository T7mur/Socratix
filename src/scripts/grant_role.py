"""Audited role provisioning using operator credentials, never a public signup input."""

import argparse
import asyncio
from uuid import UUID

from _common import settings, validate_target
from app.contracts.enums import Role
from app.db.repositories.users import UserRepository
from app.db.session import create_database, dispose_database, transaction


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--target", required=True, choices=["development", "test", "staging"]
    )
    parser.add_argument("--user-id", required=True, type=UUID)
    parser.add_argument("--actor-id", required=True, type=UUID)
    parser.add_argument("--role", required=True, choices=[item.value for item in Role])
    parser.add_argument("--reason", required=True)
    args = parser.parse_args()
    config = settings()
    validate_target(config, args.target)
    if config.migration_database_url is None:
        raise ValueError(
            "Role provisioning requires MIGRATION_DATABASE_URL operator credentials"
        )
    config.database_url = config.migration_database_url
    database = create_database(config)
    try:
        async with database.sessions() as session, transaction(session):
            await UserRepository(session).set_user_role(
                args.user_id, Role(args.role), args.actor_id, args.reason
            )
        print("Role updated with an append-only audit event.")
    finally:
        await dispose_database(database)


if __name__ == "__main__":
    asyncio.run(main())
