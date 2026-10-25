-- Run once as the database owner AFTER migrations. No passwords are stored in source.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='socratix_api') THEN CREATE ROLE socratix_api NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='socratix_worker') THEN CREATE ROLE socratix_worker NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA socratix TO socratix_api, socratix_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA socratix TO socratix_api;
REVOKE ALL ON socratix.grading_artifacts, socratix.evaluations FROM socratix_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA socratix TO socratix_worker;
REVOKE INSERT, UPDATE, DELETE ON socratix.users, socratix.user_role_events FROM socratix_worker;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA socratix TO socratix_api, socratix_worker;
GRANT INSERT ON socratix.users TO socratix_api;
GRANT UPDATE (email) ON socratix.users TO socratix_api;
GRANT INSERT, UPDATE ON socratix.skills, socratix.skill_relations, socratix.learning_outcomes,
  socratix.catalogue_revisions TO socratix_api;
GRANT INSERT ON socratix.review_decisions, socratix.graph_versions, socratix.graph_members TO socratix_api;
REVOKE UPDATE(role,is_active), DELETE ON socratix.users FROM socratix_api;

-- Apply only AFTER reviewed migration 0006. Its own grants cover already-provisioned roles.
DO $$ BEGIN
 IF to_regclass('socratix.skill_import_runs') IS NOT NULL THEN
  REVOKE ALL ON socratix.skill_import_runs FROM socratix_api;
  REVOKE INSERT, UPDATE, DELETE ON socratix.skill_import_chunks, socratix.skill_candidate_evidence FROM socratix_api;
  REVOKE DELETE ON socratix.skill_import_runs, socratix.skill_import_chunks FROM socratix_worker;
  REVOKE UPDATE, DELETE ON socratix.skill_candidate_evidence FROM socratix_worker;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION socratix.enforce_student_registration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_has_role(current_user, 'socratix_api', 'member') AND NOT pg_has_role(current_user, 'socratix_worker', 'member')
     AND (NEW.role <> 'student' OR NEW.is_active IS NOT TRUE) THEN
    RAISE EXCEPTION 'API registration may create active students only' USING ERRCODE='23514';
  END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS student_registration ON socratix.users;
CREATE TRIGGER student_registration BEFORE INSERT ON socratix.users FOR EACH ROW EXECUTE FUNCTION socratix.enforce_student_registration();
REVOKE ALL ON FUNCTION socratix.enforce_student_registration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION socratix.enforce_student_registration() TO socratix_api, socratix_worker;
-- Create distinct LOGIN users through the dashboard/operator connection, grant ONE group to each.
-- Never use postgres or a service_role API key as the public FastAPI runtime identity.
