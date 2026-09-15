# GHARIBO Model Registry

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Domain spec |
| **Status** | Frozen |
| **Version** | 1.4.0 |
| **Last Updated** | 2026-09-15 |

> Part of the Milestone 1 architecture baseline. The promotion gates below are a frozen decision —
> see `docs/adr/ADR-0008-model-registry-status-gates.md`.

> **v1.1.0 — M2 corrections (2026-09-14).** Two changes: (1) Hard Rule 5 is restated to match
> what is actually enforced and where (M1 enforced promotion in the UI only; M2 adds server-side
> enforcement in the registry API). (2) The first registered entry, `GHARIBO-exp-001`, and its
> lineage are documented below.

> **v1.3.0 — Milestone 3A autonomous work session: `GHARIBO-exp-001` remains an EXPERIMENT, now
> READY_FOR_ENV_QUALIFICATION (2026-09-13).** The autonomous work session completed all Sections A–H:
> source artifact forensics (8 files, 18,646 records, zero errors), gold dataset construction
> (`GHARIBO-Research-Gold-v0.1`, 800 Harmony-format examples, 640/80/80 split), dependency freeze
> promotion (6→12 pinned entries), verify-m3a gate runner (12 gates, 51 checks PASS, 3
> PENDING_EXTERNAL_EXECUTION), benchmark metric definitions (13 metrics, all NOT_RUN), and the
> GHARIBO-exp-001 readiness package. The experiment status is **unchanged** — no training has been
> executed, no evaluation has produced a score, and no package has been issued. The readiness
> package (`data/derived/experiment-packages/GHARIBO-exp-001-readiness.json`) establishes that all
> prerequisites for environment qualification are met except a real Kaggle T4 run.
>
> **Experiment card — `GHARIBO-exp-001` (as of M3A autonomous session):**
>
> | Field | Value |
> |---|---|
> | **model_name** | `GHARIBO-exp-001` |
> | **status** | `EXPERIMENT` (unchanged — no training run, no evaluation) |
> | **training_run_id** | none — no run exists |
> | **dataset_version** | `GHARIBO-Research-Gold-v0.1` (800 examples, 640/80/80 split, hashes verified) |
> | **package_id** | none — the Training Package was not issued (`frozenOk = false`; requires real Kaggle T4 run) |
> | **evaluation_score** | `NOT_RUN` — no execution produced a score (never `0`, never an estimate) |
> | **engine_dependency_count** | 12 pinned entries (set complete; all `resolvedVersion = null`) |
> | **readiness_status** | `READY_FOR_ENV_QUALIFICATION` — all M3A deliverables complete; Kaggle T4 run is the next gate |
> | **promotable to CANDIDATE** | **No** — promotion requires ≥1 evaluation result *and* a training-run reference, neither of which exists |
>
> **What changed.** The dataset now exists (`GHARIBO-Research-Gold-v0.1`, 800 examples in OpenAI
> Harmony format, deterministic 80/10/10 split with verified hashes). The engine dependency freeze
> set is complete at 12 entries (6 original + 6 promoted recipe deps). The verify-m3a gate runner
> validates 12 gates with 51 checks PASS and 3 PENDING_EXTERNAL_EXECUTION (Kaggle-dependent). All
> benchmark metrics are defined but NOT_RUN — no fabricated scores.
>
> **What did not change.** No training was executed. No model weights, adapters, or checkpoints
> were produced. No evaluation score exists. The experiment status remains EXPERIMENT. The
> Training Package was not issued because `frozenOk = false` (requires `status = QUALIFIED` and
> `unknowns` empty from a real Kaggle run).
>
> *(The block above is the verbatim v1.3.0 note. It was true when written and is retained as
> history per `docs/DOCUMENTATION_GOVERNANCE.md` §5.4. It is superseded as a description of the
> current state by the v1.4.0 note below.)*
>
> **v1.4.0 — Milestone 3C: `GHARIBO-exp-001` has executed; nothing is promoted (2026-09-15).**
> Authorised by [ADR-0020](adr/ADR-0020-post-execution-truth-reconciliation.md) and
> recorded as `DEC-0030`. The statements above — "no training has been executed", "no adapters were
> produced", "no package was issued" — are **no longer true as of 2026-09-15** and are superseded
> for current-state purposes. What is now true:
>
> | Field | Value (as of 2026-09-15) |
> |---|---|
> | **status** | `EXPERIMENT` — **unchanged**. Execution does not promote; promotion still requires >=1 evaluation result *and* explicit authorization (ADR-0008). |
> | **training_run_id** | `ea6e30f2-ce26-4323-b35a-3436ee867eaf` — status `COMPLETED` |
> | **package_id** | `78dd1bf374ed1c53785ea50bf179b1b7a4764d40c121d3d41cda4e2a2e3e68f2` (issued; immutable) |
> | **training executed** | 640 examples, 1 epoch, 160 steps, 3,981,312 trainable params, `train_loss` 0.6016419500112533 |
> | **declared / effective dtype** | declared `fp16`; **effective `float32`** (engine-imposed, accepted in DEC-0030; the package is *not* retroactively edited) |
> | **adapter artifacts** | final adapter == checkpoint-160, sha256 `794917f2…5678f`; checkpoint-150 `5e062fa0…40249` (registered as artifacts; **not** in this repository) |
> | **evaluation_score** | `NOT_RUN` — unchanged. Held-out TEST use is **not authorized**; state is `EVALUATION_READY_AWAITING_AUTHORIZATION`. |
> | **GHARIBO-V0.1** | `NOT_CREATED` — the project has no promoted model version yet |
> | **promotable to CANDIDATE** | **No** — evaluation is `NOT_RUN` and unauthorized |
>
> **Explicitly still forbidden.** Do not call this model `GHARIBO-V0.1`. Do not report an
> evaluation score. Do not use the held-out TEST split for validation, model selection, prompt
> engineering or checkpoint selection. Do not describe this run as an fp16 run.

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

Milestones 2 and 3A prepare — but do **not** run — the first official experiment. It is registered as
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
| **dataset_version** | `GHARIBO-Research-Gold-v0.1` (800 examples, 640/80/80 split) |
| **engine_deps** | 12 pinned entries (all `resolvedVersion = null`) |
| **readiness** | `READY_FOR_ENV_QUALIFICATION` |
| **verify-m3a** | 51 PASS, 0 FAIL, 3 PENDING_EXTERNAL_EXECUTION |

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
