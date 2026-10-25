"""Development-only generator for the INITIAL schema. Never rerun on deployed revisions.

Creates explicit, frozen Alembic operations; deployed migrations do not import current models.
"""

from pathlib import Path

from alembic.autogenerate import render_python_code
from alembic.migration import MigrationContext
from alembic.operations import ops

from app.db import models  # noqa: F401
from app.db.base import Base

GROUPS = [
    (
        "identity_sources",
        {
            "users",
            "user_role_events",
            "courses",
            "course_enrolments",
            "curriculum_sources",
            "source_spans",
            "skills",
            "skill_relations",
        },
    ),
    (
        "catalogue",
        {
            "learning_outcomes",
            "skill_aliases",
            "course_skills",
            "catalogue_revisions",
            "graph_versions",
            "graph_members",
            "review_decisions",
        },
    ),
    (
        "activities_plans",
        {
            "student_plans",
            "plan_skill_tags",
            "activities",
            "activity_skills",
            "activity_outcomes",
            "projects",
            "project_milestones",
            "project_milestone_dependencies",
            "grading_artifacts",
        },
    ),
    ("processing", {"generation_jobs", "submissions", "evaluations", "hint_events", "outbox_messages"}),
    (
        "learning_history",
        {
            "assessment_events",
            "skill_estimates",
            "gap_hypotheses",
            "gap_hypothesis_evidence",
            "gap_hypothesis_history",
            "reassessment_schedules",
            "reflections",
            "reflection_skill_tags",
            "selector_decisions",
        },
    ),
]


def main():
    folder = Path(__file__).resolve().parents[1] / "migrations" / "versions"
    if list(folder.glob("*.py")):
        raise SystemExit("Initial revisions already exist. Create a NEW revision instead.")
    ctx = MigrationContext.configure(dialect_name="postgresql")
    for number, (name, names) in enumerate(GROUPS, 1):
        tables = [table for table in Base.metadata.sorted_tables if table.name in names]
        operations = []
        for table in tables:
            operations.append(ops.CreateTableOp.from_table(table))
            operations.extend(
                ops.CreateIndexOp.from_index(index)
                for index in sorted(table.indexes, key=lambda item: item.name)
            )
        upgrade = render_python_code(ops.UpgradeOps(operations), migration_context=ctx)
        downgrade = render_python_code(
            ops.DowngradeOps([ops.DropTableOp.from_table(table) for table in reversed(tables)]),
            migration_context=ctx,
        )
        previous = repr(f"{number - 1:04d}") if number > 1 else "None"
        header = f'"""{name}: frozen initial schema, pending Member F review."""\nfrom alembic import op\nimport sqlalchemy as sa\nfrom sqlalchemy.dialects import postgresql\n\nrevision = "{number:04d}"\ndown_revision = {previous}\nbranch_labels = None\ndepends_on = None\n'
        if number == 5:
            sql = (folder.parent / "guards_v1.sql").read_text(encoding="utf-8")
            header += "\nGUARDS_SQL = " + repr(sql) + "\n"
            upgrade += "\n    op.execute(GUARDS_SQL)\n"
            functions = [
                "reject_history_mutation",
                "guard_revision",
                "require_review_audit",
                "validate_review_actor",
                "guard_frozen_activity",
                "guard_activity_child",
                "artifact_requires_frozen_spec",
            ]
            downgrade = (
                "\n".join(
                    f'    op.execute("DROP FUNCTION IF EXISTS socratix.{fn}() CASCADE")' for fn in functions
                )
                + "\n"
                + downgrade
            )
        (folder / f"{number:04d}_{name}.py").write_text(
            header
            + "\ndef upgrade():\n"
            + upgrade
            + '\n    op.execute("REVOKE ALL ON SCHEMA socratix FROM PUBLIC")\n\ndef downgrade():\n'
            + downgrade
            + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
