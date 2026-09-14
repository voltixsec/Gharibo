# GHARIBO Model Registry

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Domain spec |
| **Status** | Frozen |
| **Version** | 1.1.0 |
| **Last Updated** | 2026-09-14 |

> Part of the Milestone 1 architecture baseline. The promotion gates below are a frozen decision —
> see `docs/adr/ADR-0008-model-registry-status-gates.md`.

> **v1.1.0 — M2 corrections (2026-09-14).** Two changes: (1) Hard Rule 5 is restated to match
> what is actually enforced and where (M1 enforced promotion in the UI only; M2 adds server-side
> enforcement in the registry API). (2) The first registered entry, `GHARIBO-exp-001`, and its
> lineage are documented below.

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
5. **Promotion is gated** — invalid transitions are rejected. In Milestone 1 this gate was
   enforced in the **UI only**; from Milestone 2 the registry API rejects transitions that are
   not in the allowed set (`EXPERIMENT → CANDIDATE → ACCEPTED → DEPRECATED`), so the gate holds
   even when the API is called directly. See ADR-0008.

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

## First Experiment — `GHARIBO-exp-001`

Milestone 2 prepares — but does **not** run — the first official experiment. It is registered as
an **EXPERIMENT only**.

| Field | Value |
|-------|-------|
| **model_name** | `GHARIBO-exp-001` |
| **status** | `EXPERIMENT` |
| **derived_from (lineage)** | `openai/gpt-oss-20b` |
| **method** | 4-bit QLoRA + SFT |
| **engine** | Unsloth Core |
| **compute worker** | Kaggle Notebooks (free NVIDIA T4) |
| **artifact storage** | Hugging Face private repo (optional, free allowance) + local fallback |

**Lineage rule.** `GHARIBO-exp-001` is *derived from* `openai/gpt-oss-20b`. The base model is the
**initial candidate only** — it is not permanently GHARIBO's foundation, and no paid inference
budget may be spent on a base-model bake-off. A different foundation may be chosen later through
a recorded decision, not by silently swapping the base.

**Promotion rule.** `GHARIBO-exp-001` may **not** be promoted to `GHARIBO-V0.1` (or any other
name) without evaluation. No evaluation has been run, so no promotion is possible today.

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
