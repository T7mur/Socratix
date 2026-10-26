"""Import prepared, permitted PDF artifacts into the human review catalogue."""
import argparse
import asyncio
import json
import sys
from pathlib import Path
from uuid import UUID

from _common import configure_event_loop, settings, validate_target
from _import_progress import ImportProgressDisplay, progress_from_report
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.db.repositories.skill_imports import SkillImportRepository
from app.db.session import create_database, dispose_database
from app.integrations.elm import ELMGateway, LLMError
from app.modules.skill_generation.import_artifacts import load_artifacts
from app.modules.skill_generation.importer import ImportProgress, import_prepared, preflight, write_report
from app.modules.skill_generation.recovery import (
    make_recovery_review,
    resolve_recovery_review,
    write_recovery_review,
)
from pydantic import ValidationError as SchemaError
from sqlalchemy.exc import SQLAlchemyError


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    source = result.add_mutually_exclusive_group(required=True)
    source.add_argument("--artifacts", type=Path)
    source.add_argument("--report-run", type=UUID, help="Regenerate an existing report without model calls")
    source.add_argument("--watch-run", type=run_selector, metavar="UUID|latest",
                        help="Monitor an existing run without model calls or database writes")
    result.add_argument("--section", action="append")
    result.add_argument("--actor-id", type=UUID, required=True)
    result.add_argument("--target", choices=["development", "test", "staging"], required=True)
    result.add_argument("--permission-ref")
    result.add_argument("--dry-run", action="store_true")
    result.add_argument("--no-progress", action="store_true", help="Suppress progress on stderr")
    result.add_argument("--from-run", type=UUID, help="Recover saved batches without any model calls")
    result.add_argument("--resolutions", type=Path, help="Reviewed JSON choices for --from-run")
    return result


def run_selector(value):
    if value == "latest":
        return value
    try:
        return UUID(value)
    except ValueError:
        raise argparse.ArgumentTypeError("Use a run UUID or latest") from None


async def run(args):
    async with ImportProgressDisplay(enabled=not args.no_progress) as display:
        display.update(ImportProgress("Loading settings"))
        return await run_with_progress(args, display)


async def watch_run(database, actor_id, run_id, progress, *, poll_seconds=2):
    """Read-only polling; cancellation stops the watcher, never the original import."""
    while True:
        async with database.sessions() as session, session.begin():
            repo = SkillImportRepository(session)
            await repo.require_admin(actor_id)
            if run_id == "latest":
                run_id = await repo.latest_run(actor_id)
            report = await repo.report(run_id)
        progress(progress_from_report(report))
        if report["status"] not in {"queued", "running"}:
            status = report["status"]
            return report, 1 if status == "failed" else 2 if status == "review_required" else 0
        await asyncio.sleep(poll_seconds)


async def run_with_progress(args, display):
    config = settings()
    validate_target(config, args.target)
    display.update(ImportProgress("Checking PDF artifacts" if args.artifacts else "Reading import status"))
    prepared = load_artifacts(args.artifacts, args.section) if args.artifacts else None
    if prepared and not (args.permission_ref or "").strip():
        raise ValidationError("A permission record reference is required")
    if config.migration_database_url:
        config.database_url = config.migration_database_url
    database = create_database(config)
    try:
        recovery = None
        if args.from_run:
            display.update(ImportProgress("Reading saved responses; model requests disabled"))
            await preflight(database, args.actor_id, prepared)
            async with database.sessions() as session, session.begin():
                repo = SkillImportRepository(session)
                snapshot = await repo.recovery_snapshot(args.from_run, args.actor_id, prepared)
                approved = await repo.validation_graph()
            if args.resolutions is None:
                review = make_recovery_review(prepared, snapshot, approved)
                path = write_recovery_review(review, Path("outputs/skill-import-recovery"))
                report = {"status": "review_required", "source_run_id": str(args.from_run),
                          "conflicting_ids": len(review["conflicts"]),
                          "chunks_needing_decisions": len(review["chunk_actions"]),
                          "review_file": str(path.resolve()), "comparison_file": str(path.with_suffix(".md").resolve()),
                          "model_calls": 0}
                display.finish()
                print(json.dumps(report))
                return 2
            review = json.loads(args.resolutions.read_text(encoding="utf-8"))
            display.update(ImportProgress("Validating reviewed recovery choices; model requests disabled"))
            recovery = resolve_recovery_review(prepared, snapshot, approved, review)
        if args.watch_run:
            report, code = await watch_run(database, args.actor_id, args.watch_run, display.update)
        elif args.report_run:
            async with database.sessions() as session, session.begin():
                repo = SkillImportRepository(session)
                await repo.require_admin(args.actor_id)
                report = await repo.report(args.report_run)
            code = 0
        else:
            if recovery is not None:
                report, code = await import_prepared(database, None, config, prepared, args.actor_id,
                    args.permission_ref, dry_run=args.dry_run, progress=display.update, recovery=recovery)
            else:
                async with ELMGateway(config) as gateway:
                    report, code = await import_prepared(database, gateway, config, prepared, args.actor_id,
                        args.permission_ref, dry_run=args.dry_run, progress=display.update)
        if "run_id" in report:
            report["report_path"] = str(write_report(report, Path("outputs/skill-imports")).resolve())
        display.finish()
        print(json.dumps(report, ensure_ascii=False))
        return code
    finally:
        await dispose_database(database)


def main(argv=None):
    command = parser()
    args = command.parse_args(argv)
    if (args.report_run or args.watch_run) and (args.section or args.permission_ref or args.dry_run):
        command.error("--report-run/--watch-run cannot be combined with import-only options")
    if (args.from_run or args.resolutions) and not args.artifacts:
        command.error("Recovery requires --artifacts")
    if args.resolutions and not args.from_run:
        command.error("--resolutions requires --from-run")
    if args.from_run and args.dry_run and not args.resolutions:
        command.error("Prepare the recovery review file first, then use --resolutions with --dry-run")
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
        print("Watching stopped; the original import was not stopped." if args.watch_run else
              "Import interrupted; repeat the command to resume.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
