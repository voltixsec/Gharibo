# GHARIBO Research Gym

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Domain spec |
| **Status** | Frozen |
| **Version** | 1.0.0 |
| **Last Updated** | 2026-09-14 |

> Part of the Milestone 1 architecture baseline. See `docs/DOCUMENTATION_GOVERNANCE.md` §5 for
> change control.

## Overview

Research Gym is the first "training school" for GHARIBO. It teaches the model how to build high-quality structured knowledge libraries through a systematic research workflow.

## Purpose

The goal is NOT to train product-specific knowledge into the model. Instead, Research Gym trains the MODEL'S ABILITY to:
- Discover and organize information systematically
- Extract structured entities from unstructured sources
- Validate claims against evidence
- Detect and eliminate duplicates
- Generate clean, structured records
- Maintain source provenance

## Task Workflow

```
Topic/System
    |
    v
1. Discover Taxonomy
    - Identify the domain structure
    - Build category hierarchy
    |
2. Discover Manufacturers/Creators
    - Find entities that produce items
    |
3. Discover Brands
    - Identify brand relationships
    |
4. Discover Product Families
    - Group items into families
    |
5. Discover Models/Variants
    - Find specific models within families
    |
6. Extract Technical Specifications
    - Parse specs from sources
    |
7. Identify Accessories
    - Find compatible add-ons
    |
8. Identify Compatibility
    - Map inter-entity relationships
    |
9. Identify Services
    - Discover related services
    |
10. Attach Evidence
    - Link sources to every claim
    |
11. Validate
    - Schema validation
    - Required field check
    - Unsupported claim detection
    |
12. Detect Duplicates
    - Exact match detection
    - Near-duplicate detection (P1)
    |
13. Generate Structured Records
    - Final approved records
    - Ready for knowledge base
```

## Entity Schema

The schema is generic and domain-agnostic:

| Entity Type | Description |
|------------|-------------|
| CATEGORY | Top-level domain classification |
| DOMAIN | Knowledge domain |
| SYSTEM | A system or ecosystem |
| MANUFACTURER | Creator/producer entity |
| BRAND | Brand within a manufacturer |
| PRODUCT_FAMILY | Group of related products |
| PRODUCT_MODEL | Specific product model |
| ITEM | Individual item/SKU |
| SERVICE | Related service offering |
| RELATION | Relationship between entities |
| SOURCE | Information source |
| EVIDENCE | Evidence supporting a claim |

## Genericity

The schema works across domains:
- **Commercial products**: manufacturers -> brands -> product families -> models
- **Software**: publishers -> products -> versions -> releases
- **Scientific literature**: journals -> fields -> papers -> datasets
- **Companies**: sectors -> industries -> companies -> subsidiaries
- **APIs**: providers -> services -> endpoints -> methods
- **Technical systems**: vendors -> platforms -> components -> configurations
- **Market intelligence**: markets -> segments -> companies -> products

## Research Training Record

Every run preserves a complete audit trail:

| Field | Type | Description |
|-------|------|-------------|
| task | string | The research task |
| instructions | text | Detailed instructions |
| input | text | Topic/system input |
| sources_considered | JSON[] | URLs/sources evaluated |
| source_snippets | JSON[] | Relevant text from sources |
| candidate_entities | JSON[] | Entities discovered |
| generated_records | JSON[] | Records created |
| validation_failures | JSON[] | Records that failed validation |
| duplicates_found | JSON[] | Duplicate entities detected |
| corrections | JSON[] | Corrections applied |
| final_approved_records | JSON[] | Approved records |
| reward_score | float | Quality score (0.0-1.0) |
| model_used | string | Model used for research |
| duration | int | Duration in seconds |

## Hard Rules

1. **Never mark unsupported facts as verified** — if no source evidence exists, the fact is marked "UNVERIFIED"
2. **Never silently discard records** — failed validations are preserved, not deleted
3. **Preserve all sources** — even rejected ones are stored for audit
4. **Track all corrections** — every edit to a record is logged

## Python Service

The research service runs on port 8102:
- `POST /run` — accepts task + input, runs the research workflow, returns a ResearchRecord
- `GET /records/{id}` — retrieves a stored research record

The P0 implementation includes a deterministic task runner that:
- Accepts a topic input
- Generates candidate entities using schema templates
- Produces structured records
- Runs validation checks
- Detects duplicates
- Calculates a reward score
- Persists the full Research Training Record

## Future (P1+)

- Real LLM-powered research (requires configured provider)
- Web search integration for source discovery
- Near-duplicate detection
- Full validation pipeline (schema correctness, record precision, source coverage, taxonomy accuracy)
- Research Gym leaderboard
- Automated reward scoring via evaluation
