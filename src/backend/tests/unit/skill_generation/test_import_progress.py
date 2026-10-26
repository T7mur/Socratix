import asyncio
import importlib
import io
import json
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.modules.skill_generation.importer import ImportProgress

ROOT = Path(__file__).resolve().parents[5]


@pytest.fixture
def cli(monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT / "src/scripts"))
    return importlib.import_module("import_skills")


def test_terminal_bar_elapsed_and_control_character_safety(cli):
    class Terminal(io.StringIO):
        def isatty(self):
            return True

    now = [0]
    stream = Terminal()
    display = cli.ImportProgressDisplay(stream=stream, clock=lambda: now[0])
    display.update(ImportProgress("Waiting for model", 2, 5, "AI-ML\x1b[31m\n", 3, 5, str(uuid4())))
    now[0] = 61
    display.refresh()
    display.finish()
    output = stream.getvalue()
    assert "[########------------] 2/5" in output
    assert "waiting 01:01" in output and "elapsed 01:01" in output
    assert "\x1b" not in output and output.endswith("\n")


def test_narrow_terminal_does_not_wrap_and_unchanged_watch_updates_are_quiet(cli, monkeypatch):
    module = importlib.import_module("_import_progress")
    monkeypatch.setattr(module.shutil, "get_terminal_size", lambda **kwargs: SimpleNamespace(columns=80))

    class Terminal(io.StringIO):
        def isatty(self):
            return True

    stream = Terminal()
    display = cli.ImportProgressDisplay(stream=stream)
    event = ImportProgress("Waiting for model", 29, 49, "AI-ML", 30, 49)
    display.update(event)
    first = stream.getvalue()
    display.update(event)
    assert stream.getvalue() == first
    assert len(first.lstrip("\r")) < 80 and "elapsed" in first and "Waiting for model" in first


async def test_display_cancels_heartbeat_and_tolerates_closed_stderr(cli):
    stream = io.StringIO()
    async with cli.ImportProgressDisplay(stream=stream) as display:
        display.update(ImportProgress("Checking database", 0, 5))
        await asyncio.sleep(0)
    assert display.task.done()
    stream.close()
    display = cli.ImportProgressDisplay(stream=stream)
    display.update(ImportProgress("Checking database"))
    assert not display.enabled


@pytest.mark.parametrize("quiet", [False, True])
async def test_cli_keeps_json_stdout_separate_from_progress(cli, monkeypatch, capsys, quiet):
    config = SimpleNamespace(migration_database_url=None)
    monkeypatch.setattr(cli, "settings", lambda: config)
    monkeypatch.setattr(cli, "validate_target", lambda *args: None)
    monkeypatch.setattr(cli, "load_artifacts", lambda *args: object())
    monkeypatch.setattr(cli, "create_database", lambda *args: object())
    disposed = []

    async def dispose(database):
        disposed.append(database)

    monkeypatch.setattr(cli, "dispose_database", dispose)

    class Gateway:
        def __init__(self, config):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

    async def run_import(*args, **kwargs):
        kwargs["progress"](ImportProgress("Waiting for model", 1, 2, "AI-Demo", 2, 2))
        return {"status": "succeeded"}, 0

    monkeypatch.setattr(cli, "ELMGateway", Gateway)
    monkeypatch.setattr(cli, "import_prepared", run_import)
    args = SimpleNamespace(no_progress=quiet, target="development", artifacts=Path("synthetic"),
                           section=None, permission_ref="permission:synthetic", actor_id=uuid4(),
                           watch_run=None, report_run=None, dry_run=False)
    args.from_run, args.resolutions = None, None
    assert await cli.run(args) == 0
    output = capsys.readouterr()
    assert json.loads(output.out) == {"status": "succeeded"}
    assert ("Waiting for model" in output.err) is (not quiet)
    assert len(disposed) == 1


@pytest.fixture
def watch_boundary(cli, monkeypatch):
    actor, run_id = uuid4(), uuid4()
    state = SimpleNamespace(active=0, polls=0, latest=0, statuses=["running", "running", "succeeded"])

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        @asynccontextmanager
        async def begin(self):
            state.active += 1
            try:
                yield
            finally:
                state.active -= 1

    class Repo:
        def __init__(self, session):
            pass

        async def require_admin(self, supplied):
            assert supplied == actor

        async def latest_run(self, supplied):
            state.latest += 1
            return run_id

        async def report(self, supplied):
            assert supplied == run_id
            status = state.statuses[min(state.polls, len(state.statuses) - 1)]
            state.polls += 1
            return {"run_id": str(run_id), "status": status, "chunks": [
                {"section": "AI-Demo", "status": status, "checkpointed": status == "succeeded"}]}

    monkeypatch.setattr(cli, "SkillImportRepository", Repo)
    return SimpleNamespace(sessions=Session), actor, state


async def test_watcher_tracks_existing_run_without_transactions_between_polls(cli, watch_boundary, monkeypatch):
    database, actor, state = watch_boundary
    delays = []

    async def sleep(seconds):
        assert state.active == 0
        delays.append(seconds)

    monkeypatch.setattr(cli.asyncio, "sleep", sleep)
    events = []
    report, code = await cli.watch_run(database, actor, "latest", events.append)
    assert code == 0 and report["status"] == "succeeded"
    assert delays == [2, 2] and state.latest == 1
    assert events[0].completed == 0 and events[-1].completed == 1
    assert events[0].run_id == events[-1].run_id


@pytest.mark.parametrize(("status", "code"), [("failed", 1), ("review_required", 2)])
async def test_watcher_does_not_report_failure_as_complete(cli, watch_boundary, status, code):
    database, actor, state = watch_boundary
    state.statuses = [status]
    events = []
    _, actual = await cli.watch_run(database, actor, "latest", events.append)
    assert actual == code and events[-1].completed == 0
    assert events[-1].phase == f"Import {status}"


async def test_watcher_cancellation_does_not_modify_import(cli, watch_boundary, monkeypatch):
    database, actor, state = watch_boundary
    state.statuses = ["running"]
    sleeping = asyncio.Event()

    async def sleep(seconds):
        assert state.active == 0
        sleeping.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(cli.asyncio, "sleep", sleep)
    task = asyncio.create_task(cli.watch_run(database, actor, "latest", lambda event: None))
    await sleeping.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert state.active == 0 and state.statuses == ["running"] and state.polls == 1


def test_watch_argument_validation(cli):
    actor = str(uuid4())
    args = cli.parser().parse_args(["--watch-run", "latest", "--actor-id", actor, "--target", "development"])
    assert args.watch_run == "latest"
    with pytest.raises(SystemExit):
        cli.parser().parse_args(["--watch-run", "invalid", "--actor-id", actor, "--target", "development"])
