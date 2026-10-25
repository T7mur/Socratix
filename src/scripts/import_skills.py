"""Import prepared, permitted PDF artifacts into the human review catalogue."""
import argparse
import asyncio
import json
import sys
from pathlib import Path
from uuid import UUID

from _common import configure_event_loop, settings, validate_target
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.db.repositories.skill_imports import SkillImportRepository
from app.db.session import create_database, dispose_database
from app.integrations.elm import ELMGateway, LLMError
from app.modules.skill_generation.import_artifacts import load_artifacts
from app.modules.skill_generation.importer import import_prepared, write_report
from pydantic import ValidationError as SchemaError
from sqlalchemy.exc import SQLAlchemyError


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    source = result.add_mutually_exclusive_group(required=True)
    source.add_argument("--artifacts", type=Path)
    source.add_argument("--report-run", type=UUID, help="Regenerate an existing report without model calls")
    result.add_argument("--section", action="append")
    result.add_argument("--actor-id", type=UUID, required=True)
    result.add_argument("--target", choices=["development", "test", "staging"], required=True)
    result.add_argument("--permission-ref")
    result.add_argument("--dry-run", action="store_true")
    return result


async def run(args):
    config = settings()
    validate_target(config, args.target)
    prepared = load_artifacts(args.artifacts, args.section) if args.artifacts else None
    if prepared and not (args.permission_ref or "").strip():
        raise ValidationError("A permission record reference is required")
    if config.migration_database_url:
        config.database_url = config.migration_database_url
    database = create_database(config)
    try:
        if args.report_run:
            async with database.sessions() as session, session.begin():
                repo = SkillImportRepository(session)
                await repo.require_admin(args.actor_id)
                report = await repo.report(args.report_run)
            code = 0
        else:
            async with ELMGateway(config) as gateway:
                report, code = await import_prepared(database, gateway, config, prepared, args.actor_id,
                                                    args.permission_ref, dry_run=args.dry_run)
        if "run_id" in report:
            report["report_path"] = str(write_report(report, Path("outputs/skill-imports")).resolve())
        print(json.dumps(report, ensure_ascii=False))
        return code
    finally:
        await dispose_database(database)


def main(argv=None):
    command = parser()
    args = command.parse_args(argv)
    if args.report_run and (args.section or args.permission_ref or args.dry_run):
        command.error("--report-run cannot be combined with import-only options")
    configure_event_loop()
    try:
        return asyncio.run(run(args))
    except (ConflictError, ForbiddenError, NotFoundError, ValidationError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except (SchemaError, ValueError):
        print("Invalid operator configuration or input.", file=sys.stderr)
        return 2
    except (LLMError, SQLAlchemyError, OSError):
        print("Import unavailable; check provider, database and output access.", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Import interrupted; repeat the command to resume.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
