-- Frozen v1 guards. Embedded into revision 0005 by the initial schema generator.
CREATE FUNCTION socratix.reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append-only history cannot be updated or deleted' USING ERRCODE = '23514'; END $$;

DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['review_decisions','user_role_events','graph_versions','graph_members','evaluations','assessment_events','hint_events','gap_hypothesis_history','selector_decisions','grading_artifacts','submissions'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON socratix.%I FOR EACH ROW EXECUTE FUNCTION socratix.reject_history_mutation()', tab);
  END LOOP;
END $$;

CREATE FUNCTION socratix.guard_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'catalogue history cannot be deleted' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW) - 'approval_status') IS DISTINCT FROM (to_jsonb(OLD) - 'approval_status')
     OR OLD.approval_status IN ('approved','rejected')
     OR NEW.approval_status NOT IN ('under_review','approved','rejected') THEN
    RAISE EXCEPTION 'immutable candidate revision or invalid approval transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE ON socratix.catalogue_revisions FOR EACH ROW EXECUTE FUNCTION socratix.guard_revision();

CREATE FUNCTION socratix.require_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resource_key text;
BEGIN
  resource_key := to_jsonb(NEW) ->> TG_ARGV[1];
  IF NEW.approval_status = 'approved' AND NOT EXISTS (
    SELECT 1 FROM socratix.review_decisions d JOIN socratix.catalogue_revisions r
      ON (d.resource_type,d.resource_id,d.resource_version)=(r.resource_type,r.resource_id,r.resource_version)
    WHERE d.resource_type=TG_ARGV[0] AND d.resource_id=resource_key AND d.resource_version=NEW.resource_version
      AND d.decision='approved' AND r.approval_status='approved'
  ) THEN RAISE EXCEPTION 'approved catalogue projection requires a versioned review decision' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER approved_skill_audit AFTER INSERT OR UPDATE ON socratix.skills DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION socratix.require_review_audit('skill','skill_id');
CREATE CONSTRAINT TRIGGER approved_relation_audit AFTER INSERT OR UPDATE ON socratix.skill_relations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION socratix.require_review_audit('relation','relation_id');
CREATE CONSTRAINT TRIGGER approved_outcome_audit AFTER INSERT OR UPDATE ON socratix.learning_outcomes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION socratix.require_review_audit('outcome','outcome_id');

CREATE FUNCTION socratix.validate_review_actor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM socratix.users WHERE id=NEW.reviewer_id AND role='admin' AND is_active)
     OR NOT EXISTS (SELECT 1 FROM socratix.catalogue_revisions WHERE resource_type=NEW.resource_type
        AND resource_id=NEW.resource_id AND resource_version=NEW.resource_version AND approval_status=NEW.decision)
  THEN RAISE EXCEPTION 'review requires an active admin and matching revision status' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER authorised_review AFTER INSERT ON socratix.review_decisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION socratix.validate_review_actor();

CREATE FUNCTION socratix.guard_frozen_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.frozen_at IS NOT NULL THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'frozen activity cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW) - ARRAY['status','human_review_status','published_at']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','human_review_status','published_at']) THEN
      RAISE EXCEPTION 'frozen specification requires a new activity version' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER frozen_activity BEFORE UPDATE OR DELETE ON socratix.activities FOR EACH ROW EXECUTE FUNCTION socratix.guard_frozen_activity();

CREATE FUNCTION socratix.guard_activity_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item jsonb; parent_id uuid; parent_version integer;
BEGIN
  item := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  parent_id := (item ->> TG_ARGV[0])::uuid; parent_version := (item ->> TG_ARGV[1])::integer;
  PERFORM 1 FROM socratix.activities WHERE id=parent_id AND version=parent_version AND frozen_at IS NOT NULL FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'frozen activity children require a new version' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND ((to_jsonb(OLD)->>TG_ARGV[0]) IS DISTINCT FROM (item->>TG_ARGV[0])
      OR (to_jsonb(OLD)->>TG_ARGV[1]) IS DISTINCT FROM (item->>TG_ARGV[1])) THEN
    RAISE EXCEPTION 'child cannot move between activity versions' USING ERRCODE='23514';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER frozen_skills BEFORE INSERT OR UPDATE OR DELETE ON socratix.activity_skills FOR EACH ROW EXECUTE FUNCTION socratix.guard_activity_child('activity_id','activity_version');
CREATE TRIGGER frozen_outcomes BEFORE INSERT OR UPDATE OR DELETE ON socratix.activity_outcomes FOR EACH ROW EXECUTE FUNCTION socratix.guard_activity_child('activity_id','activity_version');
CREATE TRIGGER frozen_project BEFORE INSERT OR UPDATE OR DELETE ON socratix.projects FOR EACH ROW EXECUTE FUNCTION socratix.guard_activity_child('project_id','project_version');
CREATE TRIGGER frozen_milestone BEFORE INSERT OR UPDATE OR DELETE ON socratix.project_milestones FOR EACH ROW EXECUTE FUNCTION socratix.guard_activity_child('project_id','project_version');
CREATE TRIGGER frozen_dependencies BEFORE INSERT OR UPDATE OR DELETE ON socratix.project_milestone_dependencies FOR EACH ROW EXECUTE FUNCTION socratix.guard_activity_child('project_id','project_version');

CREATE FUNCTION socratix.artifact_requires_frozen_spec() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM socratix.activities WHERE id=NEW.activity_id AND version=NEW.activity_version AND frozen_at IS NOT NULL) THEN
    RAISE EXCEPTION 'freeze specification before private artifact generation' USING ERRCODE='23514';
  END IF; RETURN NEW;
END $$;
CREATE TRIGGER artifact_frozen_spec BEFORE INSERT ON socratix.grading_artifacts FOR EACH ROW EXECUTE FUNCTION socratix.artifact_requires_frozen_spec();

-- Defense against accidental Data API exposure: remove schema/table/routine access from browser roles.
DO $$ DECLARE browser_role text; BEGIN
  REVOKE ALL ON SCHEMA socratix FROM PUBLIC;
  REVOKE ALL ON ALL TABLES IN SCHEMA socratix FROM PUBLIC;
  REVOKE ALL ON ALL FUNCTIONS IN SCHEMA socratix FROM PUBLIC;
  FOR browser_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA socratix FROM %I', browser_role);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA socratix FROM %I', browser_role);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA socratix FROM %I', browser_role);
  END LOOP;
END $$;
