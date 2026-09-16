# GHARIBO Master State

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Governance |
| **Status** | Living |
| **Version** | 1.15.0 |
| **Last Updated** | 2026-09-15 |

> **GENERATED FILE — DO NOT EDIT BY HAND.** This document is deterministically generated
> from [`governance/GHARIBO_MASTER_STATE.json`](../governance/GHARIBO_MASTER_STATE.json) by
> `scripts/master/generate-master-state.mjs`. The JSON is the single source of truth; this file
> is a read-only human view. Regenerate it with `npm run master:generate` and verify it with
> `npm run master:validate`.

---

## Current State

| Field | Value |
| --- | --- |
| Training status | COMPLETED |
| Training invariant | TRAINING COMPLETED — EXPERIMENTAL ADAPTER ONLY; NO MODEL PROMOTION AND NO EVALUATION CLAIM |
| Current milestone | M3C (COMPLETE) |
| Blocker summary | DEC-0032 authorized exactly one governed held-out TEST benchmark (AUTHORIZED WITH LIMITS, CEO, 2026-09-15), closing BLK-0003; the RESEARCH_BENCHMARK.md 3.5 leakage audit PASSED (TRAIN∩TEST=0, VALIDATION∩TEST=0, AUDIT∩TEST=0). BLK-0004 (no GPU execution environment) was opened by DEC-0033 and is now CLOSED: the kernel generator was repaired and gated, and a governed Kaggle T4 route was established. DEC-0034 launched the benchmark, which FAILED pre-inference on a further harness defect (NameError in cell 1, no TEST record read); DEC-0035 repaired three defect classes and RELAUNCHED, which is the same single authorized execution restarted rather than a second one. The kernel is RUNNING and no score exists: every M1-M13 value is null, evaluation stays NOT_RUN with evaluationResults 0. From DEC-0035 onward no further relaunch is permitted without a new human decision. Training stays COMPLETED, the adapter stays EXPERIMENTAL, and GHARIBO-V0.1 stays NOT_CREATED. |
| Dataset | GHARIBO-Research-Gold-v0.1 |
| Example count | 800 |
| Split seed | 20260914 |
| Split (train / validation / test) | 640 / 80 / 80 |
| Audit cohort (size / pass / needs review / fail / TEST audited) | 100 / 100 / 0 / 0 / 0 |

## Architecture

| Field | Value |
| --- | --- |
| Frozen baseline | docs/ARCHITECTURE.md v1.2.1 (Frozen) |
| Frozen baseline extends | docs/ARCHITECTURE_MILESTONE_2.md |
| Decision records | docs/adr/ |
| Decision record count | 20 |
| Verified facts block | docs/ARCHITECTURE.md#docs:facts |
| Backend | Next.js Route Handlers (ADR-0001) |
| Persistence | SQLite + better-sqlite3 behind a Repository Pattern (ADR-0002) |
| Monorepo | npm workspaces (ADR-0006) |
| Python services | FastAPI ML services, CORS allow-list (ADR-0009) |
| Master state artifact | governance/GHARIBO_MASTER_STATE.json |

## Training

| Field | Value |
| --- | --- |
| Status | COMPLETED |
| Has started | true |
| Invariant | TRAINING COMPLETED — EXPERIMENTAL ADAPTER ONLY; NO MODEL PROMOTION AND NO EVALUATION CLAIM |
| Engine | Unsloth Core (unsloth-core) — Measured freeze applied from the CTO-accepted Kaggle v6 qualification. torch/triton remain environment-preserved Kaggle runtime facts; triton_kernels remains conditional on the preserved path. |
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
| Weights downloaded | true |
| Adapters produced | 1 |
| Checkpoints produced | 2 |
| Evaluation results | 0 |
| Environment qualification | QUALIFIED |
| Qualification hash | 6d15bcf5ff7b120f34c7cb968eab196be285ad92b4ad2e76c44412360113dcc0 |
| Package preview | PREVIEW_ONLY |
| Authorization status | EVALUATION_AUTHORIZED_AWAITING_EXECUTION |
| Authorization decision | DEC-0025 |
| Authorized code snapshot | ad1e011c55729f5447b324d35b4ad88d0a47d10f |
| Authorized preview package ID | f11e9c8eeac34888b3ca6679348093cd3a96a46fb95fd42ef3dd36cf8b18709c |
| Issuance status | ISSUED_DRAFT |
| Issued package ID | 78dd1bf374ed1c53785ea50bf179b1b7a4764d40c121d3d41cda4e2a2e3e68f2 |
| Issued run ID | ea6e30f2-ce26-4323-b35a-3436ee867eaf |
| Issued run status | DRAFT |
| Issuance receipt hash | 878b961f03ba069b82b4eb82530e7ebdfa4f8644ab159beff0a9adc7935f99bd |
| Issuance receipt execution authorized | false |
| Execution authorization status | EXECUTION_AUTHORIZED_QUEUED |
| Execution authorization decision | DEC-0026 |
| Execution authorization hash | 8c089dd9c6967dd33c32f64128bc7e939e8019a27c2428897c23156a075d07bf |
| Execution authorized | true |
| Kaggle start authorized | false |
| Execution started | false |
| Kaggle start authorization | KAGGLE_START_AUTHORIZED |
| Kaggle start decision | DEC-0027 |
| Kaggle start authorization hash | 4bb2d0b2d38ddd39ce85277c5806838a162620970adf07a6d52844ccf7b2734f |
| Launch bundle hash | fec22ca290645035fc807f3cc6dec40c5f26389b18f490e932c4bd05e31cb4c0 |
| Launch notebook hash | f849aa41a8c4affbaae9b4e0d5cf049d14c818df3289619eba8b0a1471e33ddf |
| Kaggle start authorized | true |
| Launch attempted | false |
| Kaggle launch repair status | KAGGLE_LAUNCH_REPAIRED_AUTHORIZED |
| Kaggle launch repair decision | DEC-0028 |
| Kaggle launch repair authorization hash | 4dbbed5874ff54de9b7ffe1c57dd135d654e665828ee5a3b590d7efe2cb5f851 |
| Repaired launch bundle hash | 4380da6382a1484ed41388661057c4a9c1c60f7ae34d612380a4b6f36da21230 |
| Repaired launch notebook hash | be4af0d4f9a492e7c6b5a2b713b205e17adf7d34d0d0f62aaf1589977cec54ba |
| Superseded launch bundle hash | fec22ca290645035fc807f3cc6dec40c5f26389b18f490e932c4bd05e31cb4c0 |
| Superseded launch notebook hash | f849aa41a8c4affbaae9b4e0d5cf049d14c818df3289619eba8b0a1471e33ddf |
| Kaggle launch reauthorization status | KAGGLE_LAUNCH_REAUTHORIZED |
| Kaggle launch reauthorization decision | DEC-0029 |
| Kaggle launch reauthorization hash | ec78b2678d0f764b026246806c9e4b3e15d2c241084ec401ef24afc08e051e5b |
| Reauthorized launch bundle hash | b3b4efc8f4b4c04eedd8610b6b4cdb479817d638e971ce8e8c9b67079d587efb |
| Reauthorized launch notebook hash | dda3b050034afa0922bda573565ff8f678767e62a944a01d597761aec254b4b1 |
| Reauthorization superseded bundle hash | 4380da6382a1484ed41388661057c4a9c1c60f7ae34d612380a4b6f36da21230 |
| Reauthorization superseded notebook hash | be4af0d4f9a492e7c6b5a2b713b205e17adf7d34d0d0f62aaf1589977cec54ba |
| Staged install repair dependency set changed | false |
| Staged install repair declared specs unchanged | true |
| Launch attempts recorded | 2 |
| Launch attempt 1 external status | KernelWorkerStatus.ERROR |
| Launch attempt 1 root cause | DEPENDENCY_INSTALL_FAILURE_WITH_DIAGNOSTIC_SUPPRESSED |
| Launch attempt 2 external status | KernelWorkerStatus.ERROR |
| Launch attempt 2 root cause | FROZEN_SET_RESOLVER_UNSATISFIABLE_IN_SINGLE_TRANSACTION |
| Authorized recipe hash | c2360979bf3de8d91a01ec1c9fe792acc7207ba25a20a94c610fa7084c7fdcdd |
| Candidate recipe hash | c2360979bf3de8d91a01ec1c9fe792acc7207ba25a20a94c610fa7084c7fdcdd |
| Historical preview evidence package ID | 3bbe5626119fa5f8d58a362f722775a0cc3a5a019e8bc5a5324bb033cb1faa76 |
| Historical preview evidence Git commit | 29efdff8c337d280fd845cdd4a6b7ffd5b03e6a7 |
| Preview evidence working tree dirty | true |
| Preview evidence byte-identical builds | 2 |
| Qualification accepted by CTO | true |
| Engine freeze | unsloth-freeze-2026.09.15 (applied) |
| Executed harness content address | 8dc7b26363b82b25522ebcfa128da6cccdbbc3699aed65bb0ae3e60d4d9ee50a |
| Post-freeze harness content address | e7ff550c0c2e174a20a52d0a8f64ac78356cb63e4b699fb5b1e5ea92d1eb80dc |
| Experiment authorized | true |

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
| GHARIBO-exp-001 | EXPERIMENT | openai/gpt-oss-20b | GHARIBO-Research-Gold-v0.1 | QLoRA + SFT | Unsloth Core | KaggleTrainingWorker | ea6e30f2-ce26-4323-b35a-3436ee867eaf | 78dd1bf374ed1c53785ea50bf179b1b7a4764d40c121d3d41cda4e2a2e3e68f2 | NOT_RUN | EVALUATION_AUTHORIZED_AWAITING_EXECUTION | 9/12 | GHARIBO-V0.1 | false |

- **GHARIBO-exp-001 promotion blocked:** Training completed, but promotion requires at least one real evaluation result and none exists. Training completion is not model promotion (ADR-0008).
- **GHARIBO-exp-001 references:** docs/MODEL_REGISTRY.md, docs/TRAINING_STRATEGY.md

## Models

**Base model candidates**

| ID | Role | Status | Derived models | Note |
| --- | --- | --- | --- | --- |
| openai/gpt-oss-20b | INITIAL_BASE_MODEL_CANDIDATE | CANDIDATE | GHARIBO-exp-001 | Initial candidate only — NOT the permanent foundation. No promotion without evaluation. |

**Derived models**

| ID | Status | Note |
| --- | --- | --- |
| GHARIBO-exp-001 | EXPERIMENT | Registered as an EXPERIMENT. A real training run has completed (Kaggle kernel version 3, KernelWorkerStatus.COMPLETE) and an adapter exists, but no evaluation has run, so it is not promoted. |
| GHARIBO-V0.1 | NOT_CREATED | Reserved name. Cannot be created without evaluation and promotion (ADR-0008). Training completion alone does not create it. |

## Approved Roadmap

**Status: APPROVED_DIRECTION.** Recorded here as approved direction. NOTHING beyond the current milestone is executed or scheduled.

| ID | Name | Status | Method | Dataset | Purpose | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| STAGE-1 | GHARIBO-exp-001 | IN_PROGRESS | QLoRA + SFT using Unsloth | GHARIBO-Research-Gold-v0.1 (current 800 verified Gold examples) | establish a measurable baseline, teach structured evidence-grounded behaviour, schema adherence, provenance discipline, evidence to entity to relation construction, no-fabrication behaviour | — |
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
| DEC-0021 | 2026-09-14 | Real model-compatibility qualification before the engine freeze | ACCEPTED | `docs/adr/ADR-0018-real-model-compatibility-qualification.md` |
| DEC-0022 | 2026-09-14 | CTO governance corrections: TRAIN-ONLY fixture, generic GPU, output hygiene, no auto-freeze | ACCEPTED | `docs/adr/ADR-0018-real-model-compatibility-qualification.md` |
| DEC-0023 | 2026-09-15 | Accept Kaggle v6 qualification and apply the measured engine freeze | ACCEPTED | `docs/adr/ADR-0018-real-model-compatibility-qualification.md` |
| DEC-0024 | 2026-09-15 | Governed physical Gold package preview with explicit candidate recipe | ACCEPTED | `docs/adr/ADR-0019-governed-gold-package-preview.md` |
| DEC-0025 | 2026-09-15 | Explicitly authorize GHARIBO-exp-001 for immutable package and run issuance | ACCEPTED | `docs/adr/ADR-0019-governed-gold-package-preview.md` |
| DEC-0026 | 2026-09-15 | Authorize the exact issued GHARIBO-exp-001 run for QUEUED execution preparation | ACCEPTED | — |
| DEC-0027 | 2026-09-15 | Authorize the exact queued GHARIBO-exp-001 run for Kaggle start | SUPERSEDED | — |
| DEC-0028 | 2026-09-15 | Repair the governed Kaggle launch artifact and re-authorize a single retry | SUPERSEDED | — |
| DEC-0029 | 2026-09-15 | Stage the governed Kaggle install and re-authorize a single retry | ACCEPTED | — |
| DEC-0030 | 2026-09-15 | Accept the completed GHARIBO-exp-001 Kaggle execution and record the fp16→float32 runtime deviation | ACCEPTED | — |
| DEC-0031 | 2026-09-15 | Accept ADR-0020 and amend the Frozen Milestone 1 specifications to reflect the executed GHARIBO-exp-001 run | ACCEPTED | `docs/adr/ADR-0020-post-execution-truth-reconciliation.md` |
| DEC-0032 | 2026-09-15 | Authorize exactly one governed held-out TEST benchmark for GHARIBO-exp-001 | ACCEPTED | — |
| DEC-0033 | 2026-09-16 | Record the infrastructure blocker that prevented the DEC-0032 governed held-out TEST benchmark from executing | ACCEPTED | — |
| DEC-0034 | 2026-09-16 | Launch the DEC-0032 governed held-out TEST benchmark on the Kaggle T4 route, and record its pre-inference harness failure | ACCEPTED | — |
| DEC-0035 | 2026-09-16 | Repair the evaluation-harness defect classes and relaunch the kernel within the existing DEC-0032 authorization | ACCEPTED | — |

## Validation

| ID | Command | Asserts |
| --- | --- | --- |
| build | `npm run build` | Next.js production build |
| build:dec0030 | `node scripts/training/build-dec0030-acceptance.mjs --check` | the DEC-0030 acceptance record is byte-identical to its deterministic generator output |
| docs:validate | `npm run docs:validate` | documentation governance + master state validation |
| lint | `npm run lint` | ESLint |
| master:generate | `npm run master:generate` | regenerates docs/GHARIBO_MASTER_STATE.md from the canonical JSON |
| master:validate | `npm run master:validate` | master state integrity (schema, sections, references, consistency, markdown sync, privacy) |
| qualify:check | `npm run qualify:check` | qualification notebook + harness drift and training-free safety |
| test | `npm test` | vitest suite |
| typecheck | `npm run typecheck` | TypeScript |
| verify:m2 | `npm run verify:m2 -- --check` | docs:facts metrics match the source tree |
| verify:m3a | `npm run verify:m3a` | Milestone 3A/3B gate runner |
| verify:result | `python scripts/training/verify-kaggle-result.py` | the downloaded GHARIBO-exp-001 result matches CHECKSUMS.sha256 and recomputes the rollup (requires the private local result directory) |

**Required before commit:** `master:generate`, `master:validate`, `docs:validate`, `verify:m2`, `verify:m3a`, `qualify:check`, `typecheck`, `lint`, `test`, `build`, `build:dec0030`

| Field | Value |
| --- | --- |
| Last verified checkpoint | 4d6c9fcd6e46af92ca1ef400bbffe7b71d68e0a3 |
| Last verified at | 2026-09-15 |
| Note | results are recorded by QA after a full gate run; this section must never claim a gate that was not actually executed. |

**Recorded results**

| Gate | Command | Status | Exit code | Evidence | Verified at | Environment limitation |
| --- | --- | --- | --- | --- | --- | --- |
| master:generate | npm run master:generate | PASS | 0 | Regenerated docs/GHARIBO_MASTER_STATE.md from the canonical JSON; masterStateVersion=1.11.0, updatedAt=2026-09-15, 30 decisions, 7 roadmap stages. | 2026-09-15 | — |
| master:validate | npm run master:validate | PASS | 0 | 19 checks PASS: 21 top-level sections in order, DEC-0001..DEC-0030 gapless, post-training execution invariants PASS (completion evidence real and coherent, TEST isolated, fp16->float32 deviation recorded, both failed attempts preserved, no evaluation or promotion claimed), generated Markdown byte-identical, secrets/privacy/machine-paths/references PASS. | 2026-09-15 | — |
| docs:validate | npm run docs:validate | PASS | 0 | Documentation governance PASSED: 40 markdown + 2 diagram documents, 19 ADRs, docs:facts metrics consistent (api_route_files=36, api_handlers=53, sqlite_tables=17, dashboard_pages=11, adrs=19), register versions match each document header (Master State 1.11.0). | 2026-09-15 | — |
| verify:m2 | npm run verify:m2 -- --check | PASS | 0 | Milestone 2 metrics verified: api_route_files=36, api_handlers=53, sqlite_tables=17, dashboard_pages=11, adrs=19. | 2026-09-15 | — |
| verify:m3a | npm run verify:m3a | PASS | 0 | 65 PASS / 0 NOT_APPLICABLE / 1 PENDING_EXTERNAL_EXECUTION / 0 FAIL. Gate 12 was updated for the accepted completion: it now asserts the DEC-0030 acceptance hash (recomputed identical), post-training artifact acceptance (rollup 788bc0a77d465bcbc997e8698177fbd90c9e8e2720e549159a27684095284885, 129/130 verified, 0 mismatches), the truthful fp16->float32 runtime deviation, no auto-promotion and NOT_RUN evaluation. Only benchmark evaluation remains pending: a real adapter now exists but held-out TEST evaluation is not authorized. | 2026-09-15 | — |
| qualify:check | npm run qualify:check | PASS | 0 | Post-freeze qualification harness matches package.ts and contract v1.5.0 / artifact schema 1.1.0; 16 cells; 78 user-defined functions; engine_version=unsloth-freeze-2026.09.15; content address=e7ff550c0c2e174a20a52d0a8f64ac78356cb63e4b699fb5b1e5ea92d1eb80dc. | 2026-09-15 | — |
| typecheck | npm run typecheck | PASS | 0 | TypeScript tsc --noEmit completed successfully. | 2026-09-15 | — |
| lint | npm run lint | PASS | 0 | Next.js ESLint completed with no warnings or errors. | 2026-09-15 | — |
| test | npm test | PASS | 0 | Vitest: 11 test files, 230/230 tests passed (including the new DEC-0030 execution-acceptance and post-training lifecycle suites). | 2026-09-15 | — |
| build | npm run build | PASS | 0 | Next.js 14.2.35 production build compiled successfully; type/lint validation passed; 31/31 static pages generated; BUILD_ID pOXHhLltYfY5te-KN5oGA. Note: the first attempt in this session was interrupted by the WorkBuddy sandbox bulk-delete guard while Next removed its own .next/export directory; the build was re-run into a fresh .next and completed normally. No source change was required. | 2026-09-15 | false |
| build:dec0030 | npm run build:dec0030 | PASS | 0 | governance/DEC-0030-kaggle-execution-acceptance.json is up to date; acceptanceHash=06194e95c22b07a4c433154f627f20f515dbb43100e7615885345f6b0cb0c647. | 2026-09-15 | — |
| verify:result | npm run verify:result | PASS | 0 | Downloaded GHARIBO-exp-001 result: 130 manifest entries, 129 verified, 0 mismatches, rollup recomputed over the full manifest = 788bc0a77d465bcbc997e8698177fbd90c9e8e2720e549159a27684095284885 (matches declared). __notebook__.ipynb is Kaggle's internal executed-notebook copy: not served by the authenticated output API and not a model artifact; its declared hash still participates in the rollup. Requires the private local result directory. | 2026-09-15 | — |

## Blockers

| ID | Status | Title | Detail | Blocks | References |
| --- | --- | --- | --- | --- | --- |
| BLK-0001 | CLOSED | Free-Kaggle v6 qualification completed and CTO-accepted | CLOSED 2026-09-15. Qualification artifact 6d15bcf5ff7b120f34c7cb968eab196be285ad92b4ad2e76c44412360113dcc0 is QUALIFIED with two independent fresh passes IDENTICAL and active-runtime alignment IDENTICAL. The measured engine freeze unsloth-freeze-2026.09.15 has been applied. This closure does not authorize training. | STAGE-1 | docs/ENV_QUALIFICATION_CONTRACT.md, docs/TRAINING_STRATEGY.md |
| BLK-0002 | CLOSED | gpt-oss-20b model compatibility measured successfully | CLOSED 2026-09-15. openai/gpt-oss-20b loaded on the real free Kaggle GPU through the intended 4-bit QLoRA path; tokenizer/Harmony, adapter init, batch collation and one forward-only no_grad pass succeeded. Parameter digest remained 951055a91551d1d442d45f342a33ba3bfbb0efe500b8cc7c41ca0cf6a61a6331; TEST was not accessed; no training primitive executed and output hygiene passed. | STAGE-1 | docs/ENV_QUALIFICATION_CONTRACT.md, docs/adr/ADR-0018-real-model-compatibility-qualification.md |
| BLK-0003 | CLOSED | Held-out TEST evaluation authorization obtained | CLOSED 2026-09-15 by DEC-0032. The CEO authorized ONE governed held-out TEST benchmark with the decision AUTHORIZED WITH LIMITS, scoped to BASE inference, CANDIDATE inference, M1-M13 measurement and required access logging, and explicitly forbidding training, tuning, selection, promotion, dataset mutation and second-pass optimization. The docs/RESEARCH_BENCHMARK.md 3.5 leakage audit subsequently PASSED (TRAIN∩TEST=0, VALIDATION∩TEST=0, AUDIT∩TEST=0, hash reproduction exact), which is the second and final condition for parsing TEST. This closure authorizes measurement only - it does not record a score and does not authorize promotion; GHARIBO-V0.1 stays NOT_CREATED. | STAGE-2 | docs/EVALUATION_AUTHORIZATION_REQUEST.md, docs/EVALUATION.md, docs/RESEARCH_BENCHMARK.md, governance/DEC-0032-evaluation-authorization.json, governance/EVALUATION-LEAKAGE-AUDIT.json, governance/DEC-0030-kaggle-execution-acceptance.json |
| BLK-0004 | CLOSED | No GPU execution environment available for the authorized held-out TEST benchmark | OPENED 2026-09-16 by DEC-0033, CLOSED 2026-09-16. The blocker was the absence of a GPU execution environment and an unrepaired kernel generator. Both halves were resolved: the generator defects were repaired and gated (commit b29c043, extended by DEC-0035), and a governed Kaggle T4 route was established with a PRIVATE prompts-only dataset. DEC-0034 then launched the benchmark; that launch failed pre-inference on a further harness defect and is recorded as such. DEC-0035 repaired that defect and relaunched, which is the SAME single authorized execution restarted, not a second one. No TEST inference had occurred at the time this blocker was closed, and no metric value exists. From DEC-0035 onward no further relaunch is permitted without a new human decision. | STAGE-1 | docs/EVALUATION_EXECUTION_BLOCKER.md, docs/EVALUATION_BENCHMARK_LAUNCH.md, governance/DEC-0033-evaluation-infrastructure-blocker.json, governance/DEC-0034-evaluation-benchmark-launch.json, governance/DEC-0035-evaluation-kernel-relaunch.json |

## Next Actions

| ID | Priority | Action | Requires | References |
| --- | --- | --- | --- | --- |
| ACT-0001 | P0 | Retrieve the held-out TEST benchmark result for the in-flight Kaggle kernel vokaigharibo/gharibo-eval-001-fec22ca2 (ONE execution, BASE then CANDIDATE over the same 80 TEST records). Wait for it to leave RUNNING, then download predictions-base.jsonl, predictions-candidate.jsonl and run-record.json; verify the adapter sha256 and base revision against the accepted values; score BOTH arms locally with scripts/eval/score-arm.mjs against held-out gold; register the REAL M1-M13 values for both arms with their factual deltas and evidence hashes. If the kernel fails, record a FAILED EXECUTION truthfully - do NOT re-run, because a further attempt now requires a NEW human decision. Do NOT promote on the result: promotion is a separate governance act and GHARIBO-V0.1 must stay NOT_CREATED in this task. | DEC-0032 | docs/EVALUATION.md, docs/RESEARCH_BENCHMARK.md, docs/EVALUATION_BENCHMARK_LAUNCH.md, governance/DEC-0032-evaluation-authorization.json, governance/DEC-0034-evaluation-benchmark-launch.json, governance/DEC-0035-evaluation-kernel-relaunch.json, scripts/eval/score-arm.mjs |
| ACT-0002 | P1 | Declare the effective dtype honestly (float32) for any future run, or re-qualify fp32 explicitly instead of inheriting a declared fp16 that the engine overrides. | DEC-0030 | docs/TRAINING_STRATEGY.md, scripts/training/build-dec0030-acceptance.mjs |

## History

| Revision | Date | Summary | Commit | Commit status |
| --- | --- | --- | --- | --- |
| 1.0.0 | 2026-09-14 | Established the GHARIBO master state, the deterministic generator/validator pair, and the approved Universal Commercial + Procurement Knowledge Graph direction (ADR-0015..ADR-0017). | — | PENDING_CHECKPOINT |
| 1.1.0 | 2026-09-14 | Milestone 3C: upgraded the qualification harness from dependency-only to real model-compatibility qualification. The generated notebook now loads openai/gpt-oss-20b on a free-Kaggle T4, verifies tokenizer and OpenAI Harmony against a real GHARIBO example, initialises QLoRA adapters, collates one batch and runs a single forward-only dry run under no_grad - proving by sha256 parameter digest that no parameter is updated (ADR-0018, DEC-0021). | — | PENDING_CHECKPOINT |
| 1.2.0 | 2026-09-14 | CTO governance corrections to the M3C qualification harness: TRAIN-ONLY fixture (only train.jsonl attached), generic GPU detection (no hardcoded T4 x2), output hygiene guard, and no auto-freeze enforcement. Bumped harness to v2.1.0 and contract doc to v1.4.0. | — | PENDING_CHECKPOINT |
| 1.3.0 | 2026-09-15 | M3C closure: accepted the real Kaggle v6 qualification artifact, applied the measured engine freeze, recorded qualification provenance and safety evidence, closed the two environment/model-compatibility blockers, and moved GHARIBO-exp-001 to qualified-but-not-authorized. Training has not started. | — | PENDING_CHECKPOINT |
| 1.4.0 | 2026-09-15 | Bridge A+B3: explicit candidate recipe, physical Gold policy and deterministic in-memory package preview. TEST remains hash-integrity-only. Training and authorization remain closed. | — | PENDING_CHECKPOINT |
| 1.5.0 | 2026-09-15 | Explicit GHARIBO-exp-001 authorization checkpoint: bound package/run issuance to the verified code snapshot, deterministic preview, recipe, qualification, engine freeze and Gold identities. No package/run was issued and training remains NOT_STARTED. | — | PENDING_CHECKPOINT |
| 1.6.0 | 2026-09-15 | Executed DEC-0025 issuance authorization: persisted exactly one immutable GHARIBO-exp-001 Training Package and one linked DRAFT Training Run, independently reopened and verified them, and retained a separate execution-authorization boundary. | — | PENDING_CHECKPOINT |
| 1.7.0 | 2026-09-15 | Accepted DEC-0026 execution authorization for the exact issued GHARIBO-exp-001 package/run. Authorized DRAFT to QUEUED only while retaining a hard separate boundary before RUNNING/Kaggle start. | — | PENDING_CHECKPOINT |
| 1.8.0 | 2026-09-15 | Accepted DEC-0027 Kaggle Start authorization for the exact QUEUED GHARIBO-exp-001 run and the safe content-addressed launch notebook. Training remains NOT_STARTED until real Kaggle execution evidence is observed. | — | PENDING_CHECKPOINT |
| 1.11.0 | 2026-09-15 | Post-execution acceptance: DEC-0030 accepted the completed GHARIBO-exp-001 execution on the DEC-0029 artifact (Kaggle kernel version 3, KernelWorkerStatus.COMPLETE) and recorded the fp16→float32 runtime deviation instead of hiding it. Training state moved to COMPLETED, artifacts were registered, TEST isolation was re-proven, and evaluation stayed NOT_RUN with no model promotion. | — | PENDING_CHECKPOINT |
| 1.12.0 | 2026-09-15 | Documentation and validator reconciliation: ADR-0020 accepted (DEC-0031). The obsolete "TRAINING HAS NOT STARTED" validator invariant was replaced with post-execution invariants; docs/MODEL_REGISTRY.md and docs/TRAINING_STRATEGY.md gained additive v1.4.0 notes (fp16-only T4 assumption corrected to float32); docs/ROADMAP.md STAGE-1 moved NOT_STARTED -> IN_PROGRESS; docs/ARCHITECTURE.md moved to v1.2.1 for the adrs fact 19 -> 20. No evaluation, no promotion. | — | PENDING_CHECKPOINT |
| 1.13.0 | 2026-09-15 | Evaluation authorization recorded. DEC-0032 captures the CEO decision AUTHORIZED WITH LIMITS for exactly one governed held-out TEST benchmark, closes BLK-0003 through that decision, and moves evaluation to EVALUATION_AUTHORIZED_AWAITING_EXECUTION. The RESEARCH_BENCHMARK.md 3.5 leakage audit PASSED before any TEST parse. No score is claimed: evaluation has not executed, the adapter stays EXPERIMENTAL and GHARIBO-V0.1 stays NOT_CREATED. | — | PENDING_CHECKPOINT |

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

**1.1.0 — changes**
- added ADR-0018 (real model-compatibility qualification)
- added DEC-0021
- bumped docs/ENV_QUALIFICATION_CONTRACT.md to v1.3.0 (artifact schema 1.1.0): new sections 13 and 14, validation rules 19-24
- extended scripts/qualify/qualify-kaggle-env.mjs to harness v2.0.0 (16 cells) and regenerated the notebook
- extended scripts/qualify/check-qualify-harness.mjs with the model-compatibility contract checks and a dataset-content scan
- strengthened verify-m3a Gate 13 (22 forbidden training shapes; positive model-compatibility assertions)
- added the dataset version and split hashes to the canonical master state
- refreshed scripts/qualify/README.md for the v2.0.0 harness
- bumped docs/ARCHITECTURE.md to v1.1.3 (adrs 17 -> 18)
- added BLK-0002 (model compatibility unmeasured until the Kaggle run executes)
- A commit SHA cannot be embedded in the commit that contains it; the SHA is recorded in the next master-state revision.
- Training executed: false

**1.2.0 — changes**
- added DEC-0022 (CTO governance corrections)
- bumped harness_version from 2.0.0 to 2.1.0
- bumped docs/ENV_QUALIFICATION_CONTRACT.md from v1.3.0 to v1.4.0
- changed dataset.expected_split_files from 3 files to ["train.jsonl"] only (TRAIN-ONLY fixture)
- added qualification_fixture_source, test_data_accessed to inventory and model_compatibility
- replaced hardcoded T4 x2 with generic GPU (T4 or better) in error messages and README
- extended PROBE_SOURCE to detect all GPUs (gpu_models, vram_per_gpu, total_visible_vram, multi_gpu_available)
- added gpu_count, gpu_models, vram_per_gpu, total_visible_vram, multi_gpu_used_by_loader to environment and model_compatibility
- added output hygiene guard (FORBIDDEN_OUTPUTS check, output_hygiene_verified field)
- added auto_freeze_applied=false and experiment_authorized=false to model_compatibility
- updated Section 13 report Next step to say STOP - CTO inspection required
- updated Section 14 final summary with new fields and no-auto-freeze language
- updated BLK-0002 to mention TRAIN-ONLY fixture and no auto-freeze
- refreshed scripts/qualify/README.md for v2.1.0 harness
- A commit SHA cannot be embedded in the commit that contains it; the SHA is recorded in the next master-state revision.
- Training executed: false

**1.3.0 — changes**
- accepted Kaggle v6 qualification hash 6d15bcf5ff7b120f34c7cb968eab196be285ad92b4ad2e76c44412360113dcc0
- recorded executed harness content address 8dc7b26363b82b25522ebcfa128da6cccdbbc3699aed65bb0ae3e60d4d9ee50a
- recorded post-freeze harness content address e7ff550c0c2e174a20a52d0a8f64ac78356cb63e4b699fb5b1e5ea92d1eb80dc
- applied engine freeze unsloth-freeze-2026.09.15
- recorded 9 package-resolved dependencies / 12 governed dependency entries
- closed BLK-0001 and BLK-0002
- added DEC-0023
- set M3C milestoneStatus=COMPLETE
- kept training status NOT_STARTED and experimentAuthorized=false
- This governance revision is being validated on the working tree; the checkpoint SHA is recorded after commit.
- Training executed: false

**1.4.0 — changes**
- added ADR-0019 and DEC-0024
- extended package schema to 1.1.0 with legacy identity preservation
- locked candidate recipe and source policy defaults
- added two-build in-memory preview and execution/persistence rejection
- kept experiment packageId/trainingRunId null and trainingAuthorized=false
- The containing commit cannot embed its own SHA. Stored preview evidence references baseline HEAD with workingTreeDirty=true; recompute after checkpoint for the clean-commit identity.
- Training executed: false

**1.5.0 — changes**
- added DEC-0025 explicit issuance authorization
- authorized code snapshot ad1e011c55729f5447b324d35b4ad88d0a47d10f
- authorized preview package identity f11e9c8eeac34888b3ca6679348093cd3a96a46fb95fd42ef3dd36cf8b18709c
- authorized recipe hash c2360979bf3de8d91a01ec1c9fe792acc7207ba25a20a94c610fa7084c7fdcdd
- set GHARIBO-exp-001 trainingAuthorized=true
- kept packageId/trainingRunId null
- kept training execution NOT_STARTED
- The authorization commit cannot be its own authorized executable snapshot. DEC-0025 intentionally authorizes snapshot ad1e011c55729f5447b324d35b4ad88d0a47d10f; the containing governance checkpoint receives a later Git SHA.
- Training executed: false

**1.6.0 — changes**
- issued package 78dd1bf374ed1c53785ea50bf179b1b7a4764d40c121d3d41cda4e2a2e3e68f2
- issued DRAFT run ea6e30f2-ce26-4323-b35a-3436ee867eaf
- persisted immutable DEC-0025 receipt
- verified package/run after database reopen
- kept executionAuthorized=false
- kept executionStarted=false
- kept training status NOT_STARTED
- The issued package remains bound to the authorized executable snapshot ad1e011c55729f5447b324d35b4ad88d0a47d10f. This later governance/code commit records issuance and does not replace that authorized snapshot.
- Training executed: false

**1.7.0 — changes**
- authorized package 78dd1bf374ed1c53785ea50bf179b1b7a4764d40c121d3d41cda4e2a2e3e68f2
- authorized run ea6e30f2-ce26-4323-b35a-3436ee867eaf
- execution authorization hash 8c089dd9c6967dd33c32f64128bc7e939e8019a27c2428897c23156a075d07bf
- authorized DRAFT to QUEUED only
- kept Kaggle start unauthorized
- kept executionStarted=false
- kept training status NOT_STARTED
- DEC-0026 does not change the authorized executable snapshot or the immutable DEC-0025 package/issuance receipt.
- Training executed: false

**1.8.0 — changes**
- start authorization 4bb2d0b2d38ddd39ce85277c5806838a162620970adf07a6d52844ccf7b2734f
- launch bundle fec22ca290645035fc807f3cc6dec40c5f26389b18f490e932c4bd05e31cb4c0
- notebook f849aa41a8c4affbaae9b4e0d5cf049d14c818df3289619eba8b0a1471e33ddf
- TEST payload excluded
- Kaggle start authorized
- executionStarted=false
- training status NOT_STARTED
- This checkpoint authorizes Kaggle submission only; it does not itself constitute external execution evidence.
- Training executed: false

**1.11.0 — changes**
- added DEC-0030 post-execution acceptance
- added governance/DEC-0030-kaggle-execution-acceptance.json (acceptanceHash 06194e95c22b07a4c433154f627f20f515dbb43100e7615885345f6b0cb0c647)
- added scripts/training/build-dec0030-acceptance.mjs (deterministic generator + --check drift mode)
- added scripts/training/verify-kaggle-result.py (read-only result verification)
- recorded real training evidence: 640 examples, 1 epoch, 160 steps, train_loss 0.6016419500112533, train_runtime 4041.9648s
- recorded effective dtype float32 against declared fp16 as MATERIAL_RUNTIME_DEVIATION_ACCEPTED_POST_EXECUTION
- resolved the parameter-count presentation as a 4-bit packed-storage accounting difference, not a model identity mismatch
- re-proved TEST isolation (train/validation uploaded, test=ABSENT, HASH_INTEGRITY_ONLY)
- kept evaluation NOT_RUN and GHARIBO-V0.1 NOT_CREATED
- preserved attempts 1 and 2 as ERROR-before-training; DEC-0030 supersedes nothing
- The containing commit cannot embed its own SHA. DEC-0030's acceptance hash is content-addressed over the acceptance body and is stable independent of the commit.
- Training executed: true

**1.12.0 — changes**
- added ADR-0020 Truthful post-execution reconciliation without promotion
- added DEC-0031 to the master state
- bumped docs/ARCHITECTURE.md 1.2.0 -> 1.2.1 and the adrs fact 19 -> 20
- bumped docs/MODEL_REGISTRY.md 1.3.0 -> 1.4.0 with an additive post-execution note
- bumped docs/TRAINING_STRATEGY.md 1.3.0 -> 1.4.0 and corrected the fp16-only T4 assumption
- bumped docs/ROADMAP.md 1.2.0 -> 1.3.0; STAGE-1 NOT_STARTED -> IN_PROGRESS
- bumped docs/adr/README.md 1.3.0 -> 1.4.0
- bumped PROJECT_STATE.md 1.1.0 -> 1.2.0 and removed the stale no-training-has-been-executed claims
- replaced the obsolete TRAINING HAS NOT STARTED validator invariant with post-execution invariants
- added a roadmap STAGE-1 / training status consistency invariant so this class of contradiction is caught automatically
- The containing commit cannot embed its own SHA. DEC-0030's acceptance hash is content-addressed over the acceptance body and is stable independent of the commit.
- Training executed: true

**1.13.0 — changes**
- added DEC-0032 evaluation authorization (authorizationHash 079afeb7088d0f731cb4175986a4d2ad7f3d35346046aac24ce57f8e6d5b3a96)
- added governance/DEC-0032-evaluation-authorization.json (deterministic generator + --check drift mode)
- added governance/EVALUATION-LEAKAGE-AUDIT.json and scripts/eval/leakage-audit.py (RESEARCH_BENCHMARK.md 3.5 audit, hash/ID-only)
- closed BLK-0003 through DEC-0032 only
- evaluation EVALUATION_READY_AWAITING_AUTHORIZATION -> EVALUATION_AUTHORIZED_AWAITING_EXECUTION
- completed the docs/EVALUATION_AUTHORIZATION_REQUEST.md decision block truthfully
- kept evaluationStatus NOT_RUN, evaluationResults 0, GHARIBO-V0.1 NOT_CREATED
- This checkpoint authorizes measurement. It records no score and does not constitute an evaluation result.
- Training executed: true
