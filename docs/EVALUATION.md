# GHARIBO Evaluation System

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Domain spec |
| **Status** | Frozen |
| **Version** | 1.0.0 |
| **Last Updated** | 2026-09-14 |

> Part of the Milestone 1 architecture baseline. See `docs/DOCUMENTATION_GOVERNANCE.md` §5 for
> change control. Evaluation is mandatory before any model promotion (ADR-0008).

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
