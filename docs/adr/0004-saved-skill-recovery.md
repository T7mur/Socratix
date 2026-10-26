# 0004 — Human resolution of saved skill proposals

Status: Proposed; A/F review pending. Date: 2026-10-26.

Recover a failed import by snapshotting its saved canonical batches, generating a review file,
and requiring an operator to select semantic variants or explicitly repair/exclude faulty
responses. Reuse the existing private ledger for a separate derived run keyed by original
result digests and reviewed decisions. Never overwrite the source run, automatically choose
an academic interpretation, fabricate citations, or call a model during recovery.

Equivalent semantic proposals can combine their already-validated source locators. Different
descriptions/outcome criteria require a human selection. All resulting candidates remain pending
under existing admin review. Explicit exclusions are visible as flags and keep the recovery
review_required. This does not claim complete curriculum coverage. No new public DTO/table is
needed. Automatic first/last-wins reconciliation and blind paid regeneration were rejected.
