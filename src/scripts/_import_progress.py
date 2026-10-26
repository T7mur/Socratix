"""Operator-only progress on stderr; no provider payloads or additional dependencies."""
import asyncio
import shutil
import sys
import time
from contextlib import suppress

from app.modules.skill_generation.importer import ImportProgress


class ImportProgressDisplay:
    def __init__(self, *, enabled=True, stream=None, clock=time.monotonic):
        self.enabled = enabled
        self.stream = stream if stream is not None else sys.stderr
        self.clock = clock
        self.started = clock()
        self.phase_started = self.started
        self.last_output = self.started
        self.event = None
        self.run_id = None
        self.width = 0
        self.task = None
        try:
            self.terminal = bool(getattr(self.stream, "isatty", lambda: False)())
        except (OSError, ValueError):
            self.terminal = False
            self.enabled = False

    async def __aenter__(self):
        if self.enabled:
            self.task = asyncio.create_task(self._heartbeat())
        return self

    async def __aexit__(self, *args):
        if self.task is not None:
            self.task.cancel()
            with suppress(asyncio.CancelledError):
                await self.task
        self.finish()

    def _write(self, value):
        try:
            self.stream.write(value)
            self.stream.flush()
        except (OSError, ValueError):
            # A closed stderr must not abort a paid request or a database checkpoint.
            self.enabled = False

    def update(self, event: ImportProgress):
        changed = event != self.event
        if changed:
            self.phase_started = self.clock()
        self.event = event
        if not self.enabled:
            return
        if event.run_id and event.run_id != self.run_id:
            self._write(("\n" if self.width else "") + f"Run: {event.run_id} (counts are checkpointed chunks)\n")
            self.width = 0
            self.run_id = event.run_id
        if changed:
            self.refresh()

    @staticmethod
    def _duration(seconds):
        seconds = max(0, int(seconds))
        minutes, seconds = divmod(seconds, 60)
        hours, minutes = divmod(minutes, 60)
        return f"{hours:02}:{minutes:02}:{seconds:02}" if hours else f"{minutes:02}:{seconds:02}"

    def refresh(self):
        if not self.enabled or self.event is None:
            return
        now = self.clock()
        event = self.event
        columns = max(20, shutil.get_terminal_size(fallback=(160, 24)).columns)
        bar_width = 12 if self.terminal and columns < 120 else 20
        filled = min(bar_width, int(bar_width * event.completed / event.total)) if event.total else 0
        bar = "[" + "#" * filled + "-" * (bar_width - filled) + "]"
        line = f"{bar} {event.completed}/{event.total} checkpointed | {event.phase}"
        unit = ""
        if event.unit:
            unit = event.unit
            if event.chunk_index:
                unit += f" {event.chunk_index}/{event.unit_total}"
            line += f" | {unit}"
        line += f" | elapsed {self._duration(now - self.started)}"
        if self.terminal:
            line = (f"{bar} {event.completed}/{event.total} | elapsed {self._duration(now - self.started)}"
                    + (f" | {unit}" if unit else "") + f" | {event.phase}")
        if event.phase == "Waiting for model":
            line += f" (waiting {self._duration(now - self.phase_started)})"
        # Section codes are source data; never allow control sequences in the terminal.
        line = "".join(character for character in line if character.isprintable())
        if self.terminal:
            line = line[:columns - 1]
            self._write("\r" + line + " " * max(0, self.width - len(line)))
            self.width = len(line)
        else:
            self._write(line + "\n")
        self.last_output = now

    async def _heartbeat(self):
        while self.enabled:
            await asyncio.sleep(1)
            if self.terminal or self.clock() - self.last_output >= 15:
                self.refresh()

    def finish(self):
        if self.enabled and self.width:
            self._write("\n")
        self.enabled = False


def progress_from_report(report: dict) -> ImportProgress:
    """Coarse live status from persisted checkpoints, including runs started by older code."""
    chunks = report["chunks"]
    complete = sum(bool(chunk["checkpointed"]) for chunk in chunks)
    active = next((c for c in chunks if c["status"] == "running" and not c["checkpointed"]), None)
    status = report["status"]
    if status in {"queued", "running"}:
        phase = "Waiting for model / processing chunk" if active else "Processing / validating unit"
    else:
        phase = f"Import {status}"
    unit = active["section"] if active else None
    unit_chunks = [c for c in chunks if c["section"] == unit] if unit else []
    return ImportProgress(phase, complete, len(chunks), unit,
                          sum(bool(c["checkpointed"]) for c in unit_chunks) + 1 if active else 0,
                          len(unit_chunks), report["run_id"])
