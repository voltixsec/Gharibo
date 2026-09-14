# GHARIBO Model Registry

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Domain spec |
| **Status** | Frozen |
| **Version** | 1.0.0 |
| **Last Updated** | 2026-09-14 |

> Part of the Milestone 1 architecture baseline. The promotion gates below are a frozen decision —
> see `docs/adr/ADR-0008-model-registry-status-gates.md`.

## Overview

The Model Registry is the single source of truth for every model version in the GHARIBO ecosystem. It gates promotion from experiment to production, ensuring no model is called "GHARIBO-V1" until it has earned it.

## Registry Entry Schema

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Primary key |
| model_name | string | e.g., "GHARIBO-exp-001" |
| version | string | e.g., "0.1", "1.0" |
| base_model | string | e.g., "meta-llama/Llama-3.1-8B-Instruct" |
| training_run_id | string | FK to TrainingRun |
| dataset_version | string | Dataset used for training |
| training_method | string | "LoRA", "QLoRA", "SFT" |
| checkpoint_location | string | Path to full checkpoint |
| adapter_location | string | Path to LoRA adapter |
| evaluation_score | JSON | Scores from evaluation system |
| status | enum | See status lifecycle |
| notes | text | Free-form notes |
| created_date | datetime | Registration date |
| updated_at | datetime | Last update |

## Status Lifecycle

```
EXPERIMENT -> CANDIDATE -> ACCEPTED
                  |
                  v
              DEPRECATED
```

| Status | Description | Can promote to |
|--------|-------------|----------------|
| EXPERIMENT | Initial registration, not yet evaluated | CANDIDATE |
| CANDIDATE | Passed evaluation, under review | ACCEPTED or DEPRECATED |
| ACCEPTED | Approved for production use | DEPRECATED |
| DEPRECATED | Superseded or withdrawn | (terminal) |

## Promotion Rules

### EXPERIMENT -> CANDIDATE
- Must have at least one evaluation result
- Must have a training run reference
- Evaluation scores must be recorded

### CANDIDATE -> ACCEPTED
- Must pass evaluation comparison vs. base model
- No critical regressions (configurable thresholds, P1)
- Team lead approval required

### ACCEPTED -> DEPRECATED
- Superseded by a newer model
- Or withdrawn due to issues
- Record remains in registry for audit

## Hard Rules

1. **Never call an experiment "GHARIBO-V1"** until explicitly promoted to ACCEPTED status
2. **Every model has a unique name** — no duplicates allowed
3. **Every model references its training run** — full lineage is preserved
4. **Every model references its dataset version** — reproducibility guaranteed
5. **Promotion is gated** — the system blocks invalid transitions

## Model Naming Convention

```
Base models:
  - meta-llama/Llama-3.1-8B-Instruct (external)
  - Qwen/Qwen2.5-7B-Instruct (external)

GHARIBO derived:
  - GHARIBO-exp-001 (first experiment)
  - GHARIBO-exp-002 (second experiment)
  - GHARIBO-V0.1 (first candidate)
  - GHARIBO-V1 (first accepted, production-ready)
```

The "V1" label is reserved. It can only be applied through an explicit promotion in the registry UI.

## Future Model Family

The registry is designed to eventually hold:

| Model | Purpose | Status |
|-------|---------|--------|
| GHARIBO (base) | General reasoning, chat | Future |
| GHARIBO-Code | Code generation | Future |
| GHARIBO-Vision | Image/document analysis | Future |
| GHARIBO-Image | Image generation | Future |
| GHARIBO-Video | Video generation | Future |
| GHARIBO-Voice | Voice/audio | Future |

A user eventually interacts only with "GHARIBO". Internally, GHARIBO routes tasks to specialized models.
