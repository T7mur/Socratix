# Planning and reflection → approved skill tags

**Owner:** Member D (Personalisation). **Dependencies:** Member A's approved skill graph/outcome catalogue; Member F's ELM adapter, identity/auth and persistence. **Consumers:** selector, knowledge-gap module, frontend. **Normative contract:** [shared_contracts.md](shared_contracts.md) v1.0.

## Purpose and boundaries

Convert **student-authored planning** ("I want to make a café ordering program next week") into *candidate skill tags* that the learner can inspect and confirm. Map **reflection** ("I kept converting the user's input before validating it") to skill-linked *self-report evidence*, not an automatic mastery verdict. Planning is a statement of intention; reflection is a report of experience. Neither can override independently graded performance. Preserve the raw submission and source for audit only under the user's applicable privacy/retention policy.

This is the user's original Planning and Reflection feature connected to the learning loop; it is **not** a generic calendar chatbot. The student owns the goal and can challenge or reject every inferred tag.

## Input/output contracts

| Operation | Input | Output / downstream use |
|---|---|---|
| `propose_plan_tags` | `PlanTagRequest` `{contract_version, student_id, course_id, text, time_horizon}` | `PlanTagProposal` `{plan_id, candidate_tags[{skill_id,confidence_label,reason}], unmapped_phrases, requires_student_confirmation}`; no learner state changed |
| `confirm_plan_tags` | `PlanTagConfirm` `{contract_version, plan_id, confirmed_skill_ids, rejected_skill_ids, optional_goal_text}` | `ConfirmedPlan` `{plan_id, confirmed_skill_ids, confirmed_at, active}`; selector reads |
| `propose_reflection_tags` | `ReflectionCreate` `{contract_version, student_id, course_id, activity_id?, attempt_id?, reflection_text, reported_confidence?, self_reported_difficulty?}` | `ReflectionTagProposal` `{reflection_id, candidate_tags, questions_for_student, requires_student_confirmation}` |
| `confirm_reflection` | `ReflectionConfirm` `{contract_version, reflection_id, confirmed_skill_ids, dismissed_skill_ids, allow_use_as_learning_evidence}` | `ReflectionReceipt` `{reflection_id, evidence_event_ids, recorded_at}`; gap engine reads append-only self-report events |
| `get_active_plan` | Authenticated user/course context | Confirmed plan and tags; recommender input |

`student_id` is checked against authenticated principal; frontend-supplied IDs do not authorise cross-student access. Expose no other student's plan or reflection.

## Design choices

1. **Deterministic candidate retrieval first:** load approved skills taught or available in course; look up IDs, names, instructor-approved aliases, and relevant descriptions; do exact/normalised phrase matching and optionally embedding retrieval to produce ~10–20 possible tags. Do not let the LLM invent new canonical IDs.
2. **Bounded LLM classification second:** pass the student's text and only candidate IDs/descriptions. Ask which skills are explicitly or plausibly relevant, with reasons quoting user-provided words. Output `low | medium | high` *uncalibrated* confidence labels, not mastery probabilities.
3. **Tag provenance:** distinguish `student_explicit` (student named the concept), `model_suggested`, `instructor_assigned`, and `student_confirmed`. Confirmed tags are authoritative for the plan; model tags are provisional.
4. **Unknown ambitions:** if a student requests something not yet represented ("build a real-time music synthesiser"), surface `unmapped_phrases` and suggest adjacent approved skills without silently creating a new concept. Member A owns curriculum proposals.
5. **Plan choice:** preserve free-text objective, intended horizon (`today | week | later`), learner's custom order, confirmed tags, and explicit overrides. The selector may recommend prerequisites but not silently replace confirmed goals.
6. **Reflection signal:** student self-reports/confidence are low-weight diagnostic signals. They should trigger questions or suggest practice, not confirm a misconception without valid assessment events.
7. **Privacy and optional publishing:** reflections default to private. University blogs are a future opt-in export; never send private grades, weaknesses, other students' information or unreviewed AI comments to a blog.
8. **Versioning:** every model suggestion logs graph version, prompt version and ELM model identifier. A subsequent curriculum update should not silently rewrite the student's past confirmed plan.

## Deterministic pipeline

```python
async def propose_plan_tags(request, skill_repo, llm_gateway):
    # Authentication/authorisation happens in API layer.
    candidates = skill_repo.search_approved_skills(
        course_id=request.course_id,
        text=request.text,
        limit=20,
        include_aliases=True,
    )
    # Explicit schema: the only skill_ids the LLM can return are candidates.
    suggestion = await llm_gateway.generate_json(
        operation="plan_tags_v1",
        model_alias="generation",
        system_prompt=PLAN_TAG_PROMPT,
        payload={"plan": request.text,
                 "time_horizon": request.time_horizon,
                 "candidate_skills": candidates},
        schema=PlanTagProposalDraft,
    )
    return validate_candidate_ids(suggestion, candidates)
```

`search_approved_skills` and `validate_candidate_ids` are deterministic components. The model's main role is semantic matching and concise explanations; it cannot update the graph or the learner score.

## LLM prompt: `src/shared/prompts/planning/plan_tags_v1.txt`

```text
SYSTEM: You map a student's self-described study goal to an approved skills catalogue.
You are NOT measuring mastery, altering the course, choosing an exercise, or writing a plan on the student's behalf.
INPUT:
  plan_text: {{plan_text}}
  time_horizon: {{time_horizon}}
  approved_candidate_skills: {{skills_with_ids_descriptions_aliases}}
TASK:
  Rank only clearly relevant candidate skill IDs and give a short rationale tied to the student's words.
  Return unrecognised ambitions as unmapped_phrases. Be conservative; do not infer weak skills.
RULES:
  - Return IDs only from approved_candidate_skills.
  - Never create new skill IDs.
  - Distinguish explicit goals from plausible prerequisites in reasons.
  - Use confidence_label: low|medium|high, not probabilities.
  - Do not claim the student has mastered or failed a skill.
OUTPUT: JSON matching PlanTagProposalDraft.
```

## Reflection prompt: `src/shared/prompts/planning/reflection_tags_v1.txt`

```text
SYSTEM: You help a student reflect on an exercise/project attempt.
INPUT:
  submitted_reflection: {{reflection_text}}
  selected_approved_skill_candidates: {{approved_skills}}
  requirement-linked assessment evidence: {{verified_evidence_summary_or_null}}
TASK:
  Suggest skill tags relevant to the student's description; ask at most two follow-up questions to clarify a potential misunderstanding.
RULES:
  - No diagnosis from self-report alone; never assert an unverified cause.
  - Do not rewrite the student's account or produce a grade.
  - Match only supplied approved skill IDs.
  - Separate 'student says they struggled' from 'independently observed failed test'.
  - Tag confidence is uncalibrated and must be confirmed by student.
OUTPUT: JSON matching ReflectionTagProposalDraft.
```

## Files owned

```text
src/backend/app/modules/planning/
  candidate_search.py      # alias/exact/semantic retrieval of approved skills
  tagging.py               # ELM adapter call + allowed-ID validation
  confirmation.py          # student confirms/edits candidate tags
  reflection.py            # self-report events + privacy settings
  policy.py                # limits, allowed statuses, sources
  repository.py            # repositories (DB schema owned by F)
src/backend/app/api/v1/plans.py
src/backend/app/api/v1/reflections.py
src/shared/prompts/planning/{plan_tags_v1,reflection_tags_v1}.txt
src/backend/tests/{unit,contract,integration}/planning/test_planning*.py
```

## Data flow to other members

- **A → D:** `ApprovedSkillGraph` including `skill_id`, descriptions, aliases, course availability. Never use unapproved skills.
- **D planning → D selector:** saved `ConfirmedPlan` IDs, horizon and override history. Selector recomputes priority without re-asking ELM to tag the same plan.
- **E/B/C → D reflection:** safe `activity_id`, `attempt_id` and verified requirement/outcome summaries; do not show a hidden solution.
- **D reflection → D gap engine:** append `AssessmentEvidence`-compatible `self_report` events with associated approved skill/outcome IDs, student confidence, source reference and `task_validity` where applicable. Separate these from graded evidence.
- **D → F frontend:** candidate tags with checkboxes, reasons, confirm/edit/reject UX, opt-in reflection capture. Use shared DTOs.

## Tests and acceptance criteria

- Explicit mention of "loops" is mapped to canonical `python.loops` only if approved in the course.
- Requested unsupported concept yields `unmapped_phrases`, not a fabricated identifier.
- Student can reject all proposed tags; selector must not use rejected proposals.
- Private reflection does not appear in another student's profile or public blog.
- Self-reported confidence of 0.9 **never** directly raises the independent transfer index.
- An invalid or deleted activity/test cannot be used as objective correctness evidence; raw reflection may still be retained under retention policy.
- Changing ELM output to an unknown ID is rejected by deterministic validation.
- Full vertical slice: enter plan → candidate tags → confirm → selector recommendation → reflect → confirm → append self-report event.

## Risks and future extensions

Planning text may be multilingual, vague, overambitious or affected by prior experience; student confirmations can also be incomplete. Do not mistake low model confidence for low learner ability. Assess suggestions for accessibility and cultural/language bias. Future opt-in calendar/blog integration must be separately authorised; not part of MVP.

## Design-change governance (mandatory for the component owner and coding agents)

This document is the **current approved design**, not a disposable prompt. If implementation requires a different algorithm, workflow, schema, API payload, prompt contract, task policy, or project milestone design:

1. Start or continue work on your personal feature branch (`<INITIALS>/<feature_name>`); never modify `main` directly.
2. Before implementing a design deviation, record a proposal in `docs/changes/CHANGELOG.md` with the date, branch, owner, **before → after**, reason, affected files/interfaces, migration/test consequences and review status. For a significant cross-component decision, additionally write `docs/adr/NNNN-short-decision.md` (template provided).
3. Update **this component MD** to describe the newly proposed/approved behaviour. If the change touches boundaries, also update `docs/shared_contracts.md`; if it changes the overall flow, update `docs/architect.md`; for DB schemas, update `docs/database.md`; for UI behaviour, update `docs/web_design.md`. Do not silently change unrelated modules' specifications.
4. Update or add tests and include the changed Markdown files **in the same pull request as the code**. Cross-component contract changes need review from Member F and each affected owner. Changes to approved academic rules or evaluation policy need the designated human reviewer.
5. Until reviewed and merged, label the new design **Proposed** in the log; accepted design replaces the active description only upon team approval. Keep the historical before/after entry; never rewrite it.
6. Coding agents must propose changes rather than autonomously approving architectural, grading, or mastery-policy changes.

See [repository team rules](../README.md), [agent rules](../AGENTS.md), and [change-log template](changes/CHANGELOG.md). Ordinary typo or formatting fixes can be noted in the PR without a design-change entry.
