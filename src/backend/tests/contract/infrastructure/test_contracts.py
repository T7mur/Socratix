import json
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from app.contracts.reviews import ReviewDecisionCreate
from app.db import models  # noqa: F401
from app.db.base import Base
from app.main import create_app

ROOT = Path(__file__).resolve().parents[5]


def test_openapi_matches_generated_snapshot():
    snapshot = json.loads((ROOT / "src/shared/openapi/openapi.json").read_text(encoding="utf-8"))
    assert create_app().openapi() == snapshot


def test_decision_contract_is_canonical():
    decision = ReviewDecisionCreate(resource_version=1, decision="approved", reason="Source verified")
    assert decision.model_dump() == {
        "contract_version": "1.0",
        "resource_version": 1,
        "decision": "approved",
        "reason": "Source verified",
    }
    with pytest.raises(ValidationError):
        ReviewDecisionCreate(resource_version=0, decision="approved", reason=" ")


def test_schema_is_private_and_postgres_ddl_compiles():
    assert len(Base.metadata.tables) == 38
    for table in Base.metadata.sorted_tables:
        assert table.schema == "socratix"
        assert "CREATE TABLE socratix." in str(CreateTable(table).compile(dialect=postgresql.dialect()))
        names = [constraint.name for constraint in table.constraints if constraint.name]
        assert len(names) == len(set(names)), f"Duplicate constraint names in {table.name}"


def test_migrations_are_frozen_and_guards_are_embedded():
    import ast

    folder = ROOT / "src/backend/migrations"
    revisions = list((folder / "versions").glob("*.py"))
    assert len(revisions) == 5
    for revision in revisions:
        content = revision.read_text(encoding="utf-8")
        assert "create_all" not in content and "from app" not in content
        tree = ast.parse(content)
        if revision.name.startswith("0005"):
            guards = next(
                node.value.value
                for node in tree.body
                if isinstance(node, ast.Assign)
                and any(isinstance(target, ast.Name) and target.id == "GUARDS_SQL" for target in node.targets)
            )
            assert guards == (folder / "guards_v1.sql").read_text(encoding="utf-8")
