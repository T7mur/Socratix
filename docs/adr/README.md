# Architecture Decision Records (ADRs)

Use an ADR for a significant decision with lasting or cross-component consequences, e.g. changing the public schema, technology, security boundary, grading policy, or architectural responsibility. Minor local design changes need only a component MD update plus `docs/changes/CHANGELOG.md`.

1. Copy `0000-template.md` to `0001-short-title.md` (increment number).
2. Start with **Proposed**; discuss in the feature PR with affected owners.
3. Once accepted, preserve the record. If the decision later changes, write a new ADR marked as superseding the previous one; do not rewrite history.
4. Add a corresponding brief before → after entry to the change log and update active docs.

This reflects common version-controlled ADR practice: [Martin Fowler](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html) and [Microsoft Engineering Playbook](https://microsoft.github.io/code-with-engineering-playbook/design/design-reviews/decision-log/).
