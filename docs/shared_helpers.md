# Shared helpers: discovery catalogue

This branch adds only the offline ingestion helpers below. Database/authentication helpers under
development on other branches remain owned by their components and must be merged additively.
Python imports start with `app` when running from `src/backend`. All listed functions are synchronous;
none calls ELM, opens a database session, authenticates a user, or approves a skill graph.

| Import path / owner | Inputs → outputs | Side effects and errors | Tests |
|---|---|---|---|
| `app.modules.skill_generation.parser.extract_pdf` / A | PDF path, `SourceMetadata`, optional `ParseOptions` → raw `ParsedDocument` | Reads local PDF; optional fixed Tesseract executable and temporary images. `IngestionError` for unreadable/encrypted/corrupt/oversized inputs; per-page OCR failures become diagnostics. | `test_pdf_cli.py`, `test_pdf_ingestion.py` |
| `app.modules.skill_generation.parser.reconstruct_document` / A | Raw document, optional corrections object → independent reconstructed document | No I/O; preserves raw records. `IngestionError` for stale/invalid corrections and hierarchy cycles. | `test_pdf_ingestion.py` |
| `app.modules.skill_generation.parser.parse_pdf` / A | Same source/options/corrections → reconstructed document | Convenience composition of extraction and reconstruction, with the same side effects/errors. | `test_pdf_cli.py` |
| `app.modules.skill_generation.payload_builder.build_generation_inputs` / A | Reconstructed document; selected unit codes, approved existing-skill summaries, byte ceiling, optional prompt → `(requests, manifest)` | Reads versioned prompt unless injected; no model call. Rights/quality/size failures become unit review reasons; invalid selections/settings raise `IngestionError`. | `test_pdf_ingestion.py`, `test_generation_input.py` |
| `app.modules.skill_generation.cli.export_artifacts` / A | Raw/derived document, requests, manifest, new output path → `None` | Atomically writes artifact directory; redacts source text without permission, refuses existing output. `IngestionError`/`OSError` on invalid target or export failure. | `test_pdf_ingestion.py`, `test_pdf_cli.py` |

Example (offline operator code):

```python
from app.modules.skill_generation.ingestion_models import SourceMetadata
from app.modules.skill_generation.parser import extract_pdf, reconstruct_document
from app.modules.skill_generation.payload_builder import build_generation_inputs

source = SourceMetadata("11111111-1111-4111-8111-111111111111", "https://example.invalid/source", "2024", "pending")
raw = extract_pdf("curriculum.pdf", source)
document = reconstruct_document(raw)
requests, manifest = build_generation_inputs(document)  # No text requests while rights are pending.
```

Reuse decision: searched the existing module and the database branch's helper catalogue. Graph
review/validation helpers are unrelated to layout parsing. The database repository's JSON checksum
requires backend dependencies and has different ownership; this offline module hashes source bytes
and serializes its own versioned artifacts without importing repository-private code. No second
configuration, authentication, HTTP, transaction or database helper is introduced. Internal ID/encoding
functions belong to ingestion and are not advertised as general application utilities.
