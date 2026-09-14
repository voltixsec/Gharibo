# GHARIBO Data Factory

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Domain spec |
| **Status** | Frozen |
| **Version** | 1.0.0 |
| **Last Updated** | 2026-09-14 |

> Part of the Milestone 1 architecture baseline. The pipeline state machine below is a frozen
> decision — see `docs/adr/ADR-0007-data-factory-pipeline-state-machine.md`.

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
