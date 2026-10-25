"""learning_history: frozen initial schema, pending Member F review."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

GUARDS_SQL = "-- Frozen v1 guards. Embedded into revision 0005 by the initial schema generator.\nCREATE FUNCTION socratix.reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$\nBEGIN RAISE EXCEPTION 'append-only history cannot be updated or deleted' USING ERRCODE = '23514'; END $$;\n\nDO $$ DECLARE tab text; BEGIN\n  FOREACH tab IN ARRAY ARRAY['review_decisions','user_role_events','graph_versions','graph_members','evaluations','assessment_events','hint_events','gap_hypothesis_history','selector_decisions','grading_artifacts','submissions'] LOOP\n    EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON socratix.%I FOR EACH ROW EXECUTE FUNCTION socratix.reject_history_mutation()', tab);\n  END LOOP;\nEND $$;\n\nCREATE FUNCTION socratix.guard_revision() RETURNS trigger LANGUAGE plpgsql AS $$\nBEGIN\n  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'catalogue history cannot be deleted' USING ERRCODE='23514'; END IF;\n  IF (to_jsonb(NEW) - 'approval_status') IS DISTINCT FROM (to_jsonb(OLD) - 'approval_status')\n     OR OLD.approval_status IN ('approved','rejected')\n     OR NEW.approval_status NOT IN ('under_review','approved','rejected') THEN\n    RAISE EXCEPTION 'immutable candidate revision or invalid approval transition' USING ERRCODE='23514';\n  END IF;\n  RETURN NEW;\nEND $$;\nCREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE ON socratix.catalogue_revisions FOR EACH ROW EXECUTE FUNCTION socratix.guard_revision();\n\nCREATE FUNCTION socratix.require_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$\nDECLARE resource_key text;\nBEGIN\n  resource_key := to_jsonb(NEW) ->> TG_ARGV[1];\n  IF NEW.approval_status = 'approved' AND NOT EXISTS (\n    SELECT 1 FROM socratix.review_decisions d JOIN socratix.catalogue_revisions r\n      ON (d.resource_type,d.resource_id,d.resource_version)=(r.resource_type,r.resource_id,r.resource_version)\n    WHERE d.resource_type=TG_ARGV[0] AND d.resource_id=resource_key AND d.resource_version=NEW.resource_version\n      AND d.decision='approved' AND r.approval_status='approved'\n  ) THEN RAISE EXCEPTION 'approved catalogue projection requires a versioned review decision' USING ERRCODE='23514'; END IF;\n  RETURN NEW;\nEND $$;\nCREATE CONSTRAINT TRIGGER approved_skill_audit AFTER INSERT OR UPDATE ON socratix.skills DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION socratix.require_review_audit('skill','skill_id');\nCREATE CONSTRAINT TRIGGER approved_relation_audit AFTER INSERT OR UPDATE ON socratix.skill_relations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION socratix.require_review_audit('relation','relation_id');\nCREATE CONSTRAINT TRIGGER approved_outcome_audit AFTER INSERT OR UPDATE ON socratix.learning_outcomes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION socratix.require_review_audit('outcome','outcome_id');\n\nCREATE FUNCTION socratix.validate_review_actor() RETURNS trigger LANGUAGE plpgsql AS $$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM socratix.users WHERE id=NEW.reviewer_id AND role='admin' AND is_active)\n     OR NOT EXISTS (SELECT 1 FROM socratix.catalogue_revisions WHERE resource_type=NEW.resource_type\n        AND resource_id=NEW.resource_id AND resource_version=NEW.resource_version AND approval_status=NEW.decision)\n  THEN RAISE EXCEPTION 'review requires an active admin and matching revision status' USING ERRCODE='23514'; END IF;\n  RETURN NEW;\nEND $$;\nCREATE CONSTRAINT TRIGGER authorised_review AFTER INSERT ON socratix.review_decisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION socratix.validate_review_actor();\n\nCREATE FUNCTION socratix.guard_frozen_activity() RETURNS trigger LANGUAGE plpgsql AS $$\nBEGIN\n  IF OLD.frozen_at IS NOT NULL THEN\n    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'frozen activity cannot be deleted' USING ERRCODE='23514'; END IF;\n    IF (to_jsonb(NEW) - ARRAY['status','human_review_status','published_at']) IS DISTINCT FROM\n       (to_jsonb(OLD) - ARRAY['status','human_review_status','published_at']) THEN\n      RAISE EXCEPTION 'frozen specification requires a new activity version' USING ERRCODE='23514';\n    END IF;\n  END IF;\n  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;\nEND $$;\nCREATE TRIGGER frozen_activity BEFORE UPDATE OR DELETE ON socratix.activities FOR EACH ROW EXECUTE FUNCTION socratix.guard_frozen_activity();\n\nCREATE FUNCTION socratix.guard_activity_child() RETURNS trigger LANGUAGE plpgsql AS $$\nDECLARE item jsonb; parent_id uuid; parent_version integer;\nBEGIN\n  item := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;\n  parent_id := (item ->> TG_ARGV[0])::uuid; parent_version := (item ->> TG_ARGV[1])::integer;\n  PERFORM 1 FROM socratix.activities WHERE id=parent_id AND version=parent_version AND frozen_at IS NOT NULL FOR UPDATE;\n  IF FOUND THEN RAISE EXCEPTION 'frozen activity children require a new version' USING ERRCODE='23514'; END IF;\n  IF TG_OP='UPDATE' AND ((to_jsonb(OLD)->>TG_ARGV[0]) IS DISTINCT FROM (item->>TG_ARGV[0])\n      OR (to_jsonb(OLD)->>TG_ARGV[1]) IS DISTINCT FROM (item->>TG_ARGV[1])) THEN\n    RAISE EXCEPTION 'child cannot move between activity versions' USING ERRCODE='23514';\n  END IF;\n  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;\nEND $$;\nCREATE TRIGGER frozen_skills BEFORE INSERT OR UPDATE OR DELETE ON socratix.activity_skills FOR EACH ROW EXECUTE FUNCTION socratix.guard_activity_child('activity_id','activity_version');\nCREATE TRIGGER frozen_outcomes BEFORE INSERT OR UPDATE OR DELETE ON socratix.activity_outcomes FOR EACH ROW EXECUTE FUNCTION socratix.guard_activity_child('activity_id','activity_version');\nCREATE TRIGGER frozen_project BEFORE INSERT OR UPDATE OR DELETE ON socratix.projects FOR EACH ROW EXECUTE FUNCTION socratix.guard_activity_child('project_id','project_version');\nCREATE TRIGGER frozen_milestone BEFORE INSERT OR UPDATE OR DELETE ON socratix.project_milestones FOR EACH ROW EXECUTE FUNCTION socratix.guard_activity_child('project_id','project_version');\nCREATE TRIGGER frozen_dependencies BEFORE INSERT OR UPDATE OR DELETE ON socratix.project_milestone_dependencies FOR EACH ROW EXECUTE FUNCTION socratix.guard_activity_child('project_id','project_version');\n\nCREATE FUNCTION socratix.artifact_requires_frozen_spec() RETURNS trigger LANGUAGE plpgsql AS $$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM socratix.activities WHERE id=NEW.activity_id AND version=NEW.activity_version AND frozen_at IS NOT NULL) THEN\n    RAISE EXCEPTION 'freeze specification before private artifact generation' USING ERRCODE='23514';\n  END IF; RETURN NEW;\nEND $$;\nCREATE TRIGGER artifact_frozen_spec BEFORE INSERT ON socratix.grading_artifacts FOR EACH ROW EXECUTE FUNCTION socratix.artifact_requires_frozen_spec();\n\n-- Defense against accidental Data API exposure: remove schema/table/routine access from browser roles.\nDO $$ DECLARE browser_role text; BEGIN\n  REVOKE ALL ON SCHEMA socratix FROM PUBLIC;\n  REVOKE ALL ON ALL TABLES IN SCHEMA socratix FROM PUBLIC;\n  REVOKE ALL ON ALL FUNCTIONS IN SCHEMA socratix FROM PUBLIC;\n  FOR browser_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP\n    EXECUTE format('REVOKE ALL ON SCHEMA socratix FROM %I', browser_role);\n    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA socratix FROM %I', browser_role);\n    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA socratix FROM %I', browser_role);\n  END LOOP;\nEND $$;\n"


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        "selector_decisions",
        sa.Column("selection_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("policy_version", sa.String(), nullable=False),
        sa.Column("candidate_features", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("weights", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("ranked_targets", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("chosen_target", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("override", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["course_id"], ["socratix.courses.id"], name=op.f("fk_selector_decisions_course_id_courses")
        ),
        sa.ForeignKeyConstraint(
            ["student_id"], ["socratix.users.id"], name=op.f("fk_selector_decisions_student_id_users")
        ),
        sa.PrimaryKeyConstraint("selection_id", name=op.f("pk_selector_decisions")),
        schema="socratix",
    )
    op.create_table(
        "gap_hypotheses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("skill_id", sa.String(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("policy_version", sa.String(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('suspected','supported','disproven','human_confirmed')",
            name=op.f("ck_gap_hypotheses_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["skill_id"], ["socratix.skills.skill_id"], name=op.f("fk_gap_hypotheses_skill_id_skills")
        ),
        sa.ForeignKeyConstraint(
            ["student_id"], ["socratix.users.id"], name=op.f("fk_gap_hypotheses_student_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_gap_hypotheses")),
        schema="socratix",
    )
    op.create_table(
        "reassessment_schedules",
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("skill_id", sa.String(), nullable=False),
        sa.Column("policy_version", sa.String(), nullable=False),
        sa.Column("next_due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_valid_independent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["skill_id"], ["socratix.skills.skill_id"], name=op.f("fk_reassessment_schedules_skill_id_skills")
        ),
        sa.ForeignKeyConstraint(
            ["student_id"], ["socratix.users.id"], name=op.f("fk_reassessment_schedules_student_id_users")
        ),
        sa.PrimaryKeyConstraint(
            "student_id", "skill_id", "policy_version", name=op.f("pk_reassessment_schedules")
        ),
        schema="socratix",
    )
    op.create_index(
        "ix_reassess_due",
        "reassessment_schedules",
        ["next_due_at"],
        unique=False,
        schema="socratix",
        postgresql_where=sa.text("next_due_at IS NOT NULL"),
    )
    op.create_table(
        "skill_estimates",
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("skill_id", sa.String(), nullable=False),
        sa.Column("policy_version", sa.String(), nullable=False),
        sa.Column("recall_index", sa.Float(), nullable=True),
        sa.Column("understanding_index", sa.Float(), nullable=True),
        sa.Column("transfer_index", sa.Float(), nullable=True),
        sa.Column("gap_priority_index", sa.Float(), nullable=True),
        sa.Column("confidence_label", sa.String(), nullable=False),
        sa.Column("evidence_count", sa.Integer(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "confidence_label IN ('insufficient','low','medium','high')",
            name=op.f("ck_skill_estimates_confidence_label_values"),
        ),
        sa.CheckConstraint("evidence_count >= 0", name=op.f("ck_skill_estimates_nonnegative_evidence")),
        sa.CheckConstraint(
            "gap_priority_index BETWEEN 0 AND 1", name=op.f("ck_skill_estimates_gap_priority_index_range")
        ),
        sa.CheckConstraint(
            "recall_index BETWEEN 0 AND 1", name=op.f("ck_skill_estimates_recall_index_range")
        ),
        sa.CheckConstraint(
            "transfer_index BETWEEN 0 AND 1", name=op.f("ck_skill_estimates_transfer_index_range")
        ),
        sa.CheckConstraint(
            "understanding_index BETWEEN 0 AND 1", name=op.f("ck_skill_estimates_understanding_index_range")
        ),
        sa.ForeignKeyConstraint(
            ["skill_id"], ["socratix.skills.skill_id"], name=op.f("fk_skill_estimates_skill_id_skills")
        ),
        sa.ForeignKeyConstraint(
            ["student_id"], ["socratix.users.id"], name=op.f("fk_skill_estimates_student_id_users")
        ),
        sa.PrimaryKeyConstraint("student_id", "skill_id", "policy_version", name=op.f("pk_skill_estimates")),
        schema="socratix",
    )
    op.create_table(
        "gap_hypothesis_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("hypothesis_id", sa.Uuid(), nullable=False),
        sa.Column("previous_status", sa.String(), nullable=True),
        sa.Column("new_status", sa.String(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("reviewer_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "new_status IN ('suspected','supported','disproven','human_confirmed')",
            name=op.f("ck_gap_hypothesis_history_new_status_values"),
        ),
        sa.CheckConstraint(
            "previous_status IN ('suspected','supported','disproven','human_confirmed')",
            name=op.f("ck_gap_hypothesis_history_previous_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["hypothesis_id"],
            ["socratix.gap_hypotheses.id"],
            name=op.f("fk_gap_hypothesis_history_hypothesis_id_gap_hypotheses"),
        ),
        sa.ForeignKeyConstraint(
            ["reviewer_id"], ["socratix.users.id"], name=op.f("fk_gap_hypothesis_history_reviewer_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_gap_hypothesis_history")),
        schema="socratix",
    )
    op.create_table(
        "reflections",
        sa.Column("reflection_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("activity_id", sa.Uuid(), nullable=True),
        sa.Column("activity_version", sa.Integer(), nullable=True),
        sa.Column("attempt_id", sa.Uuid(), nullable=True),
        sa.Column("reflection_text", sa.Text(), nullable=False),
        sa.Column("reported_confidence", sa.Float(), nullable=True),
        sa.Column("self_reported_difficulty", sa.String(), nullable=True),
        sa.Column("privacy", sa.String(), server_default="private", nullable=False),
        sa.Column("allow_use_as_learning_evidence", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("privacy IN ('private')", name=op.f("ck_reflections_privacy_values")),
        sa.CheckConstraint(
            "(activity_id IS NULL) = (activity_version IS NULL)", name=op.f("ck_reflections_activity_pair")
        ),
        sa.CheckConstraint(
            "attempt_id IS NULL OR activity_id IS NOT NULL", name=op.f("ck_reflections_attempt_target")
        ),
        sa.CheckConstraint(
            "reported_confidence BETWEEN 0 AND 1", name=op.f("ck_reflections_confidence_range")
        ),
        sa.ForeignKeyConstraint(
            ["activity_id", "activity_version", "student_id"],
            ["socratix.activities.id", "socratix.activities.version", "socratix.activities.student_id"],
            name=op.f("fk_reflections_activity_id_activity_version_student_id_activities"),
        ),
        sa.ForeignKeyConstraint(
            ["attempt_id", "activity_id", "activity_version"],
            [
                "socratix.submissions.attempt_id",
                "socratix.submissions.activity_id",
                "socratix.submissions.activity_version",
            ],
            name=op.f("fk_reflections_attempt_id_activity_id_activity_version_submissions"),
        ),
        sa.ForeignKeyConstraint(
            ["attempt_id", "student_id"],
            ["socratix.submissions.attempt_id", "socratix.submissions.student_id"],
            name=op.f("fk_reflections_attempt_id_student_id_submissions"),
        ),
        sa.ForeignKeyConstraint(
            ["course_id"], ["socratix.courses.id"], name=op.f("fk_reflections_course_id_courses")
        ),
        sa.ForeignKeyConstraint(
            ["student_id"], ["socratix.users.id"], name=op.f("fk_reflections_student_id_users")
        ),
        sa.PrimaryKeyConstraint("reflection_id", name=op.f("pk_reflections")),
        schema="socratix",
    )
    op.create_table(
        "assessment_events",
        sa.Column("evidence_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("attempt_id", sa.Uuid(), nullable=True),
        sa.Column("evaluation_id", sa.Uuid(), nullable=True),
        sa.Column("skill_id", sa.String(), nullable=False),
        sa.Column("outcome_id", sa.String(), nullable=True),
        sa.Column("stage", sa.String(), nullable=True),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("task_validity", sa.String(), nullable=True),
        sa.Column("observed_correctness", sa.Float(), nullable=True),
        sa.Column("independent", sa.Boolean(), nullable=True),
        sa.Column("max_hint_level_used", sa.Integer(), server_default="0", nullable=False),
        sa.Column("solution_revealed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("student_confidence", sa.Float(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("corrects_evidence_id", sa.Uuid(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "(event_type = 'correction') = (corrects_evidence_id IS NOT NULL)",
            name=op.f("ck_assessment_events_correction_reference"),
        ),
        sa.CheckConstraint(
            "event_type <> 'assessment' OR (evaluation_id IS NOT NULL AND attempt_id IS NOT NULL AND outcome_id IS NOT NULL AND stage IS NOT NULL AND task_validity IS NOT NULL)",
            name=op.f("ck_assessment_events_objective_evidence_refs"),
        ),
        sa.CheckConstraint(
            "event_type = 'assessment' OR observed_correctness IS NULL",
            name=op.f("ck_assessment_events_self_report_not_objective"),
        ),
        sa.CheckConstraint(
            "event_type IN ('assessment','self_report','assistance','correction')",
            name=op.f("ck_assessment_events_event_type_values"),
        ),
        sa.CheckConstraint(
            "stage IN ('recall','understanding','transfer')", name=op.f("ck_assessment_events_stage_values")
        ),
        sa.CheckConstraint(
            "task_validity IN ('valid','invalid','uncertain')",
            name=op.f("ck_assessment_events_task_validity_values"),
        ),
        sa.CheckConstraint(
            "independent IS NOT TRUE OR (solution_revealed = false AND max_hint_level_used = 0)",
            name=op.f("ck_assessment_events_independent_unassisted"),
        ),
        sa.CheckConstraint(
            "max_hint_level_used BETWEEN 0 AND 4", name=op.f("ck_assessment_events_hint_range")
        ),
        sa.CheckConstraint(
            "observed_correctness BETWEEN 0 AND 1", name=op.f("ck_assessment_events_correctness_range")
        ),
        sa.CheckConstraint(
            "student_confidence BETWEEN 0 AND 1", name=op.f("ck_assessment_events_confidence_range")
        ),
        sa.ForeignKeyConstraint(
            ["attempt_id", "student_id"],
            ["socratix.submissions.attempt_id", "socratix.submissions.student_id"],
            name=op.f("fk_assessment_events_attempt_id_student_id_submissions"),
        ),
        sa.ForeignKeyConstraint(
            ["corrects_evidence_id"],
            ["socratix.assessment_events.evidence_id"],
            name=op.f("fk_assessment_events_corrects_evidence_id_assessment_events"),
        ),
        sa.ForeignKeyConstraint(
            ["evaluation_id", "attempt_id"],
            ["socratix.evaluations.evaluation_id", "socratix.evaluations.attempt_id"],
            name=op.f("fk_assessment_events_evaluation_id_attempt_id_evaluations"),
        ),
        sa.ForeignKeyConstraint(
            ["outcome_id", "skill_id"],
            ["socratix.learning_outcomes.outcome_id", "socratix.learning_outcomes.skill_id"],
            name=op.f("fk_assessment_events_outcome_id_skill_id_learning_outcomes"),
        ),
        sa.ForeignKeyConstraint(
            ["skill_id"], ["socratix.skills.skill_id"], name=op.f("fk_assessment_events_skill_id_skills")
        ),
        sa.ForeignKeyConstraint(
            ["student_id"], ["socratix.users.id"], name=op.f("fk_assessment_events_student_id_users")
        ),
        sa.PrimaryKeyConstraint("evidence_id", name=op.f("pk_assessment_events")),
        sa.UniqueConstraint(
            "evaluation_id", "outcome_id", name=op.f("uq_assessment_events_evaluation_id_outcome_id")
        ),
        schema="socratix",
    )
    op.create_index(
        "ix_assessment_student_skill_time",
        "assessment_events",
        ["student_id", "skill_id", "occurred_at"],
        unique=False,
        schema="socratix",
    )
    op.create_table(
        "reflection_skill_tags",
        sa.Column("reflection_id", sa.Uuid(), nullable=False),
        sa.Column("skill_id", sa.String(), nullable=False),
        sa.Column("confirmation_state", sa.String(), nullable=False),
        sa.Column("confidence_label", sa.String(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "confirmation_state IN ('candidate','confirmed','rejected')",
            name=op.f("ck_reflection_skill_tags_confirmation_state_values"),
        ),
        sa.ForeignKeyConstraint(
            ["reflection_id"],
            ["socratix.reflections.reflection_id"],
            name=op.f("fk_reflection_skill_tags_reflection_id_reflections"),
        ),
        sa.ForeignKeyConstraint(
            ["skill_id"], ["socratix.skills.skill_id"], name=op.f("fk_reflection_skill_tags_skill_id_skills")
        ),
        sa.PrimaryKeyConstraint("reflection_id", "skill_id", name=op.f("pk_reflection_skill_tags")),
        schema="socratix",
    )
    op.create_table(
        "gap_hypothesis_evidence",
        sa.Column("hypothesis_id", sa.Uuid(), nullable=False),
        sa.Column("evidence_id", sa.Uuid(), nullable=False),
        sa.Column("relationship", sa.String(), nullable=False),
        sa.CheckConstraint(
            "relationship IN ('supports','disproves')",
            name=op.f("ck_gap_hypothesis_evidence_relationship_values"),
        ),
        sa.ForeignKeyConstraint(
            ["evidence_id"],
            ["socratix.assessment_events.evidence_id"],
            name=op.f("fk_gap_hypothesis_evidence_evidence_id_assessment_events"),
        ),
        sa.ForeignKeyConstraint(
            ["hypothesis_id"],
            ["socratix.gap_hypotheses.id"],
            name=op.f("fk_gap_hypothesis_evidence_hypothesis_id_gap_hypotheses"),
        ),
        sa.PrimaryKeyConstraint("hypothesis_id", "evidence_id", name=op.f("pk_gap_hypothesis_evidence")),
        schema="socratix",
    )
    # ### end Alembic commands ###
    op.execute(GUARDS_SQL)

    op.execute("REVOKE ALL ON SCHEMA socratix FROM PUBLIC")


def downgrade():
    op.execute("DROP FUNCTION IF EXISTS socratix.reject_history_mutation() CASCADE")
    op.execute("DROP FUNCTION IF EXISTS socratix.guard_revision() CASCADE")
    op.execute("DROP FUNCTION IF EXISTS socratix.require_review_audit() CASCADE")
    op.execute("DROP FUNCTION IF EXISTS socratix.validate_review_actor() CASCADE")
    op.execute("DROP FUNCTION IF EXISTS socratix.guard_frozen_activity() CASCADE")
    op.execute("DROP FUNCTION IF EXISTS socratix.guard_activity_child() CASCADE")
    op.execute("DROP FUNCTION IF EXISTS socratix.artifact_requires_frozen_spec() CASCADE")
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table("gap_hypothesis_evidence", schema="socratix")
    op.drop_table("reflection_skill_tags", schema="socratix")
    op.drop_table("assessment_events", schema="socratix")
    op.drop_table("reflections", schema="socratix")
    op.drop_table("gap_hypothesis_history", schema="socratix")
    op.drop_table("skill_estimates", schema="socratix")
    op.drop_table("reassessment_schedules", schema="socratix")
    op.drop_table("gap_hypotheses", schema="socratix")
    op.drop_table("selector_decisions", schema="socratix")
    # ### end Alembic commands ###
