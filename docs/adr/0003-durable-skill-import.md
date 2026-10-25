# 0003 — Durable operator skill import

Status: Proposed; Member A/F review pending. Date: 2026-10-25.

PDF parsing stays offline. An operator command consumes immutable artifacts and invokes the existing gateway. Dedicated private import run/chunk/evidence records retain model configuration, permission references, validated responses and exact revision/span provenance. Student generation jobs are not reused because they reference students and activities.

Checkpoint each validated chunk, then atomically publish pending revisions for a complete unit. A session-level PostgreSQL advisory lock serializes an input fingerprint without holding a transaction during model calls. Interrupted calls can incur a repeated provider charge; committed checkpoints never need another call. Human approval alone changes accepted graph projections.

Alternative: filesystem receipts only. Rejected for the proposed implementation because loss of an output directory would lose resumability and evidence links. Website uploads and worker dispatch are deferred. No external integration or academic policy is approved by this ADR.
