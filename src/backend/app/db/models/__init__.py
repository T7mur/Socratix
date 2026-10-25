"""Import every ORM table for Alembic metadata; no runtime database I/O."""

from app.db.models import activities, curriculum, evidence, identity, jobs, planning, selection, skill_imports

__all__ = ["activities", "curriculum", "evidence", "identity", "jobs", "planning", "selection", "skill_imports"]
