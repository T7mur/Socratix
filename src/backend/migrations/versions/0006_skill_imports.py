"""PROPOSED private skill-import ledger. Member F/A review required before deployment."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("skill_import_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("fingerprint", sa.String(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("permission_ref", sa.Text(), nullable=False),
        sa.Column("configuration", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("summary", postgresql.JSONB(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_skill_import_runs"),
        sa.UniqueConstraint("fingerprint", name="uq_skill_import_runs_fingerprint"),
        sa.ForeignKeyConstraint(["source_id"], ["socratix.curriculum_sources.id"],
                                name="fk_skill_import_runs_source_id_curriculum_sources"),
        sa.ForeignKeyConstraint(["actor_id"], ["socratix.users.id"], name="fk_skill_import_runs_actor_id_users"),
        sa.CheckConstraint("status IN ('queued','running','succeeded','failed','review_required')",
                           name="ck_skill_import_runs_status_values"), schema="socratix")
    op.create_table("skill_import_chunks",
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("chunk_id", sa.Uuid(), nullable=False),
        sa.Column("section_code", sa.String(), nullable=False),
        sa.Column("request_digest", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("result", postgresql.JSONB(), nullable=True),
        sa.Column("error_code", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("run_id", "chunk_id", name="pk_skill_import_chunks"),
        sa.ForeignKeyConstraint(["run_id"], ["socratix.skill_import_runs.id"],
                                name="fk_skill_import_chunks_run_id_skill_import_runs"),
        sa.CheckConstraint("status <> 'succeeded' OR result IS NOT NULL",
                           name="ck_skill_import_chunks_completed_result"),
        sa.CheckConstraint("status IN ('queued','running','succeeded','failed','review_required')",
                           name="ck_skill_import_chunks_status_values"), schema="socratix")
    op.create_table("skill_candidate_evidence",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("chunk_id", sa.Uuid(), nullable=False),
        sa.Column("resource_type", sa.String(), nullable=False),
        sa.Column("resource_id", sa.String(), nullable=False),
        sa.Column("resource_version", sa.Integer(), nullable=False),
        sa.Column("span_id", sa.Uuid(), nullable=False),
        sa.Column("evidence_kind", sa.String(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_skill_candidate_evidence"),
        sa.UniqueConstraint("run_id", "chunk_id", "resource_type", "resource_id", "resource_version", "span_id",
            name=op.f("uq_skill_candidate_evidence_run_id_chunk_id_resource_type_resource_id_resource_version_span_id")),
        sa.ForeignKeyConstraint(["span_id"], ["socratix.source_spans.id"],
                                name="fk_skill_candidate_evidence_span_id_source_spans"),
        sa.ForeignKeyConstraint(["run_id", "chunk_id"],
            ["socratix.skill_import_chunks.run_id", "socratix.skill_import_chunks.chunk_id"],
            name="fk_skill_candidate_evidence_run_id_chunk_id_skill_import_chunks"),
        sa.ForeignKeyConstraint(["resource_type", "resource_id", "resource_version"],
            ["socratix.catalogue_revisions.resource_type", "socratix.catalogue_revisions.resource_id",
             "socratix.catalogue_revisions.resource_version"],
            name=op.f("fk_skill_candidate_evidence_resource_type_resource_id_resource_version_catalogue_revisions")),
        sa.CheckConstraint("resource_type IN ('skill','relation','outcome')",
                           name="ck_skill_candidate_evidence_resource_type_values"),
        sa.CheckConstraint("evidence_kind IN ('direct_source','ai_inferred')",
                           name="ck_skill_candidate_evidence_evidence_kind_values"),
        sa.CheckConstraint("resource_version >= 1", name="ck_skill_candidate_evidence_positive_version"),
        schema="socratix")
    op.execute(GUARDS_SQL)


GUARDS_SQL = """
CREATE FUNCTION socratix.guard_skill_import_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'import audit cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME = 'skill_import_runs' THEN
    IF (NEW.id, NEW.fingerprint, NEW.source_id, NEW.actor_id, NEW.permission_ref, NEW.configuration, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.fingerprint, OLD.source_id, OLD.actor_id, OLD.permission_ref, OLD.configuration, OLD.created_at)
    THEN RAISE EXCEPTION 'import identity is immutable' USING ERRCODE='23514'; END IF;
  ELSE
    IF (NEW.run_id, NEW.chunk_id, NEW.section_code, NEW.request_digest, NEW.created_at)
       IS DISTINCT FROM (OLD.run_id, OLD.chunk_id, OLD.section_code, OLD.request_digest, OLD.created_at)
       OR (OLD.status = 'succeeded' AND (NEW.status, NEW.result) IS DISTINCT FROM (OLD.status, OLD.result))
    THEN RAISE EXCEPTION 'import checkpoint is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_import_run BEFORE UPDATE OR DELETE ON socratix.skill_import_runs
 FOR EACH ROW EXECUTE FUNCTION socratix.guard_skill_import_identity();
CREATE TRIGGER immutable_import_chunk BEFORE UPDATE OR DELETE ON socratix.skill_import_chunks
 FOR EACH ROW EXECUTE FUNCTION socratix.guard_skill_import_identity();
CREATE TRIGGER immutable_import_evidence BEFORE UPDATE OR DELETE ON socratix.skill_candidate_evidence
 FOR EACH ROW EXECUTE FUNCTION socratix.reject_history_mutation();
CREATE FUNCTION socratix.guard_imported_source_span() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW IS DISTINCT FROM OLD AND EXISTS (
   SELECT 1 FROM socratix.skill_candidate_evidence WHERE span_id = OLD.id
 ) THEN RAISE EXCEPTION 'imported source evidence is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_imported_span BEFORE UPDATE ON socratix.source_spans
 FOR EACH ROW EXECUTE FUNCTION socratix.guard_imported_source_span();
REVOKE ALL ON socratix.skill_import_runs, socratix.skill_import_chunks, socratix.skill_candidate_evidence FROM PUBLIC;
REVOKE ALL ON FUNCTION socratix.guard_skill_import_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION socratix.guard_imported_source_span() FROM PUBLIC;
DO $$ DECLARE browser_role text; BEGIN
 FOREACH browser_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
   EXECUTE format('REVOKE ALL ON socratix.skill_import_runs, socratix.skill_import_chunks, socratix.skill_candidate_evidence FROM %I', browser_role);
  END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='socratix_api') THEN
  GRANT SELECT ON socratix.skill_import_chunks, socratix.skill_candidate_evidence TO socratix_api;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='socratix_worker') THEN
  GRANT SELECT, INSERT, UPDATE ON socratix.skill_import_runs, socratix.skill_import_chunks TO socratix_worker;
  GRANT SELECT, INSERT ON socratix.skill_candidate_evidence TO socratix_worker;
 END IF;
END $$;
"""


def downgrade():
    op.execute("DROP TRIGGER immutable_imported_span ON socratix.source_spans")
    op.execute("DROP FUNCTION socratix.guard_imported_source_span()")
    op.drop_table("skill_candidate_evidence", schema="socratix")
    op.drop_table("skill_import_chunks", schema="socratix")
    op.drop_table("skill_import_runs", schema="socratix")
    op.execute("DROP FUNCTION socratix.guard_skill_import_identity()")
