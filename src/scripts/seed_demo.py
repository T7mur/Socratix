"""Idempotently seed synthetic pending candidates; never approve a generated curriculum."""

import argparse
import asyncio
import json
from uuid import UUID

from _common import ROOT, configure_event_loop, settings, validate_target
from app.contracts.enums import ResourceType
from app.db.models.curriculum import CatalogueRevision, CurriculumSource
from app.db.repositories.catalogue import CatalogueRepository, lock_catalogue
from app.db.repositories.common import checksum
from app.db.repositories.users import UserRepository
from app.db.session import create_database, dispose_database, transaction
from sqlalchemy import select

DEMO_USER = UUID("00000000-0000-4000-8000-000000000001")
DEMO_SOURCE = UUID("00000000-0000-4000-8000-000000000010")


async def seed(session):
    data = json.loads(
        (ROOT / "src/shared/fixtures/catalogue_candidates.json").read_text(
            encoding="utf-8"
        )
    )
    await UserRepository(session).ensure_student_profile(
        DEMO_USER, "synthetic@example.invalid", "Synthetic fixture author"
    )
    await lock_catalogue(session)
    if await session.get(CurriculumSource, DEMO_SOURCE) is None:
        session.add(
            CurriculumSource(
                id=DEMO_SOURCE, **data["source"], checksum=checksum(data["source"])
            )
        )
        await session.flush()
    repo = CatalogueRepository(session)
    for item in data["candidates"]:
        exists = await session.scalar(
            select(CatalogueRevision.resource_id)
            .where(
                CatalogueRevision.resource_type == item["resource_type"],
                CatalogueRevision.resource_id == item["resource_id"],
            )
            .limit(1)
        )
        if exists is None:
            await repo.create_candidate_revision(
                ResourceType(item["resource_type"]),
                item["resource_id"],
                item["payload"],
                DEMO_SOURCE,
                DEMO_USER,
            )


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--target", required=True, choices=["development", "test", "staging"]
    )
    args = parser.parse_args()
    config = settings()
    validate_target(config, args.target)
    if config.migration_database_url:
        config.database_url = config.migration_database_url
    database = create_database(config)
    try:
        async with database.sessions() as session, transaction(session):
            await seed(session)
        print(
            "Synthetic pending candidates seeded. No Supabase Auth accounts or approvals were created."
        )
    finally:
        await dispose_database(database)


if __name__ == "__main__":
    configure_event_loop()
    asyncio.run(main())
