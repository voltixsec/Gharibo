# GHARIBO Evaluation System

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Domain spec |
| **Status** | Frozen |
| **Version** | 1.2.0 |
| **Last Updated** | 2026-09-14 |

> Part of the Milestone 1 architecture baseline. See `docs/DOCUMENTATION_GOVERNANCE.md` §5 for
> change control. Evaluation is mandatory before any model promotion (ADR-0008).

> **v1.1.0 — Milestone 3A (2026-09-14).** This document defines the *framework*. The **concrete,
> machine-verifiable metrics** for the first official benchmark — and the rules that keep the
> held-out `TEST` split uncontaminated — are specified in
> [`docs/RESEARCH_BENCHMARK.md`](RESEARCH_BENCHMARK.md). Two rules from that spec are binding here:
> (1) `TEST` is read-only and must never be used for training, tuning, checkpoint selection, prompt
> or template selection, few-shot selection, threshold tuning, or dedup/filter policy; and (2)
> **no score exists until a real execution produces it** — `BASE` and `CANDIDATE` are both
> `NOT_RUN` (null) until then, and `0` / `"N/A"` / estimates are forbidden as stand-ins.

> **v1.2.0 — Milestone 3A autonomous work session (2026-09-13).** The M3A session established the
> concrete prerequisites for evaluation without running any:
>
> - **Dataset:** `GHARIBO-Research-Gold-v0.1` (800 examples, 640/80/80 split) with a permanently
>   held-out TEST split (80 items). Split hashes are content-addressed and verified by the
>   verify-m3a gate runner (Gate 7: deterministic dataset regeneration + split disjointness).
> - **Benchmark metrics:** 13 machine-verifiable metrics defined in
>   `docs/RESEARCH_BENCHMARK.md` (M1–M13). All are NOT_RUN — no fabricated scores.
> - **No-score rule enforced:** The verify-m3a gate runner (Gate 11) checks that no fabricated
>   benchmark results exist: `base.status = NOT_RUN`, `candidate.status = NOT_RUN`, no score
>   patterns in source, and all 13 metric scores are `null`.
> - **Leakage audit:** Defined in RESEARCH_BENCHMARK.md §3.5 — split disjointness, training-set
>   containment, prompt containment, and hash reproduction. The verify-m3a gate runner (Gate 7)
>   independently verifies split disjointness.
> - **Promotion gating:** Unchanged — `GHARIBO-exp-001` remains EXPERIMENT. Promotion to CANDIDATE
>   requires ≥1 evaluation result and a training-run reference, neither of which exists.

## Overview

Evaluation is mandatory before serious training and before any model promotion. The system benchmarks models across standardized categories and compares base model vs. GHARIBO candidate performance.

## Benchmark Categories

| Category | What it measures |
|----------|-----------------|
| Reasoning | Logical deduction, multi-step problem solving |
| Coding | Code generation, debugging, code review |
| Instruction Following | Adherence to complex, multi-constraint instructions |
| Structured Output | JSON, tables, formatted data accuracy |
| Research | Knowledge building, entity extraction, taxonomy |
| Source Fidelity | Accuracy of cited sources, no fabrication |
| Hallucination Resistance | Refusing to answer when uncertain |
| Data Extraction | Pulling structured data from unstructured text |
| Classification | Categorization accuracy across domains |
| Deduplication | Detecting and removing duplicate entities |
| Tool Use | Selecting and using tools correctly |

## Research Gym-Specific Metrics

| Metric | Description |
|--------|-------------|
| Schema correctness | Records conform to the entity schema |
| Record precision | Fraction of generated records that are valid |
| Duplicate rate | Percentage of duplicate entities detected |
| Unsupported-claim rate | Claims without source evidence |
| Source coverage | Entities backed by at least one source |
| Taxonomy accuracy | Correct placement in the taxonomy hierarchy |

## Comparison Model

```
BASE MODEL (e.g., Qwen-2.5-7B)
       |
       v
  [Training]
       |
       v
GHARIBO CANDIDATE (e.g., GHARIBO-exp-001)
       |
       v
  [Evaluation]
       |
       v
  Comparison Report
  - Per-category scores
  - Delta (candidate - base)
  - Regression detection
```

### Promotion Gating

The system prevents promotion if measurable regressions exceed configurable thresholds:

```
IF (candidate_score < base_score * (1 - max_regression_threshold))
    THEN block promotion
    AND display specific regression categories
```

Default thresholds (P1, configurable):
- Overall: max 5% regression
- Per-category: max 10% regression
- Hallucination Resistance: max 0% regression (strict)

## Evaluation Record Schema

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Primary key |
| model_id | string | FK to Model Registry |
| benchmark_category | enum | One of the 11 categories |
| score | float | 0.0 - 1.0 |
| base_model_score | float | For comparison |
| regressions | JSON | List of regression items |
| created_at | datetime | |

## Current Status (P0)

- Benchmark categories defined and listed in UI
- Base vs. candidate comparison scaffolded
- Evaluation results can be created and viewed
- Promotion gating mechanism exists (thresholds deferred to P1)
- Actual benchmark execution is P1 (requires running inference)

## Future (P1+)

- Automated benchmark runner
- Historical trend charts
- Evaluation leaderboard
- Custom benchmark creation
- A/B testing between candidates
