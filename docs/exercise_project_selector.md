# Exercise/project selector — planning × gaps × retention

**Owner:** Member D (Personalisation) • **Dependencies:** A graph, D gap and planning, B/C generators, F DB • **Contract:** [shared_contracts.md](shared_contracts.md) v1.0

## Mission

Select the *next skill target and activity type* while respecting the student's explicit goal. The system **advises, does not silently overrule**. In the MVP use a **fixed, configurable percentage split**, acknowledging that it is biased and not an optimal policy. Make every decision reproducible and explainable.

### Fixed MVP heuristic (proposed initial default)

**Planning 40% / Knowledge gap 35% / Retention 25%**. These numbers are **suggested defaults added for the handoff (not percentages specified by the user)**. They are a team-assumed initial trial, NOT validated learning science. Keep them in `selector_policy` config and persist `policy_version` on every result. Future empirical tests may change them. Stronger hard constraints apply **before** scoring (approval, permitted prerequisites, eligibility, student override, assessment restrictions).

## Inputs/outputs

- Input `SelectorRequest`: `student_id`, `course_id`, `mode`, `activity_type_preference`, confirmed planning skill IDs (do not trust unconfirmed LLM tags).
- Reads: `ApprovedSkillGraph`, `SkillEstimate[]`, `RetentionDue[]`, permitted course coverage, recent exercises/project history, student planned goals and override history.
- Output `SelectorResult`: ranked `{skill_ids, activity_type, priority_score, reason_codes, human-readable explanation, override_allowed}`, `policy_version`, `weights`.
- **Output downstream:** `GenerationBrief` with target outcomes, allowed/excluded skills, stage, difficulty and context.

## Pipeline — deterministic first

1. Retrieve approved and currently available skill IDs; compute prerequisite closure (only approved `requires`).
2. **Eligibility filter:** allow skills at student's chosen level/course week; missing prerequisites cause `recommend_prep` or integrated-supported activity, not silent discard. Allow manual override with explanation and optional diagnostic.
3. Build candidate set from union of: confirmed planning skills, gap-priority skills, and retention-due skills. Include optional related approved skills for meaningful combinations.
4. Calculate three *normalised* scores in `[0,1]`: `P(skill)` goal-match/urgency, `G(skill)` evidence-derived gap priority, `R(skill)` retention-due (time and outcome importance). If no evidence exists for one signal, use an explicit fallback and log it; do not treat missing data as proven mastery.
5. Compute **MVP score** `S=0.40*P + 0.35*G + 0.25*R`. Document whether missing dimensions are 0 or reweighted (MVP choice: assign 0, expose absent signal; avoid hidden dynamic renormalisation).
6. Tie-break deterministically: approved prerequisites, student-specified deadline, least recently seen, stable skill ID. Avoid infinite repeated tasks by a cooldown per equivalent task fingerprint.
7. Choose `activity_type`: isolated weak outcome → one-skill exercise; approved integration outcome and >=2 eligible skills → multi-skill; student project goal/engineering outcome and sufficient prerequisites → project.
8. Build `GenerationBrief`, return ranked alternatives with reasons and a manual override path.
9. Log selected target and feature vector for later evaluation; no automatic weight learning in MVP.

### Example

Student plan emphasises loops; history shows input-validation issues; loops retention is due. Scores below are hypothetical:

| Candidate | P | G | R | `0.4P+0.35G+0.25R` |
|---|---:|---:|---:|---:|
| `python.loops` | 1.0 | 0.4 | 0.9 | 0.765 |
| `python.input_validation` | 0.2 | 0.9 | 0.4 | 0.495 |
| `python.lists` | 0.5 | 0.3 | 0.4 | 0.405 |

The selector **recommends loops**, can note the validation gap, and may offer an integrated project that tackles both. It does not forcibly replace the student's goal with the highest gap skill.

## Core deterministic logic (illustrative)

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Policy:
    planning: float = 0.40
    gap: float = 0.35
    retention: float = 0.25
    version: str = "selector-v1"


def score_candidate(p: float, g: float, r: float, policy=Policy()) -> float:
    assert abs(sum((policy.planning, policy.gap, policy.retention)) - 1.0) < 1e-9
    if not all(0 <= x <= 1 for x in (p, g, r)):
        raise ValueError("selector features must be in [0,1]")
    return policy.planning*p + policy.gap*g + policy.retention*r


def eligible(skill_id, approved_graph, taught_skill_ids):
    return skill_id in approved_graph and approved_graph.prerequisites(skill_id) <= taught_skill_ids
```

In production use a real validation exception (not optimisable-away `assert`) and a graph interface implemented in Module A. `taught_skill_ids` is not the same as *mastered*; stage difficulty and available support determine readiness.

## Optional AI role (not selector authority)

LLM may: (a) explain why a recommendation connects to a goal, (b) suggest an interesting context or cross-skill integration, and (c) propose a study schedule. It **may not change scores or silently switch skill IDs**. Prompt:

```text
You are an educational recommender explainer. Given a deterministic SelectorResult and approved skill descriptions, explain the strongest two recommendations in simple language. Cite the provided evidence features. Describe uncertainty and offer the student's override/diagnostic option. Do NOT recompute priority scores, invent mastery, or introduce skills not in the approved graph. Output explanation text only.
```

## Interfaces / files

```text
src/backend/app/modules/selector/
  eligibility.py       # approval, prerequisites, course stage
  feature_builder.py   # P/G/R in [0,1], missing-feature flags
  scoring.py           # fixed policy, tie-breaks
  activity_choice.py   # choose single/multi/project
  explanations.py      # evidence-based reasons
src/backend/app/api/v1/selection.py
src/shared/prompts/selector/  # optional versioned explanation templates
src/backend/tests/{unit,contract,integration}/selector/test_selector*.py
```

Reads repositories only. Writes `selector_decisions` and `generation_jobs` via Member F repositories; not direct writes to Member D's gap estimates. Public `POST /api/v1/selection/recommend` returns `SelectorResult` and optional selected `GenerationBrief` when a choice is confirmed.

## Testing and bias/threshold disclaimer

- Verify scores sum and ordering with fixtures; separate eligibility from ranking; changes to weight config create new policy versions.
- Test planning vs gap conflict; student override; unknown/unapproved skill; retention absent; insufficient prerequisite; recently repeated task.
- Measure differences by prior knowledge and accessibility of help; do not optimise for high activity completion instead of later independent transfer.
- **40/35/25 is not optimal or impartial**. Teacher priorities, student goals, question difficulty, miscalibrated gap estimates and individual conditions can bias rankings. Log every feature and manually review surprising choices.
- **Future RL:** contextual bandit/RL may choose weights/activity policies using *delayed unaided performance* under a reviewable exploration policy, informed consent and holdout evaluation. Not part of the MVP.

## Design-change governance (mandatory for the component owner and coding agents)

This document is the **current approved design**, not a disposable prompt. If implementation requires a different algorithm, workflow, schema, API payload, prompt contract, task policy, or project milestone design:

1. Start or continue work on your personal feature branch (`<INITIALS>/<feature_name>`); never modify `main` directly.
2. Before implementing a design deviation, record a proposal in `docs/changes/CHANGELOG.md` with the date, branch, owner, **before → after**, reason, affected files/interfaces, migration/test consequences and review status. For a significant cross-component decision, additionally write `docs/adr/NNNN-short-decision.md` (template provided).
3. Update **this component MD** to describe the newly proposed/approved behaviour. If the change touches boundaries, also update `docs/shared_contracts.md`; if it changes the overall flow, update `docs/architect.md`; for DB schemas, update `docs/database.md`; for UI behaviour, update `docs/web_design.md`. Do not silently change unrelated modules' specifications.
4. Update or add tests and include the changed Markdown files **in the same pull request as the code**. Cross-component contract changes need review from Member F and each affected owner. Changes to approved academic rules or evaluation policy need the designated human reviewer.
5. Until reviewed and merged, label the new design **Proposed** in the log; accepted design replaces the active description only upon team approval. Keep the historical before/after entry; never rewrite it.
6. Coding agents must propose changes rather than autonomously approving architectural, grading, or mastery-policy changes.

See [repository team rules](../README.md), [agent rules](../AGENTS.md), and [change-log template](changes/CHANGELOG.md). Ordinary typo or formatting fixes can be noted in the PR without a design-change entry.
