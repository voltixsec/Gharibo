# GHARIBO Data Factory

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Domain spec |
| **Status** | Frozen |
| **Version** | 1.4.0 |
| **Last Updated** | 2026-09-14 |

> Part of the Milestone 1 architecture baseline. The pipeline state machine below is a frozen
> decision — see `docs/adr/ADR-0007-data-factory-pipeline-state-machine.md`.

> **v1.1.0 — Milestone 2 additions (2026-09-14).** Three additive changes, none of which alter the
> M1 state machine: (1) an optional `reasoning` field on the record schema, which carries the
> model's reasoning trace into the Harmony `analysis` channel (see `docs/ARCHITECTURE_MILESTONE_2.md`
> §4); (2) a `pipeline_updated_at` timestamp; (3) the Gold Pipeline transitions below are now
> validated **server-side** in the repository layer, so an illegal state jump is rejected even when
> the API is called directly rather than through the UI.

> **v1.2.0 — Milestone 3A autonomous work session (2026-09-13).** The M3A session constructed the
> first gold dataset, `GHARIBO-Research-Gold-v0.1`, from the legacy UCL source artifacts. Key
> facts:
>
> - **Source forensics:** 8 source JSONL files at `data/raw/legacy-ucl/`, 18,646 total records
>   across 13 entity types. All files pass SHA-256 verification, have zero parse errors, zero
>   duplicate lines, and zero broken relation references. Immutable source manifest at
>   `data/derived/source-manifests/legacy-ucl-source-manifest-v001.json`.
> - **Quality filter:** 14,444 ACCEPTED_GOLD, 4,043 ACCEPTED_SUPPORTING, 2 REJECTED (DOMAIN records
>   with no parent categories), 157 NEEDS_REVIEW (lifecycle/naming ambiguities). Summary at
>   `data/derived/gold-classification/gold-quality-filter-v001-summary.json`.
> - **Training examples:** 800 examples sampled with balanced distribution across 11 entity types.
>   Each example is in OpenAI Harmony format (system/user/assistant roles), teaching the UCL
>   extraction process. Located at
>   `data/processed/training-examples/gharibo-research-gold-v0.1-examples.jsonl`.
> - **Deterministic split:** 640 train / 80 validation / 80 test, seed=3407. Split hashes computed
>   from raw file line bytes (not canonical JSON) to ensure verification reproducibility across
>   Python/Node. Dataset card at
>   `data/processed/gharibo-research-gold-v0.1/dataset-card.json`.
> - **TEST held out:** TEST is permanently held out — never used for training, tuning, prompt
>   engineering, hyperparameter search, checkpoint selection, or few-shot examples. All splits are
>   pairwise disjoint (verified by the verify-m3a gate runner).
> - **No source payloads committed:** Training examples contain normalized structured data derived
>   from source records. No raw source payloads, credentials, or sensitive data are present.
> - **Snapshot disclosure (M3B):** `GHARIBO-Research-Gold-v0.1` is derived from the physically supplied
>   **18,646-record** legacy UCL snapshot (7 available files). The historical UCL corpus was approximately
>   20,087 records; the difference corresponds to the missing `VOKA_UCL_SECURITY_BATCH_004.jsonl`, which
>   was not supplied and must not be reconstructed or invented. This limitation does not invalidate
>   `GHARIBO-exp-001` — the current snapshot passes all quality gates.
> - **Gold audit (M3B Phase 1):** 100 examples audited against 12 quality criteria. All 100 PASS.
>   No systematic transformation defects found. No dataset regeneration required. Audit artifact at
>   `data/derived/gold-audit/gold-audit-100-v001.json`.

> **v1.4.0 — Milestone 3B (2026-09-14).** Snapshot disclosure, TEST-split supersession and the
> split-aware gold audit.
>
> - **Snapshot disclosure.** `GHARIBO-Research-Gold-v0.1` is derived from the physically supplied
>   **18,646-record** legacy UCL source snapshot (7 available files). It is **NOT** the complete
>   historical **20,087-record** corpus. The 1,441-record gap is the missing
>   `VOKA_UCL_SECURITY_BATCH_004.jsonl` artifact, which was not supplied. **Missing historical
>   artifacts must not be reconstructed.** The 18,646-record snapshot passes all quality gates.
> - **TEST-split supersession.** The original split (seed `3407`) was **contaminated**: 10 of the
>   100 audited examples belonged to TEST, so TEST was not truly held out. That split was
>   **superseded** by a new audit-aware, committed split generator
>   (`scripts/split/cut-gold-split.py`, seed `20260914`). The superseded TEST hash was
>   `959068e5451874ab5c3398584c0187dfdb4815c6d00d3a37ca69a54d8f79f11b`; the new TEST hash is
>   `55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b`. New TRAIN hash
>   `84025de18403b8660d9702877b2b6fd329cedb886cad0095ab67e4daa3828ad2`, new VALIDATION hash
>   `063fb4422aed247b3f92c0f0d5b1291af46fd4357ca48829a7e7f6ce98815787`. The dataset hash is
>   unchanged (`84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5`) because no gold
>   example content changed. The 100-example audit cohort is quarantined into TRAIN + VALIDATION,
>   so **audited ∩ TEST = 0** by construction.
> - **Gold audit (split-aware, re-run).** 100 PASS / 0 NEEDS_REVIEW / 0 FAIL over **TRAIN +
>   VALIDATION only** (train 83, validation 17); **TEST audited = 0**. Artifact
>   `data/derived/gold-audit/gold-audit-100-v001.json` (artifactVersion 1.1.0) now records a
>   `splitIsolation` block and a per-example `split` field. Deterministic: two runs are
>   byte-identical.

## Overview

The Data Factory is the data pipeline and curation workspace. It manages the full lifecycle of training data from raw collection to training-ready datasets.

## Pipeline States

```
RAW -> NORMALIZED -> REVIEW_REQUIRED -> APPROVED -> TRAINING_READY
                                    \-> REJECTED
```

| State | Description |
|-------|-------------|
| RAW | Initial import/save, unprocessed |
| NORMALIZED | Formatted, deduplicated, field-standardized |
| REVIEW_REQUIRED | Needs human review before approval |
| APPROVED | Reviewed and approved for training |
| REJECTED | Reviewed and rejected |
| TRAINING_READY | Included in an assembled dataset, ready for export |

## Record Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string (UUID) | Auto | Primary key |
| task_type | string | No | e.g., "chat", "instruction", "research" |
| domain | string | No | e.g., "products", "science", "code" |
| language | string | No | ISO code, e.g., "en", "zh" |
| input | text | Yes | The prompt/input text |
| context | text | No | Additional context for the input |
| expected_output | text | No | Ground truth (if available) |
| chosen_output | text | No | Preferred response (for DPO) |
| rejected_output | text | No | Rejected response (for DPO) |
| reasoning | text | No | Optional reasoning trace (M2) — mapped to the Harmony `analysis` channel; never emitted to the final answer |
| source | string | No | Where the data came from |
| source_url | string | No | Original URL |
| license | string | No | License of the data |
| verification_status | enum | Yes | Pipeline state (see above) |
| quality_score | float | No | 0.0 - 1.0 |
| difficulty | string | No | "easy", "medium", "hard" |
| tags | string[] | No | Free-form tags |
| validation_results | JSON | Auto | Results from validation engine |
| created_at | datetime | Auto | Creation timestamp |
| updated_at | datetime | Auto | Last update timestamp |
| pipeline_updated_at | datetime | Auto | Last pipeline-state change (M2) |

## Validation Engine

The validation engine runs on every record create/update. It never silently discards records.

### Validators

| Validator | What it checks | Result levels |
|-----------|---------------|---------------|
| Schema validation | All required fields present | PASS/WARNING/FAIL |
| Required fields | Non-empty required fields | PASS/FAIL |
| Duplicate detection | Exact duplicate by input hash | WARNING |
| URL/source presence | source_url present for research data | WARNING |
| Field type validation | Correct data types | PASS/FAIL |
| Unsupported claim detection | Placeholder (P1) | WARNING |
| Invalid relation detection | Placeholder (P1) | WARNING |
| Taxonomy violation | Placeholder (P1) | WARNING |
| Near duplicate | Placeholder (P1) | WARNING |

### Validation Report

Each record stores its validation results as a JSON array:
```json
[
  { "validator": "schema", "status": "PASS", "message": "All required fields present" },
  { "validator": "duplicate", "status": "WARNING", "message": "Potential duplicate of record abc123" }
]
```

## UI Operations

- **Search**: Full-text search across input, domain, tags
- **Filter**: By status, domain, quality score
- **Edit**: Inline editing of any field
- **Bulk approve**: Select multiple records, approve all
- **Bulk reject**: Select multiple, reject all
- **Tag**: Add/remove tags in bulk
- **Score**: Set quality score
- **Import JSONL**: Upload JSONL file, creates RAW records
- **Export JSONL**: Download filtered records as JSONL

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/data-factory | List (paginated, filtered) |
| POST | /api/data-factory | Create single record |
| GET | /api/data-factory/[id] | Get single record |
| PATCH | /api/data-factory/[id] | Update record (re-runs validation) |
| POST | /api/data-factory/bulk | Bulk approve/reject/tag |
| POST | /api/data-factory/import | Import JSONL |
| GET | /api/data-factory/export | Export JSONL |

## Integration with Playground

When a user saves a response from the Playground, it creates:
1. A Training Example (with prompt, response, model, provider)
2. A Data Factory Record (in RAW status, linked to the training example)

This allows the data to flow through the pipeline naturally.
