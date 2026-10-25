# ADR 0002 — Immutable catalogue revisions and transactional evidence

- Status: **Proposed**, pending Member F and affected owners A–E
- Date: 2026-10-25
- Branch: `jk/database`

## Context

Abbreviated schema sketches do not fully define approval versions, historical graph reconstruction, task freezing or concurrent grading/assistance. A mutable status alone cannot explain what a reviewer approved.

## Decision

Store immutable canonical catalogue payloads in numbered revisions. Accepted entity tables are projections, and each published graph references exact accepted revisions. Approval checks and graph publication run under one transaction lock with an append-only human decision. Pending edits never overwrite accepted rows.

Pin activities to a graph and freeze before private artifact generation. Use composite target foreign keys. Evaluation reruns create revisions and explicit correction events. Evidence, corrections and assistance enqueue recalculation through the same transaction's outbox. Repositories do not commit. Database guards prevent historical overwrites and frozen child changes.

## Alternatives and consequences

Overwriting current JSON would be simpler but erase review and assessment meaning. Full event sourcing for every application entity is unnecessary for this v1: mutable derived estimates and job state remain ordinary tables. Catalogue-wide locking favours correctness and simplicity over high review throughput; measure contention before replacing it. Outbox delivery still needs the owning worker; this change implements durable enqueue, not a deployed consumer.

## Acceptance

Test stale/concurrent decisions, both graph-cycle types, immutable task versions, mismatched artifact references, rollback, idempotency, assistance across retries, invalid evidence and recomputation inputs. Hosted execution/restore remains a separate credentialed verification step. See [implementation handoff](../database_implementation.md), [dictionary](../database_dictionary.md) and [change log](../changes/CHANGELOG.md).
