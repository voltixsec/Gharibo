# Changelog

| Field | Value |
|-------|-------|
| **Document Owner** | Delivery (GHARIBO AI LAB) |
| **Type** | Delivery note |
| **Status** | Living |
| **Version** | 1.0.0 |
| **Last Updated** | 2026-09-14 |

All notable changes to GHARIBO AI LAB are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Entries are grouped by
milestone; a milestone is only listed as released once it is committed and pushed.

---

## [Unreleased]

### Governance — GHARIBO Master State & Universal Commercial + Procurement Knowledge Graph

**Status: documentation/governance only. No training executed. No model weights downloaded.**

#### Added

- `governance/GHARIBO_MASTER_STATE.json` — the canonical, machine-readable single source of
  truth for the project (schemaVersion `1.0.0`): project, current state, architecture references,
  governance, the decision log DEC-0001..DEC-0020, the approved post-training roadmap
  STAGE-1..STAGE-7, training, datasets, experiments, models, the Universal Commercial +
  Procurement Knowledge Graph direction, procurement intelligence, tools/connectors, security/IP,
  validation, blockers, next actions and history.
- `scripts/master/generate-master-state.mjs` — a deterministic generator (Node builtins only) that
  renders `docs/GHARIBO_MASTER_STATE.md` from the canonical JSON, with `--check` drift detection.
- `scripts/master/validate-master-state.mjs` — the integrity validator: schema/sections, decision-id
  and status rules, roadmap statuses, experiment/model/dataset references, current-state
  consistency, the "training has not started" invariant, byte-exact Markdown sync (it imports the
  generator's render function), a secret scan, private-dataset exposure, machine-path and
  supersession checks.
- `docs/GHARIBO_MASTER_STATE.md` — the generated human view (never hand-edited).
- ADR-0015 — Universal Commercial + Procurement Knowledge Graph as the library architecture.
- ADR-0016 — VOKA ↔ GHARIBO integration boundary behind an AI Gateway.
- ADR-0017 — GHARIBO Master State as the canonical single source of truth.
- DEC-0001..DEC-0020 — the durable decision log.
- The approved post-training roadmap STAGE-1..STAGE-7 (approved direction only; nothing scheduled).

#### Changed

- `package.json` — added `master:generate` and `master:validate`; `docs:validate` now runs
  `validate-docs.mjs` followed by `validate-master-state.mjs` (non-circular — the master validator
  never calls `docs:validate`).
- `docs/DOCUMENT_REGISTER.md` — v1.2.0 → v1.3.0; registered the master state (canonical +
  generated) and ADR-0015..ADR-0017; updated the `docs/ARCHITECTURE.md`, `docs/ROADMAP.md` and
  `PROJECT_STATE.md` rows, and aligned the `docs/adr/README.md` row to v1.1.0.
- `docs/ARCHITECTURE.md` — v1.1.1 → v1.1.2; the machine-checked `docs:facts` `adrs` fact moved
  14 → 17 (ADR-0015..ADR-0017); nothing else in the frozen baseline changed.
- `docs/ROADMAP.md` — v1.1.0 → v1.2.0; added the approved post-training roadmap
  (STAGE-1..STAGE-7) as direction, not scheduled work.
- `PROJECT_STATE.md` — v1.0.0 → v1.1.0; corrected the frozen-baseline snapshot row to v1.1.2 and
  added a Master State section.

#### Notes

- **No training executed, no model weights downloaded, no gold example content modified, the
  accepted M3B split and dataset hash are unchanged, and this change is documentation/governance
  only.**

### Milestone 3B — Split Integrity, Split-Aware Audit and Qualification Safety

**Status: in progress. No training executed. No model weights downloaded.**

#### Added

- `scripts/split/cut-gold-split.py` — committed, audit-aware deterministic split generator (seed
  `20260914`). Quarantines the 100-example audit cohort into TRAIN + VALIDATION so
  **audited ∩ TEST = 0**. Writes `train/validation/test.jsonl` and updates `dataset-card.json`
  (new seed, new hashes, `supersededSplits`, `splitProvenance`). Deterministic: two runs are
  byte-identical.
- `scripts/gold_cohort.py` — the shared, single definition of the 100-example audit cohort, imported
  by both the split generator and the audit so they cannot drift.
- `verify:m3a` **Gate 13 — qualification safety (static)**: the generated qualification notebook
  must contain no training primitive.
- `qualification_safety` block in `env-qualification.json` (contract §13), computed from runtime
  tripwires + a parameter-digest comparison.

#### Changed

- `scripts/audit/gold_audit_100.py` — split-aware: loads the current splits, audits TRAIN +
  VALIDATION only, records a per-example `split`, hard-fails if any audited example is in TEST, and
  emits a `splitIsolation` block. artifactVersion `1.0.0 → 1.1.0`; the wall-clock `createdAt` was
  removed so the artifact is deterministic.
- `scripts/qualify/qualify-kaggle-env.mjs` — new Section 5b arms runtime tripwires (optimizer
  constructor/step, scheduler constructors, tensor/autograd backward, accelerate backward) and
  asserts `QUALIFICATION_ONLY is True`; Section 10 emits `qualification_safety`. Notebook
  regenerated.
- `scripts/qualify/check-qualify-harness.mjs` — `FORBIDDEN_TOKENS` extended with the training
  primitives; contract checks added for §13.
- `docs/ENV_QUALIFICATION_CONTRACT.md` — v1.1.0 → v1.2.0; new §13 Qualification Safety.
- `docs/DATA_FACTORY.md` — v1.3.0 → v1.4.0; snapshot disclosure, TEST-split supersession and the
  split-aware audit.
- `docs/DOCUMENT_REGISTER.md` — v1.1.0 → v1.2.0; register rows updated.
- `overview.md` — restored the 5-field governance metadata header (it had been overwritten with the
  M3A report, breaking `docs:validate`).
- `PROJECT_STATE.md` — M3B disclosure: snapshot, TEST-split supersession, split-aware audit,
  qualification safety.

#### Fixed

- **`docs:validate` FAIL** — `overview.md` had lost its governance metadata header.
- **TEST contamination** — the seed-3407 TEST split contained 10 of 100 audited examples; the split
  was superseded by the audit-aware cut.

#### Notes

- No gold example content was modified. The dataset hash is unchanged (`84acad9b…`).
- No training executed; no model weights downloaded.

### Milestone 3A — Training Readiness

**Status: READY_FOR_ENV_QUALIFICATION — dataset built, deps pinned, gates pass. No training executed.**

Milestone 3A autonomous work session completed Sections A–H of the CTO-authorized scope.
The earlier conclusion that "UCL never existed" has been corrected: historical UCL production
artifacts existed externally and have now been physically supplied to `data/raw/legacy-ucl/`.

#### Added

- **Section A — Source artifact forensics:** 8 legacy UCL files forensically analyzed (byte size,
  SHA-256, line/record count, JSON/JSONL parse validity, entity-type distribution, external key
  uniqueness, duplicate-line count, source/evidence linkage, relation referential integrity, master-
  state reconciliation). Immutable source manifest created at
  `data/derived/source-manifests/legacy-ucl-source-manifest-v001.json`. 18,646 total records,
  0 parse errors, 0 duplicate lines, 0 broken relation references.
- **Section B — Gold dataset quality filter:** 14,444 ACCEPTED_GOLD / 4,043 ACCEPTED_SUPPORTING /
  2 REJECTED / 157 NEEDS_REVIEW. Rejection reasons recorded. Acceptance criteria enforced:
  parse-valid, valid entity type, deterministic identity, required fields, provenance, evidence,
  no unsupported claim, no broken relation, no ambiguous taxonomy, no fabricated content.
- **Section C — Training examples:** 800 examples in OpenAI Harmony format (system/user/assistant),
  teaching the UCL extraction process (source→understand→extract→classify→normalize→relate→ground→
  validate→structured output). No invented chain-of-thought. Balanced across 11 entity types.
- **Section D — Dataset version `GHARIBO-Research-Gold-v0.1`:** 640 train / 80 validation / 80 test,
  all pairwise disjoint. Deterministic seeded split (seed=3407, 80/10/10). TEST permanently held out.
  Dataset hash, split hashes, source manifest hash, transformation version, provenance map, dataset card.
- **Section E — Dependency freeze (6→12):** Promoted peft, trl, datasets, accelerate, bitsandbytes,
  openai-harmony into `PINNED_ENGINE_DEPENDENCIES`. No floating git branches, no `>=` ranges in freeze.
  `resolvedVersion: null` for all — real versions require a Kaggle T4 run.
- **Section F — `verify-m3a.mjs`:** 12 gates, 51 checks PASS, 0 FAIL, 3 PENDING_EXTERNAL_EXECUTION.
  Gates: dataset integrity, split overlap, deterministic regeneration, secret scan, Training Package
  hash reproduction, source artifact integrity, deterministic dataset regeneration, provenance coverage,
  notebook drift, documentation facts, no fabricated benchmark results, Kaggle-dependent gates.
  `verify:m3a` and `verify:all` npm scripts added.
- **Section G — Benchmark:** 13 metric definitions, Base=NOT_RUN, Candidate=NOT_RUN. No fabricated scores.
- **Section H — `GHARIBO-exp-001` readiness package:** Status READY_FOR_ENV_QUALIFICATION. References
  git SHA, base revision, dataset, hashes, config, Harmony format, qualification requirements, eval config.
- A runnable **Kaggle environment qualification harness** — detects the free GPU / CUDA / VRAM /
  compute capability, installs the training stack via `uv`, resolves the exact working versions and
  git SHAs, verifies a fresh environment reproduces the set, and emits a machine-readable freeze
  manifest that pastes into `PINNED_ENGINE_DEPENDENCIES`. **No version is pre-filled.**
- **Benchmark metric definitions** for the held-out TEST split (schema validity, extraction,
  classification, evidence fidelity, unsupported-claim rate, duplicate handling, relation accuracy,
  instruction following, structured-output reliability). Definitions only — **no scores exist**;
  BASE vs CANDIDATE remain `NOT_RUN` until a real execution produces them.
- The **dependency-freeze contract** (the schema the harness emits, compatible with the M2
  `EngineDependency` type and the `snake_case` manifest wire format).

#### Corrected

- **Earlier UCL conclusion:** The statement that "UCL never existed" was incorrect. The local VOKA DB
  is a dev/demo DB (empty of historical data). Historical UCL production artifacts existed externally
  and have now been physically supplied to `data/raw/legacy-ucl/`. PROJECT_STATE.md and this CHANGELOG
  have been updated to reflect the correction.

#### Changed

- `PROJECT_STATE.md` — Milestone 3A status updated to READY_FOR_ENV_QUALIFICATION (§1, §3.1).
  Earlier UCL conclusion corrected. §7.4 governance obligations discharged.
- `apps/web/lib/training/package.ts` — `PINNED_ENGINE_DEPENDENCIES` promoted 6→12 (added peft, trl,
  datasets, accelerate, bitsandbytes, openai-harmony). `triton_kernels` spec carries `#subdirectory=`
  fragment.
- `scripts/qualify/qualify-kaggle-env.mjs` — `UNPINNED_QUALIFICATION_ENTRIES` emptied (5 deps promoted
  to pinned). Install detail added for 6 new deps. `EXTRA_INVENTORY` is now empty.
- `scripts/qualify/check-qualify-harness.mjs` — `REQUIRED_PINNED` expanded to 12. `REQUIRED_ADDITIONAL`
  and `REQUIRED_HARMONY_CANDIDATES` emptied.
- `package.json` — `verify:m3a` and `verify:all` scripts added.

---

### Milestone 2 — Zero-Cost Training Pipeline

**Status: complete and pushed (`5e286c6`, `9735fe4`).** Infrastructure to prepare the first official
experiment (`GHARIBO-exp-001`) without executing it. No training has been run; no weights
downloaded.

#### Added

- `docs/PRD_MILESTONE_2.md` — M2 product requirements (Approved v1.0.0).
- `docs/ARCHITECTURE_MILESTONE_2.md` — M2 incremental architecture (Frozen v1.0.0): the
  `TrainingWorker` interface, the canonical Training Package contract, content-addressed dataset
  versions, and the zero-cost artifact policy.
- ADR-0011 — Provider-neutral `TrainingWorker` abstraction with Kaggle as Worker #1.
- ADR-0012 — The canonical Training Package as the portable, reproducible training contract.
- ADR-0013 — Content-addressed immutable dataset versions with deterministic hashed splits.
- ADR-0014 — Zero-cost artifact policy: optional private Hugging Face, local fallback, never
  GitHub.
- `PROJECT_STATE.md` — the living record of where the project actually is.
- `CHANGELOG.md` — this file.

**Training contract (shared types, `packages/shared/src/types/`)**

- `training-package.ts` — the canonical Training Package type (ADR-0012).
- `training-worker.ts` — the provider-neutral `TrainingWorker` contract (ADR-0011).
- Extended `dataset.ts` (`SplitName` / `SplitHashes` / `SplitPolicy` / `DatasetVersionStatus`),
  `training-run.ts` (`INTERRUPTED` / `RESUMABLE` + engine/checkpoint/worker/package fields),
  `experiment.ts` (package/manifest/provenance), `data-factory.ts`.

**Training library (`apps/web/lib/training/`)**

- `hash.ts`, `canonical.ts` — canonical SHA-256 hashing (order-independent dataset hash).
- `split.ts` — deterministic seeded TRAIN / VALIDATION / TEST splits.
- `harmony.ts` — record → OpenAI Harmony conversation mapping.
- `package.ts`, `validate.ts` — canonical Training Package builder and validator.
- `export.ts` — package assembly, git-commit resolution, provenance, bundle assembly.
- `zip.ts` — deterministic store-only ZIP writer.

**Training worker (`apps/web/lib/workers/`)**

- `index.ts` — `TrainingWorker` interface, registry, `getTrainingWorker` factory.
- `kaggle/` — `KaggleTrainingWorker` (Worker #1): a 16-cell notebook template covering hardware
  detection, VRAM budget gate, pinned `uv` engine install, version verification, dataset/split
  hash verification, Harmony formatting, gpt-oss 4-bit load, Unsloth QLoRA config, checkpointed
  training, automatic resume, adapter/trainer-state/metrics/manifest export, `CHECKSUMS.sha256`,
  and optional **private** HF upload via Kaggle Secrets (token read by name, never printed).

**Persistence & API**

- 4 new tables: `training_packages`, `dataset_splits`, `training_artifacts`, `training_run_events`
  (17 total); `ensureColumn` migration for the new `training_runs` columns.
- New repositories: `training-packages` (idempotent content-addressed create), `dataset-splits`,
  `training-artifacts`, `training-run-events`.
- 8 new API routes: `training-packages`, `training-packages/[id]`,
  `training-packages/[id]/export`, `training-runs/[id]/resume`,
  `training-runs/[id]/import-results`, `datasets/[id]/splits`, `data-factory/[id]/transition`,
  `training-workers` (36 route files / 53 handlers total).
- **Server-side enforcement**: model-registry promotion and Data Factory Gold Pipeline transitions
  are now rejected in the repository layer, not just the UI.

**Training page UX**

- New run-detail page (`/training/[runId]`) and components: dataset-version selector, config
  inspector, package-export panel, resilience panel, run-detail (11 dashboard pages total).

**Verification**

- `scripts/verify-m2.mjs` + `npm run verify:m2` — recomputes the M2 metrics and (with `--check`)
  strictly compares them against the `docs:facts` block.

#### Changed

- `docs/ARCHITECTURE.md` — bumped v1.0.0 → v1.1.0 (M2 is additive; nothing in the M1 baseline is
  invalidated). Added a pointer to the M2 architecture document and the four new ADRs. The
  `docs:facts` block is updated to the real post-M2 counts: `api_route_files=36`,
  `api_handlers=53`, `sqlite_tables=17`, `dashboard_pages=11`, `adrs=14`.
- `docs/TRAINING_STRATEGY.md` — v1.0.0 → v1.1.0; added the authoritative "Compute & Cost Policy
  (Zero-Cost)" section (Kaggle T4, Unsloth Core, `openai/gpt-oss-20b`, T4 = fp16-only hardware
  reality, the nine free-tier resilience requirements).
- `docs/ROADMAP.md` — v1.0.0 → v1.1.0; M2 re-scoped to the actual training-preparation work and
  M3+ re-planned under the zero-cost policy.
- `docs/MODEL_REGISTRY.md` — v1.0.0 → v1.1.0; corrected the promotion-gating claim (M1 enforced
  it in the UI only; M2 adds repository-level enforcement) and documented the `GHARIBO-exp-001`
  lineage (`derived from openai/gpt-oss-20b`, EXPERIMENT only).
- `docs/DATA_FACTORY.md` — v1.0.0 → v1.1.0; documented the additive M2 changes (optional
  `reasoning` field, `pipeline_updated_at`, server-side Gold Pipeline transition enforcement).
- `docs/DOCUMENT_REGISTER.md` — registered the two M2 documents, `PROJECT_STATE.md`,
  `CHANGELOG.md`, and ADR-0011..ADR-0014 (16 → 20 governed rows).
- `docs/adr/README.md` — index now lists ADR-0001..ADR-0014.
- `scripts/validate-docs.mjs` — the governed root-document set now includes `PROJECT_STATE.md`
  and `CHANGELOG.md`.
- `apps/web/lib/preflight.ts` — honours an explicit `dataset_id` via a local dataset-version check.
- `apps/web/lib/db/repositories/datasets.ts` — `getSplits` now returns a canonical total order
  (`ORDER BY split_name, record_line_hash, record_id`) and `cutVersion`'s fresh-cut path reads back
  through it, so the fresh-cut, content-addressed-dedupe, and bundle-re-assembly paths all emit
  **byte-identical** `dataset/*.jsonl` — and therefore identical per-file SHA-256 in
  `CHECKSUMS.sha256` — for the same immutable package. Without this, a re-assembled bundle could
  carry different checksums than the one built originally, weakening the artifact-integrity and
  resume guarantees (ADR-0012).
- `apps/web/app/api/training-runs/[id]/route.ts` — PATCH now routes through the guarded status
  transition and accepts the M2 `INTERRUPTED` / `RESUMABLE` states.

#### Notes

- **Zero-cost policy (binding).** Training must operate at zero monetary cost. Kaggle Notebooks
  (free T4) is the primary worker; Hugging Face private storage is optional within the free
  allowance; GitHub holds source and docs only.
- **No fabrication.** No datasets, benchmarks, or metrics have been invented. Milestone 2 builds
  the pipeline and stops before execution by design.

---

## [0.1.0] — 2026-09-14

### Milestone 1 — Vertical Slice (Frozen baseline)

The first working slice of GHARIBO AI LAB: a Next.js full-stack application with a SQLite
repository layer, a provider abstraction, the Data Factory pipeline, and the Model Registry.
Training is gated and has never been executed (ADR-0005).

#### Added

- Initial monorepo foundation (npm workspaces: `apps/web`, `packages/shared`) — `a8bd7d3`.
- Next.js 14 App Router application with 10 dashboard sections and the API surface.
- SQLite (`better-sqlite3`) + Repository Pattern (13 tables), WAL mode.
- Provider abstraction (`ModelProvider`) with four backends; credentials-by-reference.
- Data Factory pipeline state machine (`RAW → NORMALIZED → REVIEW_REQUIRED → APPROVED →
  TRAINING_READY`, with `REJECTED`).
- Model Registry with EXPERIMENT → CANDIDATE → ACCEPTED → DEPRECATED status gates.
- Python FastAPI services: `services/trainer`, `services/inference`, `services/research`.
- Hardened CORS allowlist on the Python ML services — `e9da48b`.
- Documentation governance: metadata headers, status vocabulary, change control, ADR rules, and
  the machine-checked `docs:facts` block.
- `scripts/validate-docs.mjs` (`npm run docs:validate`).
- ADR-0001..ADR-0010 and the frozen architecture baseline `docs/ARCHITECTURE.md` v1.0.0 —
  `e91bcb8`.

[Unreleased]: https://github.com/voltixsec/Gharibo/compare/e91bcb8...HEAD
[0.1.0]: https://github.com/voltixsec/Gharibo/commit/e91bcb8
