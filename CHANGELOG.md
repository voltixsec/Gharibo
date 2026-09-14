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

### Milestone 2 — Zero-Cost Training Pipeline

**Status: in progress.** Infrastructure to prepare the first official experiment
(`GHARIBO-exp-001`) without executing it. No training has been run; no weights downloaded.

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
