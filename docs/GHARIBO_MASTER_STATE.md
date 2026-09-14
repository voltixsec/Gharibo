# GHARIBO Master State

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Governance |
| **Status** | Living |
| **Version** | 1.0.0 |
| **Last Updated** | 2026-09-14 |

> **GENERATED FILE — DO NOT EDIT BY HAND.** This document is deterministically generated
> from [`governance/GHARIBO_MASTER_STATE.json`](../governance/GHARIBO_MASTER_STATE.json) by
> `scripts/master/generate-master-state.mjs`. The JSON is the single source of truth; this file
> is a read-only human view. Regenerate it with `npm run master:generate` and verify it with
> `npm run master:validate`.

---

## Current State

| Field | Value |
| --- | --- |
| Training status | NOT_STARTED |
| Training invariant | TRAINING HAS NOT STARTED |
| Current milestone | M3B (IN_PROGRESS) |
| Blocker summary | A real free-Kaggle T4 qualification run is required to resolve the 12 pinned engine dependency versions and produce the qualification hash. |
| Dataset | GHARIBO-Research-Gold-v0.1 |
| Example count | 800 |
| Split seed | 20260914 |
| Split (train / validation / test) | 640 / 80 / 80 |
| Audit cohort (size / pass / needs review / fail / TEST audited) | 100 / 100 / 0 / 0 / 0 |

## Architecture

| Field | Value |
| --- | --- |
| Frozen baseline | docs/ARCHITECTURE.md v1.1.2 (Frozen) |
| Frozen baseline extends | docs/ARCHITECTURE_MILESTONE_2.md |
| Decision records | docs/adr/ |
| Decision record count | 17 |
| Verified facts block | docs/ARCHITECTURE.md#docs:facts |
| Backend | Next.js Route Handlers (ADR-0001) |
| Persistence | SQLite + better-sqlite3 behind a Repository Pattern (ADR-0002) |
| Monorepo | npm workspaces (ADR-0006) |
| Python services | FastAPI ML services, CORS allow-list (ADR-0009) |
| Master state artifact | governance/GHARIBO_MASTER_STATE.json |

## Training

| Field | Value |
| --- | --- |
| Status | NOT_STARTED |
| Has started | false |
| Invariant | TRAINING HAS NOT STARTED |
| Engine | Unsloth Core (unsloth-core) — Pinned install set required; a bare `pip install unsloth` is insufficient. |
| Method | QLoRA + SFT |
| Quantization | 4-bit |
| Base model candidate | openai/gpt-oss-20b |
| Worker | KaggleTrainingWorker — Kaggle Notebooks (free NVIDIA T4) (interface: TrainingWorker) |
| Worker note | Kaggle is Worker #1, not GHARIBO's architecture; the interface stays provider-neutral. |
| Compute policy | ZERO_COST |
| Prohibited providers | Together AI, RunPod, Vertex AI, Lambda, CoreWeave, Google Colab |
| Artifact policy — external | Hugging Face private repo (optional, free allowance) |
| Artifact policy — fallback | local export/download — GHARIBO must work with no external artifact repo configured |
| Artifact policy — GitHub | source code + docs only — never model artifacts |
| Weights downloaded | false |
| Adapters produced | 0 |
| Checkpoints produced | 0 |
| Evaluation results | 0 |

## Datasets

### GHARIBO-Research-Gold-v0.1

| Field | Value |
| --- | --- |
| Status | ACCEPTED |
| Format | OpenAI Harmony |
| Example count | 800 |
| Content frozen | true |
| Split seed | 20260914 |
| Split generator | scripts/split/cut-gold-split.py |
| Cohort definition | scripts/gold_cohort.py |
| Split counts | train 640 / validation 80 / test 80 |
| Audit cohort size | 100 |
| Audit pass / needs review / fail | 100 / 0 / 0 |
| Audit TEST count | 0 |
| Audit artifact | scripts/audit/gold_audit_100.py |
| Audit split-aware | true |
| Audit deterministic | true |
| Hash algorithm | sha256 |
| Line hash convention | sha256 of raw line bytes |
| Dataset hash | 84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5 |

Notes:
- Content-frozen: no gold example content has been modified; the dataset hash is unchanged since construction.
- Split is audit-aware and deterministic: the 100-example audit cohort is quarantined into TRAIN + VALIDATION, so audited ∩ TEST = 0 by construction.
- TEST is permanently held out — never used for training, tuning, prompt engineering, hyperparameter search, checkpoint selection or few-shot examples.
- No raw source payload is included: training examples contain normalized structured data derived from source records. The full dataset hash is recorded in the gitignored local dataset card.
- Derived from the physically supplied 18,646-record legacy UCL snapshot (7 available files); it is NOT the complete historical ~20,087-record corpus. The 1,441-record gap is the missing VOKA_UCL_SECURITY_BATCH_004.jsonl artifact, which must not be reconstructed.

## Experiments

| ID | Status | Base model | Dataset | Method | Engine | Worker | Training run | Package | Evaluation | Readiness | Engine deps (resolved/total) | Promotion target | Promotable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GHARIBO-exp-001 | EXPERIMENT | openai/gpt-oss-20b | GHARIBO-Research-Gold-v0.1 | QLoRA + SFT | Unsloth Core | KaggleTrainingWorker | — | — | NOT_RUN | READY_FOR_ENV_QUALIFICATION | 0/12 | GHARIBO-V0.1 | false |

- **GHARIBO-exp-001 promotion blocked:** Promotion requires at least one evaluation result and a training-run reference; neither exists.
- **GHARIBO-exp-001 references:** docs/MODEL_REGISTRY.md, docs/TRAINING_STRATEGY.md

## Models

**Base model candidates**

| ID | Role | Status | Derived models | Note |
| --- | --- | --- | --- | --- |
| openai/gpt-oss-20b | INITIAL_BASE_MODEL_CANDIDATE | CANDIDATE | GHARIBO-exp-001 | Initial candidate only — NOT the permanent foundation. No promotion without evaluation. |

**Derived models**

| ID | Status | Note |
| --- | --- | --- |
| GHARIBO-exp-001 | EXPERIMENT | Registered as an EXPERIMENT only. No training run, no evaluation. |
| GHARIBO-V0.1 | NOT_CREATED | Reserved name. Cannot be created without evaluation and promotion (ADR-0008). |

## Approved Roadmap

**Status: APPROVED_DIRECTION.** Recorded here as approved direction. NOTHING beyond the current milestone is executed or scheduled.

| ID | Name | Status | Method | Dataset | Purpose | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| STAGE-1 | GHARIBO-exp-001 | NOT_STARTED | QLoRA + SFT using Unsloth | GHARIBO-Research-Gold-v0.1 (current 800 verified Gold examples) | establish a measurable baseline, teach structured evidence-grounded behaviour, schema adherence, provenance discipline, evidence to entity to relation construction, no-fabrication behaviour | — |
| STAGE-2 | UCL FACTORY CHALLENGE | PLANNED | After successful exp-001 evaluation, ask GHARIBO to produce approximately 300-500 NEW candidate records from a domain/system not clearly represented in the training examples. | New candidate records from an under-represented domain (CANDIDATE until verified) | outputs remain CANDIDATE records until verified, validate identity, schema, evidence, provenance, relations, duplicates, unsupported claims and hallucinations, measure whether GHARIBO learned the PROCESS rather than memorized examples | STAGE-1 |
| STAGE-3 | GHARIBO-Research-Gold-v0.2 | PLANNED | Built primarily from failures, hard cases, boundary cases, verified new generations, human-approved corrections and validator-approved difficult examples. | GHARIBO-Research-Gold-v0.2 | grow the dataset from difficulty, not volume, explicitly NOT volume for its own sake | STAGE-2 |
| STAGE-4 | PREFERENCE TRAINING | PLANNED | Generate multiple candidate outputs; use deterministic validators, evidence verification, judge evaluation and selective human review to create CHOSEN vs REJECTED; evaluate DPO or ORPO. | Preference pairs derived from validated candidate outputs | create CHOSEN vs REJECTED pairs, evaluate DPO ORPO, do not commit to one method until benchmark evidence exists | STAGE-3 |
| STAGE-5 | GHARIBO-exp-003 | PLANNED | GRPO / RLVR. Build the GHARIBO-UCL-Verifier Environment. Core principle: DO NOT ONLY TEACH GHARIBO THE ANSWER — CREATE A REAL ENVIRONMENT WITH SOURCES, RULES, VERIFIERS AND REWARDS. | Verifier environment over sources, rules, verifiers and rewards | record the reward dimensions: schema validity, source validity, evidence fidelity, entity identity correctness, normalization correctness, relation integrity, provenance completeness, duplicate avoidance, unsupported-claim avoidance, hallucinated-field avoidance, correct abstention / NEEDS_REVIEW, record the severe penalties: fabricated evidence, fabricated fields, invented supplier relationships, broken provenance, unsupported authorization claims, false commercial facts | STAGE-4 |
| STAGE-6 | AGENTIC TRAINING | FUTURE | Future tool ecosystem may include Firecrawl, Hugging Face, GitHub, MCP tools, Verifiers, Atropos and controlled browser/search tools. | Tool-interaction trajectories (future) | future agentic tool ecosystem, controlled browser/search tools | STAGE-5 |
| STAGE-7 | CAPABILITY SPECIALIZATION | FUTURE | Potential separate capability adapters, with a future runtime that may route tasks to specialized adapters/models. | Per-capability datasets (future) | potential separate capability adapters: Research / Knowledge Factory, Coding, VOKA Commercial, Engineering, Vision / Document Intelligence, do NOT implement now, the future runtime may route tasks to specialized adapters/models | STAGE-6 |

## Knowledge Graph

| Field | Value |
| --- | --- |
| Status | APPROVED_DIRECTION_NOT_IMPLEMENTED |
| ADR | docs/adr/ADR-0015-universal-commercial-procurement-knowledge-graph.md |
| Name | Universal Commercial + Procurement Knowledge Graph |
| Is a product catalog | false |
| Supported subject types | PRODUCT, SERVICE, ORGANIZATION |
| Concepts | CATEGORY, DOMAIN, SYSTEM, MANUFACTURER, BRAND, PRODUCT_FAMILY, PRODUCT_MODEL, ITEM, SERVICE, ORGANIZATION, SOURCE, EVIDENCE, RELATION, MARKET_RELEVANCE |
| Organization durable identity | ORGANIZATION |
| Organization note | SUPPLIER / CONTRACTOR / DISTRIBUTOR are contextual ROLES, not mutually-exclusive company identities. |
| Organization roles | MANUFACTURER, DISTRIBUTOR, DEALER, SUPPLIER, CONTRACTOR, SUBCONTRACTOR, SYSTEM_INTEGRATOR, SERVICE_PROVIDER, MAINTENANCE_PROVIDER |
| Multiple roles allowed | true |
| Relation types | MANUFACTURES, BRANDS, DISTRIBUTES, DEALS_IN, SUPPLIES, INSTALLS, INTEGRATES, SUBCONTRACTS, SERVICES, MAINTAINS, AUTHORIZED_FOR, CERTIFIED_FOR, CAPABLE_OF, OPERATES_IN, SERVES_MARKET, SUPPORTS, RELATED_TO |
| Relation targets | CATEGORY, DOMAIN, SYSTEM, BRAND, PRODUCT_FAMILY, PRODUCT_MODEL, ITEM, SERVICE, GEOGRAPHY |
| Relation attributes | evidence, provenance, sourceUrl, sourceReference, confidence, observedAt, validFrom, validUntil, geography, scope, lifecycle, status, verificationState |
| Evidence first-class | true |
| Relatively stable knowledge | organization identity, manufacturer identity, brand ownership, product identity, capabilities, system classifications, service categories, supported geographies, verified role relationships |
| Time-sensitive commercial data | current price, stock availability, lead time, MOQ, payment terms, quotation validity, current contact person, current dealer status, current authorization status, current freight, current market pricing |
| Time-sensitive policy | Time-sensitive commercial data must NOT be treated as permanent model truth. It belongs in a live database, governed observation records, RAG, search, tools and supplier quotation history. GHARIBO learns HOW TO DISCOVER AND VERIFY, not memorize. |
| Generation lifecycle | GHARIBO_GENERATION, CANDIDATE, SCHEMA_VALIDATION, IDENTITY_DUPLICATE_CHECK, SOURCE_EVIDENCE_CHECK, RELATION_INTEGRITY_CHECK, ACCEPTED, NEEDS_REVIEW, REJECTED, GOVERNED_KNOWLEDGE_GRAPH |
| Generated is never Gold | true |
| Self-improvement flywheel | INITIAL_GOLD_DATA, GHARIBO_TRAINING, GHARIBO_GENERATES_CANDIDATES, VERIFIERS_EVIDENCE_HUMAN_REVIEW, ACCEPTED_KNOWLEDGE, HARD_VALUABLE_TRAINING_EXAMPLES, NEXT_GHARIBO_VERSION |
| Self-training guardrail | GHARIBO MUST NOT blindly train on its own outputs; self-generated data must pass independent verification to prevent model collapse and self-reinforcement of errors. |

## Procurement Intelligence

| Field | Value |
| --- | --- |
| Status | APPROVED_DIRECTION_NOT_IMPLEMENTED |
| ADR | docs/adr/ADR-0015-universal-commercial-procurement-knowledge-graph.md |
| Authorization claim policy | Never claim a company is authorized unless supported by suitable evidence. |

**Supported questions**

- Who supplies this product?
- Who distributes this brand?
- Who installs this system?
- Who maintains it?
- Which companies operate in Kuwait?
- Which companies serve GCC markets?
- Which organizations are authorized?
- Which contractors are capable of this system?
- Which service companies provide this service?

**Relation patterns**

| From | Relation | To |
| --- | --- | --- |
| PRODUCT | SUPPLIED_BY | ORGANIZATION |
| BRAND | DISTRIBUTED_BY | ORGANIZATION |
| SYSTEM | INTEGRATED_BY | ORGANIZATION |
| SYSTEM | INSTALLED_BY | ORGANIZATION |
| SERVICE | PROVIDED_BY | ORGANIZATION |
| SYSTEM | MAINTAINED_BY | ORGANIZATION |

**Private internal intelligence**

| Field | Value |
| --- | --- |
| Visibility | PRIVATE_INTERNAL |
| Separated from public evidence | true |
| Never public | true |
| Dimensions | quotation response speed, price competitiveness, delivery performance, documentation quality, rejection history, dispute history, responsiveness, payment-term history, previous PO history, project performance |

## VOKA Integration

| Field | Value |
| --- | --- |
| Boundary | AI Gateway |
| ADR | docs/adr/ADR-0016-voka-gharibo-integration-boundary.md |
| Status | APPROVED_DIRECTION_NOT_IMPLEMENTED |
| Statement | VOKA and GHARIBO integrate only across an explicit AI Gateway boundary. VOKA's private commercial and transaction history stays private and must never flow into GHARIBO's public knowledge surface. |

**Procurement flow**

1. IDENTIFY_NEED
2. DISCOVER_CANDIDATE_ORGANIZATIONS
3. VERIFY_ROLES_AND_CAPABILITY
4. VERIFY_AUTHORIZATION_EVIDENCE
5. REQUEST_QUOTATION
6. COMPARE_RESPONSES
7. SELECT_AND_RECORD_OBSERVATION

**Who to ask — the two questions**

| Question | Basis |
| --- | --- |
| WHO COULD / SHOULD WE ASK? | stable knowledge graph + public evidence |
| WHO DID WE ASK, WHAT DID THEY QUOTE, HOW DID THEY PERFORM? | private internal procurement intelligence |

The public knowledge graph answers who COULD or SHOULD be asked. The private internal record answers who WAS asked and how they performed. The two must never be conflated or merged.

## Tools / Connectors

| Field | Value |
| --- | --- |
| Status | PLANNED_OPTIONAL |
| Policy | Keep internal interfaces provider-neutral. GHARIBO must not become dependent on a proprietary connector. |

| ID | Purpose | Status |
| --- | --- | --- |
| firecrawl | future commercial web research / crawling / structured evidence extraction | PLANNED |
| github | source/code/governance operations | CONNECTED |
| huggingface | models / datasets / research / future artifact workflows | PLANNED |
| mcp | future agentic tool interface | PLANNED |

## Security / IP

| Field | Value |
| --- | --- |
| Policy | PUBLIC SOURCE CODE DOES NOT MEAN PUBLIC INTELLIGENCE. |
| Public repository | voltixsec/Gharibo |
| Repository rule | The public repository must NEVER accidentally contain any of the private assets above. |
| Master state rule | The master state contains architecture and governance only — never confidential business data, secrets or dataset payloads. |

**Must remain private**

- training datasets
- private Gold examples
- private evaluation sets
- TEST data
- adapters
- LoRA weights
- checkpoints
- fine-tuned GHARIBO weights
- internal prompts
- internal reward functions where commercially sensitive
- supplier intelligence
- procurement graph
- supplier performance
- VOKA transaction history
- private benchmarks
- commercial observations
- API keys
- credentials
- secrets

## Key Decisions

| ID | Date | Title | Status | ADR |
| --- | --- | --- | --- | --- |
| DEC-0001 | 2026-09-14 | Next.js Route Handlers as the application backend | ACCEPTED | `docs/adr/ADR-0001-nextjs-route-handlers-as-backend.md` |
| DEC-0002 | 2026-09-14 | SQLite + better-sqlite3 behind a Repository Pattern | ACCEPTED | `docs/adr/ADR-0002-sqlite-better-sqlite3-repository-pattern.md` |
| DEC-0003 | 2026-09-14 | One provider abstraction with interchangeable backends | ACCEPTED | `docs/adr/ADR-0003-single-provider-abstraction.md` |
| DEC-0004 | 2026-09-14 | Store provider credentials by reference, never as values | ACCEPTED | `docs/adr/ADR-0004-credentials-by-reference.md` |
| DEC-0005 | 2026-09-14 | Training is launch-ready only in Milestone 1 | ACCEPTED | `docs/adr/ADR-0005-training-launch-ready-only.md` |
| DEC-0006 | 2026-09-14 | npm workspaces monorepo with a shared types package | ACCEPTED | `docs/adr/ADR-0006-npm-workspaces-monorepo.md` |
| DEC-0007 | 2026-09-14 | Data Factory as an explicit pipeline state machine | ACCEPTED | `docs/adr/ADR-0007-data-factory-pipeline-state-machine.md` |
| DEC-0008 | 2026-09-14 | Gate model promotion through registry statuses | ACCEPTED | `docs/adr/ADR-0008-model-registry-status-gates.md` |
| DEC-0009 | 2026-09-14 | Restrict CORS on Python services to an explicit allow-list | ACCEPTED | `docs/adr/ADR-0009-python-service-cors-allowlist.md` |
| DEC-0010 | 2026-09-14 | Root scripts delegate to workspaces; Next.js pinned at the repo root | ACCEPTED | `docs/adr/ADR-0010-root-scripts-delegate-to-workspaces.md` |
| DEC-0011 | 2026-09-14 | Provider-neutral TrainingWorker abstraction with Kaggle as Worker #1 | ACCEPTED | `docs/adr/ADR-0011-training-worker-abstraction.md` |
| DEC-0012 | 2026-09-14 | The canonical Training Package as the portable training contract | ACCEPTED | `docs/adr/ADR-0012-canonical-training-package.md` |
| DEC-0013 | 2026-09-14 | Content-addressed immutable dataset versions with deterministic hashed splits | ACCEPTED | `docs/adr/ADR-0013-content-addressed-dataset-versions.md` |
| DEC-0014 | 2026-09-14 | Zero-cost artifact policy — optional private HF, local fallback, never GitHub | ACCEPTED | `docs/adr/ADR-0014-zero-cost-artifact-policy.md` |
| DEC-0015 | 2026-09-14 | Zero monetary cost training policy (CEO mandate) | ACCEPTED | `docs/adr/ADR-0011-training-worker-abstraction.md` |
| DEC-0016 | 2026-09-14 | Initial 800-example gold split cut at seed 3407 | SUPERSEDED | — |
| DEC-0017 | 2026-09-14 | Audit-aware deterministic gold split at seed 20260914 | ACCEPTED | `docs/adr/ADR-0013-content-addressed-dataset-versions.md` |
| DEC-0018 | 2026-09-14 | Universal Commercial + Procurement Knowledge Graph as the library architecture | ACCEPTED | `docs/adr/ADR-0015-universal-commercial-procurement-knowledge-graph.md` |
| DEC-0019 | 2026-09-14 | VOKA ↔ GHARIBO integration boundary behind an AI Gateway | ACCEPTED | `docs/adr/ADR-0016-voka-gharibo-integration-boundary.md` |
| DEC-0020 | 2026-09-14 | GHARIBO Master State as the canonical single source of truth | ACCEPTED | `docs/adr/ADR-0017-master-state-single-source-of-truth.md` |

## Validation

| ID | Command | Asserts |
| --- | --- | --- |
| build | `npm run build` | Next.js production build |
| docs:validate | `npm run docs:validate` | documentation governance + master state validation |
| lint | `npm run lint` | ESLint |
| master:generate | `npm run master:generate` | regenerates docs/GHARIBO_MASTER_STATE.md from the canonical JSON |
| master:validate | `npm run master:validate` | master state integrity (schema, sections, references, consistency, markdown sync, privacy) |
| qualify:check | `npm run qualify:check` | qualification notebook + harness drift and training-free safety |
| test | `npm test` | vitest suite |
| typecheck | `npm run typecheck` | TypeScript |
| verify:m2 | `npm run verify:m2 -- --check` | docs:facts metrics match the source tree |
| verify:m3a | `npm run verify:m3a` | Milestone 3A/3B gate runner |

**Required before commit:** `master:generate`, `master:validate`, `docs:validate`, `verify:m2`, `verify:m3a`, `qualify:check`, `typecheck`, `lint`, `test`, `build`

| Field | Value |
| --- | --- |
| Last verified checkpoint | 386be838327f6a7e22e7ced074c5c482b80158bc |
| Last verified at | 2026-09-14 |
| Note | results are recorded by QA after a full gate run; this section must never claim a gate that was not actually executed. |

**Recorded results**

| Gate | Command | Status | Exit code | Evidence | Verified at | Environment limitation |
| --- | --- | --- | --- | --- | --- | --- |
| master:generate | npm run master:generate | PASS | 0 | unchanged: docs/GHARIBO_MASTER_STATE.md (357 lines); output byte-stable across two consecutive runs (sha256 21590b51a598436314f1b535fbb171e4ca6d7992164463d5f70eed3c812ae011) | 2026-09-14 | — |
| master:validate | npm run master:validate | PASS | 0 | 18/18 checks PASS (json, schema, sections, decision-ids, decision-status, roadmap, experiment-refs, model-refs, dataset-refs, consistency, training-invariant, markdown, secrets, privacy, machine-paths, adr-link, supersession, references) | 2026-09-14 | — |
| docs:validate | npm run docs:validate | PASS | 0 | documentation governance PASSED (38 markdown + 2 diagram docs, 17 ADRs, facts api_route_files=36/api_handlers=53/sqlite_tables=17/dashboard_pages=11/adrs=17, 23 register docs) followed by master state 18/18 PASS | 2026-09-14 | — |
| verify:m2 | npm run verify:m2 -- --check | PASS | 0 | docs:facts block matches the source tree (api_route_files=36, api_handlers=53, sqlite_tables=17, dashboard_pages=11, adrs=17) | 2026-09-14 | — |
| verify:m3a | npm run verify:m3a | PASS | 0 | 54 check(s) passed; 0 NOT_APPLICABLE; 3 PENDING_EXTERNAL_EXECUTION (real Kaggle GPU run required); 0 FAIL | 2026-09-14 | — |
| qualify:check | npm run qualify:check | PASS | 0 | harness matches package.ts and conforms to qualification contract (13 cells, content address 7fe6b0e11889212de990eaad2ac4c35de685ef544d430cf23a0d11bd96a0ed44) | 2026-09-14 | — |
| typecheck | npm run typecheck | PASS | 0 | tsc --noEmit completed with no errors (apps/web) | 2026-09-14 | — |
| lint | npm run lint | PASS | 0 | next lint: No ESLint warnings or errors | 2026-09-14 | — |
| test | npm test | PASS | 0 | 153/153 tests passed across 4 files (smoke 47, m2-workers 26, m2-training 51, m2-repositories 29) | 2026-09-14 | — |
| build | npm run build | PASS | 0 | Next.js production build: Compiled successfully; Generating static pages (31/31) | 2026-09-14 | false |

## Blockers

| ID | Status | Title | Detail | Blocks | References |
| --- | --- | --- | --- | --- | --- |
| BLK-0001 | OPEN | Free-Kaggle T4 qualification run required | The 12 pinned engine dependency versions are unresolved (resolvedVersion = null by design — never fabricate) and no qualification hash exists. A real free-Kaggle T4 run is required. | STAGE-1 | docs/ENV_QUALIFICATION_CONTRACT.md, docs/TRAINING_STRATEGY.md |

## Next Actions

| ID | Priority | Action | Requires | References |
| --- | --- | --- | --- | --- |
| ACT-0001 | P0 | Run the qualification notebook on a free Kaggle T4 session to resolve the 12 pinned engine dependency versions and produce the qualification hash. | CTO authorization | docs/ENV_QUALIFICATION_CONTRACT.md |
| ACT-0002 | P0 | Freeze the engine dependency set (architecture §15 O3) once the qualification hash exists. | ACT-0001 | docs/ARCHITECTURE.md |
| ACT-0003 | P1 | Begin STAGE-1 (GHARIBO-exp-001) only after the environment is qualified and training is explicitly authorized. | ACT-0001, ACT-0002, CTO authorization | docs/MODEL_REGISTRY.md |

## History

| Revision | Date | Summary | Commit | Commit status |
| --- | --- | --- | --- | --- |
| 1.0.0 | 2026-09-14 | Established the GHARIBO master state, the deterministic generator/validator pair, and the approved Universal Commercial + Procurement Knowledge Graph direction (ADR-0015..ADR-0017). | — | PENDING_CHECKPOINT |

**1.0.0 — changes**
- added governance/GHARIBO_MASTER_STATE.json
- added scripts/master/generate-master-state.mjs
- added scripts/master/validate-master-state.mjs
- added docs/GHARIBO_MASTER_STATE.md (generated)
- added ADR-0015, ADR-0016, ADR-0017
- added DEC-0001..DEC-0020
- recorded the post-training roadmap STAGE-1..STAGE-7
- A commit SHA cannot be embedded in the commit that contains it; the SHA is recorded in the next master-state revision.
- Training executed: false
