# Frontend — Member F

[Web specification and acceptance tests](../../docs/web_design.md) · [Source map](../README.md)

This is the reserved Next.js + TypeScript application root. It has no package manifest or running pages yet. Backend domain owners supply APIs and fixtures; F owns frontend presentation and shared client wiring.

| Directory | Put here |
|---|---|
| `src/app/(public)/login/` | Sign-in page |
| `src/app/(app)/dashboard/` | Goals, suggestions and recent work |
| `src/app/(app)/plan/` | Candidate skill tags and learner confirmation |
| `src/app/(app)/skills/` | Graph and evidence views |
| `src/app/(app)/learn/[activityId]/` | Exercise workspace |
| `src/app/(app)/projects/[projectId]/` | Project requirements and milestones |
| `src/app/(app)/reflection/` | Private reflection and confirmed tags |
| `src/app/(instructor)/review/` | Authorised human review |
| `src/components/` | UI grouped into layout, skills, planner, assessment, editor, tutor, projects, reflection and review |
| `src/hooks/` | Reusable UI behaviour such as job polling |
| `src/lib/api/` | Thin API calls using generated types |
| `src/lib/auth/` | Session and route guard helpers |
| `src/lib/validation/` | Form/input validation |
| `src/types/generated/` | Types generated from backend OpenAPI only |
| `tests/{unit,component,e2e}/` | Frontend logic, UI and full learning journeys |

Keep route files focused on composition. Put feature UI in its named component directory. Route-group names in parentheses organise layouts; they do not provide server authorisation. Add layouts/pages with the implementation rather than placeholder exports.

Generate client types through F's reviewed tooling; never hand-copy public DTOs. Requests go to FastAPI, with no direct ELM, database or grader access. Do not bundle `src/shared/prompts/`, private fixtures, hidden tests, traces or reference solutions. Stage 4 answer reveal requires explicit learner action and visible assistance state.

The Vercel project root will be `src/frontend`. Dependencies and build scripts remain local to this application.
