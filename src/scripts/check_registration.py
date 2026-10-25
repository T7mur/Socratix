"""Read-only check of email confirmation and the matching student application profile."""
import argparse
import asyncio
import json

from _common import configure_event_loop, settings, validate_target
from app.db.session import create_database, dispose_database
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError


async def run(args):
    config = settings()
    validate_target(config, args.target)
    if config.migration_database_url:
        config.database_url = config.migration_database_url
    database = create_database(config)
    try:
        async with database.engine.connect() as connection:
            auth = (await connection.execute(text(
                "SELECT id, email_confirmed_at IS NOT NULL AS confirmed FROM auth.users "
                "WHERE lower(email) = lower(:email)"
            ), {"email": args.email})).mappings().all()
            profiles = (await connection.execute(text(
                "SELECT id, role, is_active FROM socratix.users WHERE lower(email) = lower(:email)"
            ), {"email": args.email})).mappings().all()
            print(json.dumps({"auth_account_count": len(auth), "email_confirmed": bool(auth and auth[0]["confirmed"]),
                "application_profile_count": len(profiles),
                "matching_uuid": len(auth) == len(profiles) == 1 and auth[0]["id"] == profiles[0]["id"],
                "role": profiles[0]["role"] if len(profiles) == 1 else None,
                "active": profiles[0]["is_active"] if len(profiles) == 1 else None}))
    except SQLAlchemyError:
        print(json.dumps({"error": "read_only_registration_check_unavailable"}))
        return 1
    finally:
        await dispose_database(database)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--target", choices=["development", "test", "staging"], required=True)
    configure_event_loop()
    raise SystemExit(asyncio.run(run(parser.parse_args())))
