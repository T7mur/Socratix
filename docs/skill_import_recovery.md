# Recover saved skill proposals

Status: implemented proposal, A/F review pending. No public DTO or database migration changes.
This workflow prepares pending catalogue candidates. It never approves academic content.

## Why the admin queue can be empty

Each model response is checkpointed in `skill_import_chunks.result`. Only after all chunks in
a unit pass combined validation are catalogue revisions inserted atomically. A conflicting ID,
invalid citation or missing endpoint can therefore leave saved drafts but no review candidates.
New reports include `failure_details` with safe cause codes, HTTP status where available, and
conflicting resource IDs. Raw provider bodies, credentials and model text are not printed in errors.

Identical semantic proposals can union their verified citation lists. Different names,
descriptions, observable actions or success criteria are never reconciled by first/last-wins.
Normal resumption now reuses saved schema-valid responses even after semantic rejection,
reporting the conflict again instead of automatically paying to regenerate it.

## Prepare an offline review

From the repository root, use the original artifacts, selected unit, active admin actor and
permission reference. The source run must be inactive and contain matching saved results for
every selected chunk. Recovery refuses a changed request digest or different registered source.

```powershell
uv run --project src/backend python src/scripts/import_skills.py --artifacts outputs/cs2023-bridge-check --section AI-ML --actor-id ADMIN_UUID --target development --permission-ref PERMISSION_RECORD --from-run SOURCE_RUN_UUID
```

This performs database reads and writes local review artifacts only. No provider is constructed.
Exit 2 is expected when choices are required. It prints paths to a JSON review file and a Markdown
comparison under `outputs/skill-import-recovery/SOURCE_RUN_UUID/`. Existing edited files are never
overwritten. The files are tied to the saved batch digest and artifact digest.

## Make explicit human decisions

Read the Markdown comparison against the PDF/source requests. Edit the JSON file:

- For each `selections` entry, copy one listed `variant_id` from `conflicts`, and provide a
  nonblank reason. Do not change the displayed `conflicts` payloads. Only the selected semantic
  variant is retained; verified identical occurrences can contribute their own evidence.
- For each `chunk_actions` entry, choose `action: "replace"` and correct its `replacement_batch`,
  or choose `action: "exclude"`. Both require a reason. Repairs must use canonical batch fields,
  real supplied source-span IDs, correct source locators and primary evidence. Do not invent a
  citation merely to bypass a check. The original request is `requests/CHUNK_UUID.json` in the
  artifact directory.
- Additional explicit repairs/exclusions can reference other known chunks. All repaired data
  is revalidated. If excluding a skill leaves dangling outcomes or relationships, resolve those
  dependencies explicitly too; recovery does not silently fabricate or reparent them.

These are choices about which draft proposals to submit, not publication decisions. The website's
separate admin review remains required. Excluding a response explicitly marks incomplete curriculum
coverage, adds visible flags to retained proposals and keeps the derived run `review_required`.

## Validate, then stage pending candidates

```powershell
uv run --project src/backend python src/scripts/import_skills.py --artifacts outputs/cs2023-bridge-check --section AI-ML --actor-id ADMIN_UUID --target development --permission-ref PERMISSION_RECORD --from-run SOURCE_RUN_UUID --resolutions PATH_TO_REVIEW_JSON --dry-run
```

No model calls or database writes occur in this dry-run. Unresolved selections, stale review
files, invalid repairs, cycles and missing dependencies block it. Reviewed exclusions yield exit 2
with their reasons even if all retained proposals validate; inspect that distinction in the report.

Remove `--dry-run` after reviewing the choices to create a separate derived import. Its fingerprint
includes the original saved-batch digest, original model configuration, recovery version and
reviewed decision digest. Today's model/key settings do not trigger regeneration. The original
run and responses remain untouched. Repeating the same recovery reuses the derived checkpoints.
Unit candidates/evidence commit atomically; unresolved choices never create pending rows.

Reports use the existing `outputs/skill-imports/RUN_UUID/report.json` path, with
`recovery_source_run_id`, explicit `operator_exclusions` and pending review counts. Each copied
checkpoint retains recovery provenance; the ledger's immutable run configuration pins the exact
review and original result digests. Open `/review` with status Pending after staging; approve
skills before dependent outcomes/relationships. No approval happens from the CLI.

## Safe provider diagnostics

Future normal imports distinguish `llm_configuration`, `provider_auth` (401/403),
`provider_rate_limit` (429), `provider_timeout`, `provider_connection`, `provider_server`,
`provider_request`, and `invalid_model_output`. The report includes the status code where known.
Past `provider_failure` records cannot retrospectively reveal a provider body or exact HTTP cause.
Recovery does not test or repair external provider access; it uses saved results only.

## Real-data preparation record — 2026-10-26

The failed run `37f6836a-413b-473a-916c-79073414357e` contains all 49 matching AI-ML responses.
The recovery command found eight conflicting IDs and three evidence issues: two citation/evidence
disagreements and one context-only citation. A comparison and JSON review file were generated
without model requests, original-run mutations or catalogue writes. Human choices remain unset.
An empty admin queue is therefore still expected until a reviewed recovery is staged.
