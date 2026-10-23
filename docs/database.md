# Database — Aiven PostgreSQL schema and data integrity

**Owner:** Member F (Data/Integration) for migrations, roles, backup/configuration. Domain owners propose changes via reviewed migration requests. **Dependencies:** all backend components. **Contract:** [shared_contracts.md](shared_contracts.md) v1.0.

## Role of PostgreSQL

The database records **what skills exist, where they came from, what a student attempted, what assistance was given, and what evidence justifies the current recommendation**. It is not a place to store arbitrary model confidence claims as ground truth.

Use PostgreSQL on **Aiven**, SQLAlchemy 2.x and Alembic. Prefer normalised relational tables for durable records, with JSONB only for versioned model-generated specifications or provider-neutral diagnostic details. Use foreign keys, check constraints, unique indexes and immutable task/evidence versions; do not let agents write ad-hoc JSON directly into the production tables.

## Entity groups and cardinalities

| Group / tables | Core fields (abbreviated) | Relationships and invariants |
|---|---|---|
| `users`, `courses`, `course_enrolments` | `id`, `role`, `course_id`, `enrolled_at`, `status` | unique `(user_id, course_id)`; role-based access in backend |
| `curriculum_sources` | id, source_kind, URI, section, edition, checksum, rights_status, fetched_at | Source provenance for every extracted proposal; copyright review |
| `skills` | `skill_id`, `name`, `description`, `approval_status`, `source_id`, `graph_version` | stable namespaced ID; approved skill may be selected |
| `skill_relations` | id, from_skill_id, to_skill_id, relation, approval_status, evidence_ref | `requires`, `part_of`, `related_to` distinct; no approved cycle for `requires` or `part_of` |
| `learning_outcomes` | `outcome_id`, `skill_id`, `stage`, `observable_action`, `evidence_criteria JSONB`, `source_ref`, `approval_status` | stage in recall/understanding/transfer; approved ID required in tasks |
| `review_decisions` | reviewer_id, entity_type/id/version, decision, reason, decided_at | append-only approval/audit events |
| `student_plans`, `plan_skill_tags` | owner, text, horizon, candidate/confirmed state, skill_id, provenance, confirmed_at | only confirmed tags enter selector |
| `activities`, `activity_outcomes` | id, version, type, student_safe_spec JSONB, status, spec_checksum, outcome_id | one published immutable version; private grader absent from public spec |
| `projects`, `project_milestones` | project_id/version, milestone_id, depends_on, assessment_method, spec/rubric refs | acyclic dependencies checked before publishing |
| `grading_artifacts` | activity ID/version, encrypted private object refs, verification report, fingerprint | hidden tests/references never returned publicly |
| `generation_jobs` | id, kind, status, request JSONB, policy/model/prompt versions, timestamps | idempotency key; owner/cancel/retry counters |
| `submissions`, `evaluations` | attempt_id, owner, activity/version, source ref, grading validity, test counts, result JSONB | one evaluation per attempt/version; persist grader identity and artifact version |
| `hint_events` | id, attempt_id, level, hint_text, grounded_failure_ids, verification_status, solution_revealed | level 1–4; assistance recorded before new mastery calculation |
| `assessment_events` | evidence_id, student_id, attempt_id?, skill_id, outcome_id, stage, correctness?, independent, task_validity, confidence?, event_type, timestamp | append-only; invalid tests excluded from derived mastery |
| `skill_estimates` | student_id, skill_id, policy_version, stage indices, gap index, confidence_label, evidence_count, computed_at | derived view; unique by student/skill/version; recomputable |
| `gap_hypotheses` | id, student_id, skill_id, label, status, evidence refs JSONB, reviewer_id? | suspected/support/disprove/human-confirm status history |
| `reassessment_schedules` | student_id, skill_id, next_due_at, last_valid_independent_at, policy_version | due≠failed; scheduler calculates retention signal |
| `reflections`, `reflection_skill_tags` | student_id, activity/attempt?, text, reported_confidence, privacy, confirmed tags | self-report signals only; private by default |
| `selector_decisions` | id, student_id, candidate feature vector JSONB, weights, chosen_target, override, policy_version | reproducible ranking/audit trail |

Use `UUID` primary keys for objects, namespaced `TEXT` IDs for skills and learning outcomes, `TIMESTAMPTZ` for timestamps, and exact `JSONB` validation in the application. Avoid duplicating long code/test blobs in many DB rows; prefer encrypted private artifact storage with checksums and retention controls for large items.

## Relational overview (logical ER diagram)

```mermaid
erDiagram
  USERS ||--o{ COURSE_ENROLMENTS : joins
  COURSES ||--o{ COURSE_ENROLMENTS : contains
  COURSES ||--o{ STUDENT_PLANS : has
  STUDENT_PLANS ||--o{ PLAN_SKILL_TAGS : confirms
  SKILLS ||--o{ LEARNING_OUTCOMES : defines
  SKILLS ||--o{ SKILL_RELATIONS : from
  SKILLS ||--o{ SKILL_RELATIONS : to
  ACTIVITIES ||--o{ ACTIVITY_OUTCOMES : evaluates
  LEARNING_OUTCOMES ||--o{ ACTIVITY_OUTCOMES : assessed_by
  ACTIVITIES ||--o{ SUBMISSIONS : receives
  SUBMISSIONS ||--o{ EVALUATIONS : evaluated_by
  SUBMISSIONS ||--o{ HINT_EVENTS : assisted_by
  EVALUATIONS ||--o{ ASSESSMENT_EVENTS : supports
  USERS ||--o{ ASSESSMENT_EVENTS : produces
  SKILLS ||--o{ SKILL_ESTIMATES : summarised_as
  USERS ||--o{ SKILL_ESTIMATES : owns
  USERS ||--o{ REFLECTIONS : authors
  ACTIVITIES ||--o{ GRADING_ARTIFACTS : verified_by
```

This diagram shows **logical associations**; the versioned implementation uses composite foreign keys `(activity_id, activity_version)` and `(project_id, project_version, milestone_id)` where appropriate. A skill relation points to *two* skills, not necessarily two different rows of `SKILL_RELATIONS`.

## Suggested migration order

1. Users, courses, enrolments, source/provenance and approved skill graph.
2. Learning outcomes, course availability, review decisions and graph version tables.
3. Student plans/confirmed tags, activities, project milestones and private grader artifacts.
4. Generation jobs, submissions, evaluations, hint events and transactional outbox.
5. Assessment/reflection events, skill-estimate read models, gap hypotheses, reassessment schedules and selector decisions.

Integrate in staging with a small fixture dataset after each migration group. Do not create foreign keys to a table that has not been deployed. Migration ordering is owned by Member F, not inferred from the order in which other developers happen to finish their components.

## Representative DDL (initial migration sketch)

```sql
CREATE TABLE skills (
  skill_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  approval_status TEXT NOT NULL
    CHECK (approval_status IN ('proposed','under_review','approved','rejected')),
  graph_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE skill_relations (
  relation_id UUID PRIMARY KEY,
  from_skill_id TEXT NOT NULL REFERENCES skills(skill_id),
  to_skill_id TEXT NOT NULL REFERENCES skills(skill_id),
  relation TEXT NOT NULL CHECK (relation IN ('requires','part_of','related_to')),
  approval_status TEXT NOT NULL
    CHECK (approval_status IN ('proposed','under_review','approved','rejected')),
  evidence_ref TEXT,
  CONSTRAINT not_self_relation CHECK (from_skill_id <> to_skill_id),
  UNIQUE (from_skill_id, to_skill_id, relation)
);

CREATE TABLE learning_outcomes (
  outcome_id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(skill_id),
  stage TEXT NOT NULL CHECK (stage IN ('recall','understanding','transfer')),
  observable_action TEXT NOT NULL,
  evidence_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  approval_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activities (
  id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  activity_type TEXT NOT NULL
    CHECK (activity_type IN ('single_skill_exercise','multi_skill_exercise','project')),
  status TEXT NOT NULL CHECK (status IN
    ('draft','verifying','review_required','verified','published','rejected','archived')),
  student_safe_spec JSONB NOT NULL,
  spec_checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

CREATE TABLE assessment_events (
  evidence_id UUID PRIMARY KEY,
  student_id UUID NOT NULL,
  attempt_id UUID,
  skill_id TEXT NOT NULL REFERENCES skills(skill_id),
  outcome_id TEXT REFERENCES learning_outcomes(outcome_id),
  stage TEXT CHECK (stage IN ('recall','understanding','transfer')),
  event_type TEXT NOT NULL,
  task_validity TEXT NOT NULL CHECK (task_validity IN ('valid','invalid','uncertain','not_applicable')),
  observed_correctness DOUBLE PRECISION
    CHECK (observed_correctness BETWEEN 0 AND 1),
  independent BOOLEAN,
  max_hint_level_used SMALLINT CHECK (max_hint_level_used BETWEEN 0 AND 4),
  solution_revealed BOOLEAN NOT NULL DEFAULT false,
  student_confidence DOUBLE PRECISION
    CHECK (student_confidence BETWEEN 0 AND 1),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The SQL is a **representative subset**, not all migrations. Build `users/courses/submissions` tables before adding production foreign keys in `assessment_events`; all changes run through Alembic and integration tests. In later migration, enforce `(attempt_id, activity_id, version)` referential integrity and validate `event_type` against a versioned enum or check constraint.

## Directed graph rules

`from_skill_id` **requires** `to_skill_id`; thus `python.loops` requiring `python.conditionals` is stored as `(python.loops, python.conditionals, requires)`. Query the transitive closure with a recursive CTE (or application traversal); detect self-dependencies/cycles **before** approving graph changes. The skill hierarchy uses separate `part_of` edges, never confused with `requires`.

Aliases for skills should live in `skill_aliases(skill_id, alias, source, status)`; matching an alias does not create a new skill. Store per-course coverage in `course_skills(course_id, skill_id, taught_week, availability, approval_status)` rather than stamping a global skill as universally taught.

## Task verification, immutable versions, human review

- New generated specification starts `draft`, moves to `verifying`, then `verified` or `review_required`/`rejected`; publication is a distinct checked transition.
- `grading_artifacts` are **private**; only internal grading/review workers access hidden tests/reference solutions. Student APIs allow only `activities.student_safe_spec`.
- Editing verified requirements creates `activity.version + 1`, a new checksum, a new grading artifact; historical attempts continue pointing to the old version.
- A `review_decisions` entry captures reviewer, entity version, decision, evidence and time. `published` status must meet project-specific/manual gate policy.
- If an old task is found invalid, mark it invalid/archived, log the correction, recompute affected skill estimates from valid evidence, and retain the audit trail of corrections.

## Submission/evidence transactional semantics

One valid attempt generates a grading result, optional hints, self-report and stage/outcome-linked evidence. Avoid partial writes:

1. Insert `submissions` row and enqueue grading job using stable `attempt_id` and idempotency key.
2. Runner produces a signed/internal report with versioned test artifact ID and validity status.
3. In **one DB transaction**, persist evaluation, append evidence events and enqueue derived-estimate recalculation (transactional outbox recommended). Deduplicate by `(attempt_id, outcome_id, evaluation_version)`.
4. Skill updater consumes **only valid** grading evidence; uncertain/invalid events are available to review, not counted as mastery/gap.
5. On rerun after a grader bug, create a new evaluation revision, invalidate the prior event for derivation through explicit correction event, and recompute the read model.
6. When hint stage 4 is revealed, `solution_revealed=true` for the attempt and any subsequent result must not be recorded as independent mastery. Log hint level transitions before grading update.

**Do not create a hidden test that modifies student data**. Code and grader tests run in a sandbox with no database credentials; only its signed result is returned to API. Strict network/filesystem/CPU/time/process limits are part of the runner deployment review.

## Query/index proposals

```sql
CREATE INDEX ix_assessment_student_skill_time
  ON assessment_events (student_id, skill_id, occurred_at DESC);
CREATE INDEX ix_hints_attempt_level
  ON hint_events (attempt_id, level);
CREATE INDEX ix_jobs_status_time
  ON generation_jobs (status, created_at);
CREATE INDEX ix_relations_source_type
  ON skill_relations (from_skill_id, relation, approval_status);
CREATE INDEX ix_reassess_due
  ON reassessment_schedules (next_due_at)
  WHERE next_due_at IS NOT NULL;
```

Implement indexes only after the matching tables exist. Add unique constraints for idempotency and tasks' content checksums, and row ownership filters for learner data. Evaluate later whether tenant isolation or PostgreSQL RLS is justified by institutional deployment.

## Aiven / Render configuration

- Store `DATABASE_URL` in Render secrets, not the repository, not Vercel browser. Aiven PostgreSQL connections are TLS encrypted; prefer `sslmode=verify-full` and configure Aiven project CA certificate. If `verify-full` cannot be configured initially, document the temporary security exception instead of silently dropping TLS.
- Pool connections per FastAPI process with bounded pool size; Render autoscaling must not exceed Aiven's connection limits. Avoid creating a new connection for every LLM token or grading step.
- Migrate via one controlled CI/pre-deploy job (`alembic upgrade head`), not concurrent startup of all replicas.
- Seed demo reference data with stable source IDs and clear separation of test/staging/production databases. Do not place real student records in preview or public demo deployments.
- Backups/retention and deletion obligations need policies before real institutional data is collected. Encrypt data in transit; restrict DB user permissions; rotate credentials and audit privileged access.
- Generated projects can create many revisions/code blobs; monitor growth, archive per policy and put large artifacts into private object storage when necessary.

## Data access contracts with component owners

| Owner | Reads | Writes (via repository) |
|---|---|---|
| A Skill | sources, skills/aliases, graph, outcomes | source proposals, approved skills/relations/outcomes and review evidence |
| B Exercises | approved graph, activity fingerprints | activity specs/versions, grading artifact refs, generation status |
| C Projects | approved graph and progress | project/milestones, grading artifact refs, generation status |
| D Planning/selector | approved skills, student plan, estimates, due-retention | confirmed plan tags, selector decisions, reflection self-report events |
| D Gap | validated assessment and hint history | derived estimates, hypotheses, due-retention schedule |
| E Grading/hint | private task spec/test refs, authorised submissions | evaluation reports, hint events, verified assessment evidence |
| F Integration | all metadata under admin policy | auth/role controls, migrations, review decisions, job/outbox state |

Cross-module ownership is **logical**: application roles and transactions enforce permissions. Domain owners must not directly access another module's private tables except through repository/service interfaces. Owner F resolves schema changes and regenerates contracts.

## Owned files

```text
src/backend/app/db/{models,session,repositories}.py
src/backend/migrations/{versions,env.py}
src/backend/app/core/{config,security,logging}.py
src/backend/app/api/v1/reviews.py
src/backend/tests/{unit,contract,integration}/infrastructure/test_db*.py
src/shared/fixtures/  # canonical synthetic fixtures; see shared_contracts.md
```

## Acceptance tests

- `requires` graph detects a directed cycle, `part_of` cannot be confused with prerequisite, and unapproved nodes never appear in selector.
- Task version 1 remains immutable after publication; version 2 does not retroactively rewrite historical evidence.
- Invalid/uncertain tests excluded from mastery and gap updates; recomputation reverses invalid results.
- Cross-student reads/writes blocked even with guessed IDs; instructor view limited to authorised courses.
- Concurrent hint/retry and double submits produce idempotent event rows, not duplicate score updates.
- Aiven TLS smoke test passes in staging; credentials never appear in source or public API.
- Schema migrations upgrade cleanly and test downgrade/backup recovery; connection-pool limits respected.

## Sources

- [Aiven PostgreSQL connection examples](https://aiven.io/docs/products/postgresql/howto/list-code-samples)
- [Aiven certificate verification](https://aiven.io/docs/platform/concepts/tls-ssl-certificates)
- [PostgreSQL recursive queries](https://www.postgresql.org/docs/current/queries-with.html)
- [SQLAlchemy 2.x documentation](https://docs.sqlalchemy.org/en/20/)
- [Alembic documentation](https://alembic.sqlalchemy.org/en/latest/)

## Design-change governance (mandatory for the component owner and coding agents)

This document is the **current approved design**, not a disposable prompt. If implementation requires a different algorithm, workflow, schema, API payload, prompt contract, task policy, or project milestone design:

1. Start or continue work on your personal feature branch (`<INITIALS>/<feature_name>`); never modify `main` directly.
2. Before implementing a design deviation, record a proposal in `docs/changes/CHANGELOG.md` with the date, branch, owner, **before → after**, reason, affected files/interfaces, migration/test consequences and review status. For a significant cross-component decision, additionally write `docs/adr/NNNN-short-decision.md` (template provided).
3. Update **this component MD** to describe the newly proposed/approved behaviour. If the change touches boundaries, also update `docs/shared_contracts.md`; if it changes the overall flow, update `docs/architect.md`; for DB schemas, update `docs/database.md`; for UI behaviour, update `docs/web_design.md`. Do not silently change unrelated modules' specifications.
4. Update or add tests and include the changed Markdown files **in the same pull request as the code**. Cross-component contract changes need review from Member F and each affected owner. Changes to approved academic rules or evaluation policy need the designated human reviewer.
5. Until reviewed and merged, label the new design **Proposed** in the log; accepted design replaces the active description only upon team approval. Keep the historical before/after entry; never rewrite it.
6. Coding agents must propose changes rather than autonomously approving architectural, grading, or mastery-policy changes.

See [repository team rules](../README.md), [agent rules](../AGENTS.md), and [change-log template](changes/CHANGELOG.md). Ordinary typo or formatting fixes can be noted in the PR without a design-change entry.
