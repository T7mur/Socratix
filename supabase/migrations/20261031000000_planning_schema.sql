-- Planning data (planning_methodology.md v6 §13 + evidence tables for plan quality and competence).
-- Applied by the Supabase GitHub integration from the production branch (`db-production`).
-- Server-only: only the FastAPI server (role planning_app) reads and writes. RLS is on everywhere, anon and
-- authenticated get nothing, and `planning` is not in the Data API's exposed schemas (supabase/config.toml).
-- Busy blocks store times only: calendar titles and commitment labels stay on the student's device.

create schema if not exists planning;
revoke all on schema planning from public, anon, authenticated;

-- Append-only history: no UPDATE. DELETE stays possible so "delete my data" (cascade) and retention work.
create function planning.reject_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'append-only history cannot be updated' using errcode = '23514';
end $$;
revoke execute on function planning.reject_update() from public;

-- ---------- student and setup ----------
-- seed: create the demo user in Supabase Auth first (dashboard), then insert its UUID here via a separate seed script
create table planning.students (
  id uuid primary key references auth.users (id) on delete cascade,   -- Supabase Auth user (login comes later)
  path text not null default 'beginner' check (path in ('beginner', 'competent')),
  path_changed_at timestamptz,
  created_at timestamptz not null default now()
);

create table planning.setup (
  student_id uuid primary key references planning.students (id) on delete cascade,
  day_start time not null default '09:00',
  day_end time not null default '21:00',
  tz text not null default 'Europe/London',
  weekly_study_hours numeric(4, 1) not null default 20 check (weekly_study_hours > 0 and weekly_study_hours <= 80),
  updated_at timestamptz not null default now(),
  check (day_end > day_start)
);

create table planning.calendar_imports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references planning.students (id) on delete cascade,
  imported_at timestamptz not null default now(),
  first_date date,
  last_date date,
  event_count integer not null check (event_count >= 0)
);

create table planning.busy_blocks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references planning.students (id) on delete cascade,
  kind text not null check (kind in ('class', 'busy')),
  source text not null default 'manual' check (source in ('manual', 'ics')),
  import_id uuid references planning.calendar_imports (id) on delete cascade,
  weekday smallint check (weekday between 0 and 6),        -- weekly block (0 = Sunday) …
  on_date date,                                            -- … or one date (calendar file, one-off busy)
  start_local time not null,
  end_local time not null,                                 -- '24:00' = end of day
  status text not null default 'busy' check (status in ('busy', 'tentative')),
  check ((weekday is null) <> (on_date is null)),
  check (end_local > start_local),
  check ((source = 'ics') = (import_id is not null))
);
create index on planning.busy_blocks (student_id, on_date);

-- ---------- deadlines and milestones (v6 §6–§8) ----------
create table planning.deadlines (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references planning.students (id) on delete cascade,
  kind text not null check (kind in ('exam', 'assignment')),
  subtype text check (subtype in ('code', 'written', 'maths')),
  course text not null,
  item text not null,
  due_at timestamptz not null,
  source text not null default 'manual' check (source in ('manual', 'extract')),
  papers smallint check (papers >= 0),
  paper_min smallint check (paper_min between 30 and 240),
  created_at timestamptz not null default now(),
  check ((kind = 'exam') = (subtype is null)),
  unique (id, student_id)
);
create index on planning.deadlines (student_id, due_at);

create table planning.exam_topics (
  id uuid primary key default gen_random_uuid(),
  deadline_id uuid not null references planning.deadlines (id) on delete cascade,
  name text not null,
  confidence text not null default 'ok' check (confidence in ('low', 'ok', 'high')),   -- self-report: weak evidence, private
  concept_id text
);

create table planning.assignment_parts (
  id uuid primary key default gen_random_uuid(),
  deadline_id uuid not null references planning.deadlines (id) on delete cascade,
  name text not null,
  size text not null default 'm' check (size in ('s', 'm', 'l'))
);

create table planning.milestones (
  id uuid primary key default gen_random_uuid(),
  deadline_id uuid not null,
  student_id uuid not null,
  stage text not null check (stage in ('map', 'cover', 'mixed', 'paper', 'revisit', 'final',
                                       'understand', 'plan', 'build', 'check', 'ready', 'custom')),
  name text not null,
  done_when text,
  target_date date not null,
  est_hours numeric(5, 1) not null default 0 check (est_hours >= 0),
  status text not null default 'open' check (status in ('open', 'done', 'skipped')),
  done_at timestamptz,
  redate_count smallint not null default 0 check (redate_count >= 0),
  skip_reason text,
  created_at timestamptz not null default now(),
  check ((status = 'skipped') = (skip_reason is not null)),
  foreign key (deadline_id, student_id) references planning.deadlines (id, student_id) on delete cascade
);
create index on planning.milestones (student_id, target_date);
create index on planning.milestones (deadline_id);

-- ---------- daily plans (v6 §3–§5) ----------
create table planning.plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references planning.students (id) on delete cascade,
  plan_date date not null,
  off_day boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'evaluated', 'submitted', 'closed')),
  path_at_submit text check (path_at_submit in ('beginner', 'competent')),
  top_priority text,
  priority_covered boolean,
  priority_override boolean not null default false,
  quality smallint check (quality between 0 and 5),
  completion numeric(4, 3) check (completion between 0 and 1),
  on_target boolean,
  reviews_used smallint not null default 0 check (reviews_used between 0 and 2),
  submitted_at timestamptz,
  closed_at timestamptz,
  unique (student_id, plan_date),
  check (not off_day or on_target is null)
);

create table planning.tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references planning.plans (id) on delete cascade,
  text text not null,
  start_local time,
  minutes smallint not null check (minutes between 1 and 600),
  place text,
  origin text not null default 'original' check (origin in ('original', 'added', 'suggested')),
  status text not null default 'planned' check (status in ('planned', 'done', 'moved', 'missed')),
  moved_to time,
  milestone_id uuid references planning.milestones (id) on delete set null,
  task_type text check (task_type in ('coding', 'reading', 'writing', 'maths', 'admin', 'other')),
  course text,
  concept_ids text[] not null default '{}',
  link_kind text check (link_kind in ('exercise', 'concept')),
  link_ref text,
  took text check (took in ('less', 'as_planned', 'more', 'much_more')),
  difficulty text check (difficulty in ('easy', 'ok', 'hard', 'very_hard')),
  reasons text[] not null default '{}',
  next_action text check (next_action in ('move', 'split', 'drop')),
  understood text check (char_length(understood) <= 300),   -- reflection: what the student understood (optional, private)
  check ((status = 'moved') = (moved_to is not null))
);
create index on planning.tasks (plan_id);
create index on planning.tasks (milestone_id);

create table planning.checkins (
  plan_id uuid primary key references planning.plans (id) on delete cascade,
  overall_took text check (overall_took in ('less', 'as_planned', 'more', 'much_more')),
  created_at timestamptz not null default now()
);

-- ---------- evidence (append-only) ----------
create table planning.overrides (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references planning.students (id) on delete cascade,
  task_id uuid not null references planning.tasks (id) on delete cascade,
  issue_code text not null check (issue_code in ('vague_outcome', 'scope_too_big', 'unclear_target', 'too_long_split', 'priority_missing')),
  at timestamptz not null default now()
);

-- every "Check my plan": rule results, verdicts, the quality it gave, and which model/prompt produced it
create table planning.plan_evaluations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references planning.plans (id) on delete cascade,
  review_no smallint not null check (review_no between 0 and 10),
  source text not null check (source in ('elm', 'rules', 'mixed')),
  model text,
  prompt_version text,
  rule_results jsonb not null,      -- {structure, buffer_pct, buffer_ok, clashes:[…]}
  task_verdicts jsonb not null,     -- [{task_id, finishable, scope_ok, issue_code, overridden}]
  quality smallint not null check (quality between 0 and 5),
  created_at timestamptz not null default now()
);

-- one row per closed plan: the inputs and result of the competence rule (v6 §5, §9)
create table planning.competence_evaluations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references planning.students (id) on delete cascade,
  plan_id uuid references planning.plans (id) on delete set null,
  rule_version text not null default 'v6',
  inputs jsonb not null,            -- {quality, completion, off_day, last_counted:[bool…]}
  result jsonb not null,            -- {on_target, counted, best_of, change: null|'unlock'|'stepback'}
  path_before text not null check (path_before in ('beginner', 'competent')),
  path_after text not null check (path_after in ('beginner', 'competent')),
  created_at timestamptz not null default now()
);
create index on planning.competence_evaluations (student_id, created_at);

create table planning.events (
  id bigint generated always as identity primary key,
  student_id uuid not null references planning.students (id) on delete cascade,
  type text not null check (type in ('plan_submitted', 'task_status_changed', 'plan_closed', 'milestone_done', 'milestone_redated')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index on planning.events (student_id, type, created_at);

-- ---------- ELM bookkeeping ----------
-- responses may contain task wording, so they are deleted with the student
create table planning.elm_cache (
  key text primary key,             -- sha256(call + model + prompt_version + input)
  student_id uuid references planning.students (id) on delete cascade,   -- null: call made before a student exists
  call text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create index on planning.elm_cache (student_id);

create table planning.elm_calls (
  id bigint generated always as identity primary key,
  student_id uuid references planning.students (id) on delete cascade,
  route text not null check (route in ('e1', 'e2', 'e3', 'e4', 'e5')),
  status text not null,
  latency_ms integer,
  created_at timestamptz not null default now()
);
create index on planning.elm_calls (student_id, created_at);

create index on planning.exam_topics (deadline_id);
create index on planning.assignment_parts (deadline_id);
create index on planning.overrides (task_id);
create index on planning.plan_evaluations (plan_id);

-- 6. hours done per milestone, calculated from its done tasks (not stored)
create view planning.milestone_progress with (security_invoker = true) as
select m.id as milestone_id,
       coalesce(sum(t.minutes) filter (where t.status = 'done'), 0) / 60.0 as done_hours
from planning.milestones m
left join planning.tasks t on t.milestone_id = m.id
group by m.id;

-- 10. retention (RETENTION_DAYS = 120). Not scheduled here: Temur schedules it later with Supabase Cron.
create function planning.purge_old_data() returns void
language plpgsql set search_path = '' as $$
begin
  delete from planning.plans where plan_date < current_date - 120;
  delete from planning.events where created_at < now() - interval '120 days';
  delete from planning.elm_cache where expires_at < now();
end $$;
revoke execute on function planning.purge_old_data() from public, anon, authenticated;

create trigger append_only before update on planning.overrides for each row execute function planning.reject_update();
create trigger append_only before update on planning.plan_evaluations for each row execute function planning.reject_update();
create trigger append_only before update on planning.competence_evaluations for each row execute function planning.reject_update();
create trigger append_only before update on planning.events for each row execute function planning.reject_update();

-- ---------- access ----------
-- planning_app: the server's login role (set its password in the dashboard, never here). DML only.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'planning_app') then
    create role planning_app login noinherit;
  end if;
end $$;
grant usage on schema planning to planning_app;
grant select, insert, update, delete on all tables in schema planning to planning_app;
grant usage, select on all sequences in schema planning to planning_app;
revoke all on all tables in schema planning from public, anon, authenticated;
grant select on planning.milestone_progress to planning_app;
grant execute on function planning.purge_old_data() to planning_app;
-- every later migration that creates a table in planning must also enable RLS and add the server_only policy
alter default privileges in schema planning grant select, insert, update, delete on tables to planning_app;
alter default privileges in schema planning grant usage, select on sequences to planning_app;

do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'planning' loop
    execute format('alter table planning.%I enable row level security', t);
    execute format('create policy server_only on planning.%I for all to planning_app using (true) with check (true)', t);
  end loop;
end $$;
