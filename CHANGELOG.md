# Changelog

| Field | Value |
|-------|-------|
| **Document Owner** | Delivery (GHARIBO AI LAB) |
| **Type** | Delivery note |
| **Status** | Living |
| **Version** | 1.5.0 |
| **Last Updated** | 2026-09-16 |

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

### Milestone 3C — First Real Execution, Acceptance and Truth Reconciliation

**`GHARIBO-exp-001` has executed for real. It has NOT been evaluated and it has NOT been
promoted.** `GHARIBO-V0.1` does not exist; evaluation is `NOT_RUN`; the held-out TEST split has
never been read. The terminal state is `EVALUATION_READY_AWAITING_AUTHORIZATION`.

#### Added

- `governance/DEC-0030-kaggle-execution-acceptance.json` — acceptance of the completed Kaggle
  execution, content-addressed (`acceptanceHash`
  `06194e95c22b07a4c433154f627f20f515dbb43100e7615885345f6b0cb0c647`).
- `governance/DEC-0031` — acceptance of ADR-0020 and the Frozen-baseline amendment.
- `docs/adr/ADR-0020-post-execution-truth-reconciliation.md` — the decision to reconcile the
  recorded state to reality without promoting, evaluating or retroactively editing the recipe.
- `scripts/training/build-dec0030-acceptance.mjs` (deterministic generator + `--check` drift
  mode, `npm run build:dec0030`) and `scripts/training/verify-kaggle-result.py`
  (`npm run verify:result`) — read-only verification of the downloaded result.
- `apps/web/lib/__tests__/m2-gold-execution-acceptance.test.ts` (19) and
  `apps/web/lib/__tests__/m2-post-training-lifecycle.test.ts` (11) — regression tests freezing
  the accepted execution, the TEST isolation policy, the recorded dtype deviation, the
  lifecycle transitions and the no-promotion / no-evaluation boundary.
- `NON_ARTIFACT_PREFIXES` in `apps/web/lib/db/repositories/training-artifacts.ts` — engine build
  output (`unsloth_compiled_cache/`) can no longer be registered as a model artifact.
- `docs/EVALUATION_AUTHORIZATION_REQUEST.md` — a **request**, not a permission: the explicit,
  signable ask to run the governed benchmark against the held-out TEST split. It ships with an
  empty decision block by design (`BLK-0003` stays `OPEN`).
- Roadmap `STAGE-1` ↔ `training.status` consistency invariant in `master:validate`.

#### Training (real, executed once)

- Kaggle kernel `vokaigharibo/gharibo-exp-001-kaggle-start-fec22ca2`, attempt 3 / kernel
  version 3, `KernelWorkerStatus.COMPLETE` (verified externally).
- Run `ea6e30f2-ce26-4323-b35a-3436ee867eaf`, package
  `78dd1bf374ed1c53785ea50bf179b1b7a4764d40c121d3d41cda4e2a2e3e68f2`.
- 640 examples, 1 epoch, 160 steps, batch 1 x grad-accum 4, 3,981,312 trainable parameters,
  `train_runtime` 4041.9648 s, `train_loss` 0.6016419500112533.
- Artifacts: `CHECKSUMS.sha256` verifies 129/130 declared files with 0 mismatches; rollup
  `788bc0a77d465bcbc997e8698177fbd90c9e8e2720e549159a27684095284885` recomputes exactly; final
  adapter == checkpoint-160 `794917f25c4aa9e77acb6a746b69a703412539e993f6bfc1e8c602d64be678f`;
  checkpoint-150 `5e062fa0bbba3c5276e3d6086f8e7dc0a7e1605c2dbf8c1d989ecbfe5a140249`.
  **No binary artifact is committed** — GitHub carries source and docs only.

#### Runtime truth (declared vs effective)

- Declared dtype `fp16`; the Unsloth runtime emitted
  `Using float16 precision for gpt_oss won't work! Using float32` and
  `Switching to float32 training since model cannot work with float16`. **Effective dtype is
  `float32`** and the adapter is stored as F32 (96 tensors, 15,938,048 bytes).
- Classified `MATERIAL_RUNTIME_DEVIATION_ACCEPTED_POST_EXECUTION`. The immutable package recipe
  was **not** edited retroactively (`recipeEditedRetroactively: false`).
- The parameter-count difference (qualification 11,045,084,736 vs runtime 20,918,738,496) is a
  4-bit packed-storage accounting difference, not a model identity mismatch
  (`ACCOUNTING_DIFFERENCE_NOT_MODEL_IDENTITY_MISMATCH`).

#### Changed

- `master:validate`: the obsolete **"TRAINING HAS NOT STARTED"** invariant is replaced by
  post-execution invariants that still fail closed — completion evidence must be real and
  coherent, TEST must stay isolated, the dtype deviation must be recorded, both failed attempts
  must survive, the roadmap must agree with the execution, and no evaluation or promotion may
  be claimed.
- `scripts/verify-m3a` gate 12: post-execution acceptance, artifact acceptance, runtime-deviation
  truthfulness and the no-auto-promotion check replace the pre-execution pending ladder
  (65 PASS / 0 FAIL / 1 PENDING_EXTERNAL_EXECUTION).
- Database lifecycle reconciled through the real repositories: `QUEUED → RUNNING → COMPLETED`,
  every transition audited at real externally-observed timestamps; historical events preserved.
- Documentation reconciled (all additive; historical notes retained verbatim):
  `docs/ARCHITECTURE.md` 1.2.0 → 1.2.1 (machine-checked `adrs` fact 19 → 20);
  `docs/MODEL_REGISTRY.md` 1.3.0 → 1.4.0; `docs/TRAINING_STRATEGY.md` 1.3.0 → 1.4.0 (the
  "fp16 only on T4" assumption is corrected — the engine refuses fp16 for `gpt-oss`);
  `docs/ROADMAP.md` 1.2.0 → 1.3.0 (`STAGE-1` `NOT_STARTED` → `IN_PROGRESS`);
  `PROJECT_STATE.md` 1.1.0 → 1.2.0.

#### Fixed

- `scripts/training/verify-kaggle-result.py` used the wrong rollup material order
  (`"<digest>  <path>"` instead of `"<path>\t<digest>"`), so it reported a rollup that did not
  match `CHECKSUMS.sha256`. It now recomputes the declared rollup exactly.
- Attempts 1 and 2 remain recorded as `KernelWorkerStatus.ERROR` **before** training — cell-order
  defect (`cd4ae00`) and dependency-install failure (`5d62ea8`).

#### Notes

- The local database reconciliation is not reproducible from Git; `DEC-0030` is the durable
  evidence of record.
- The Windows `charmap` error emitted while Unsloth downloaded its compiled cache is an engine
  log-decoding artifact, not an artifact failure.

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

## [Unreleased] — Held-out TEST benchmark launched (two pre-inference failures, repaired)

**Status: the authorized benchmark has been LAUNCHED TWICE. Both attempts FAILED pre-inference and
are recorded as failures. No result exists — every M1–M13 value remains `null`, and two launches
plus four repaired defect classes have produced ZERO metric values.**

#### Added

- `governance/DEC-0034-evaluation-benchmark-launch.json` + `scripts/eval/build-dec0034-launch.mjs`
  — the launch record, with `--check` drift mode. Records the kernel, dataset, payload hashes and the
  **failure**: `launchOutcome = FAILED_PRE_INFERENCE`,
  `failureClass = HARNESS_DEFECT_NO_EXECUTION`, `failurePhase = CELL_1_PIN_LOADING`,
  `failureMessage = "name 'false' is not defined"`.
- `governance/DEC-0035-evaluation-kernel-relaunch.json` + `scripts/eval/build-dec0035-relaunch.mjs`
  — the repaired relaunch. Records all **four** defect classes, the gate hardening, the relaunch's
  **own pre-inference failure**, a 6-entry pre-flight control table, and the binding forward
  guarantee: `furtherAttemptAuthorized = false`,
  `afterThisPoint = NO_FURTHER_RELAUNCH_WITHOUT_A_NEW_HUMAN_DECISION`. Notebook and bundle hashes
  are read from the committed artifacts at generation time, so the record cannot quote an artifact
  it does not match.
- `scripts/eval/verify-eval-kernel-runtime.py` — **22 checks**. Compiles every code cell and
  **executes the pins cell with its asserts live**. This is the layer that was missing: all 41
  pre-existing static checks passed on the notebook that crashed, because each inspected the pins
  object *in Node* rather than the Python actually emitted. Scope is limited to the pre-inference
  surface, and the file says so rather than implying full coverage.
- `scripts/eval/verify-eval-failure-evidence.py` — **4 checks** (replaces the misnamed
  `build-dec0035-failure-evidence.py`). **Derives** the `testInferenceOccurred = false` conclusion
  from the raw Kaggle log instead of asserting it, and flips to `true` if any inference marker is
  present. It separates **inference** markers (`torch.inference_mode`, `.generate(`,
  `predictions-*.jsonl`) from **stage** markers (`Stage 1`, `uv pip install`), because treating an
  installer log line as inference evidence is exactly how an unspent authorization gets declared
  spent. Run against both failure logs.
- `scripts/eval/prepare-eval-launch.mjs` — the governed launch-bundle builder (prompts-only
  projection, `--check` mode, stray answer-file removal).

#### Fixed

- **`NameError` in cell 1 (the observed launch failure).** The generator emitted the governed pins
  as a **raw JSON literal** into Python source. JSON and Python disagree on `true`/`false`/`null`,
  so `PINS = {... "doSample": false ...}` raised `NameError` before the install stage and before any
  model was loaded. Pins are now injected as an embedded JSON string and decoded with `json.loads()`.
- **Silent data loss in the canonical encoder.** `JSON.stringify(p, Object.keys(p).sort(), 4)` passes
  an array as the *replacer* argument, which is a property **allow-list applied at every nesting
  level** — it shredded `engineDependencies` into nine `{}` objects. Replaced with a recursive
  key-sorting serializer; `hasEmptyObject()` now fails the build.
- **Silent contract degradation in the float pins.** JSON has no `int`/`float` distinction, so the
  round-trip turned `temperature: 0.0` into Python `int 0`. The declared types are now restored
  explicitly and asserted with `type(x) is float` rather than a truthiness or `==` check.
- **`RuntimeError` in cell 5 (the observed relaunch failure).** The pinned base revision was passed
  as `revision=` to Unsloth's **distribution** repo id `unsloth/gpt-oss-20b`, which resolves
  internally to `unsloth/gpt-oss-20b-unsloth-bnb-4bit`. The revision does not exist on that
  substitute, so Unsloth warned that it was *ignoring* the pin, substituted the repo, and the load
  died with `Both AutoConfig and PeftConfig loading failed`. The argument was **removed** — matching
  the e2e-qualified convention in `scripts/qualify/qualify-kaggle-env.mjs` — and, because a pin that
  is recorded but never compared to anything is decoration, a dedicated cell now resolves the
  declared revision against the **live** base repository via `HfApi().model_info` and asserts
  equality before any model loads. This defect was found because a deliberately weakened check was
  caught satisfying itself on an unrelated line of source.

#### Changed

- `scripts/eval/check-eval-kernel.mjs` — **41 → 53 checks**. Twelve new checks cover the pin-encoding
  defect class end to end, including the empty-nested-object and round-trip guards, and assert that
  the loader call passes **no** `revision` argument while the pinned base revision is enforced
  against the live base repository.
- `governance/GHARIBO_MASTER_STATE.json` — master state `1.14.0 → 1.15.0`. 35 decisions. `BLK-0004`
  is **CLOSED** by `DEC-0033` + `DEC-0034` + `DEC-0035`. `authorizationConsumed` is now `true` with
  `furtherAttemptAuthorized: false`. `training.status` remains `COMPLETED`.
- `apps/web/lib/training/gold-authorization.mjs` — added
  `isEvaluationBenchmarkLaunchedGoldState()`, which re-runs the DEC-0033 layer **with explicit
  override values** for the fields the launch legitimately advanced (`expectedBlockerStatus:
  "CLOSED"`, `expectedTestInferenceOccurred: "POSSIBLY_IN_FLIGHT"`, `expectedAuthorizationConsumed:
  true`) instead of loosening the assertions below. The overrides keep full strictness: each value
  must still equal what the caller declares, so an omitted override cannot disable a check. The
  predicate blocks both failure modes at once — rounding a launch up into a result, and rounding the
  failed attempt down into a gap.
- `scripts/eval/verify-evaluation-state.mjs` — **30 → 31 checks**. A new third branch handles the
  *closed-blocker-without-results* state, which is the one that most invites a fabricated score; it
  requires `evaluationStatusAfterLaunch === "EVALUATION_BENCHMARK_IN_FLIGHT"`,
  `metricValuesProduced === 0`, `testRecordsParsedLocally === 0`, `executionSucceeded === false`, and
  the recorded pre-inference failure.
- `docs/EVALUATION_BENCHMARK_LAUNCH.md` — v1.2.0. New §0 records **both** failures, all four
  defects, the missing gate layer, the relaunch, the six pre-flight controls, and the escalation
  rule. `docs/EVALUATION_EXECUTION_BLOCKER.md` — v1.3.0; `BLK-0004` is CLOSED, with the original
  classification retained as history rather than overwritten.
- `package.json` — `eval:audit:launch`, `eval:audit:relaunch`, `eval:kernel:runtime`,
  `eval:launch:evidence`; `verify:eval` composes all of them.

#### Notes

- **A launch is not a result.** `evaluationResults` stays `0`, `evaluationStatus` stays `NOT_RUN`,
  and every M1–M13 value stays `null` until prediction payloads are retrieved and scored locally.
- **`GHARIBO-V0.1` remains `NOT_CREATED`. Nothing is promoted.**
- **The failure is recorded, not smoothed over.** The first launch died in cell 1 with a `NameError`
  and the relaunch died in cell 5 with a loader `RuntimeError`; both facts are part of the record,
  the second inside the very record that produced it. Silently repairing and re-pushing would have
  made a two-attempt path look like a one-attempt path.
- **Two of the four defects were introduced by the fix for the one before.** That is the load-bearing
  argument for a gate that **executes** the artifact rather than one that re-reads it.
- **Escalation rule.** A **third** pre-inference failure must be escalated to the CEO rather than
  repaired again. Repairs are bounded by the pre-inference test, not by a count — but repeated
  harness failure is itself evidence about the plan.
- **Every new gate was adversarially verified** by re-injecting the defect and observing a failure
  before being trusted. A gate that has never been seen to fail has not been shown to be a gate.
- **Repository safety.** No raw TEST record, inference transcript, weight, adapter binary, Kaggle
  output binary, database, or secret is committed. Gold never left the scoring host; the uploaded
  payload carries 80 model-visible prompts and no answers.

---

## [Unreleased] — Evaluation authorization & governed held-out benchmark

**Status: authorization + pre-execution governance only. The governed benchmark was NOT executed.
No TEST record was parsed. No metric value exists.**

#### Added

- `governance/DEC-0032-evaluation-authorization.json` — the human authorization record. Decision
  `AUTHORIZED WITH LIMITS`, decider `CEO`, date `2026-09-15`. Scope is exactly **one** governed
  benchmark execution (BASE inference, CANDIDATE inference, M1–M13 measurement, access logging).
  Explicitly **not** authorized: promotion, further training, checkpoint selection, prompt tuning,
  few-shot selection, threshold tuning, test-driven filtering, dataset modification, a second
  evaluation attempt, re-running `GHARIBO-exp-001`, creating `GHARIBO-V0.1`. `authorizationConsumed`
  is `false` — the single permitted execution is still available.
- `governance/EVALUATION-LEAKAGE-AUDIT.json` — the pre-access leakage audit required by
  `docs/RESEARCH_BENCHMARK.md` §3.5. Proves by content hash, not by assertion, that
  `TRAIN ∩ TEST = 0`, `VALIDATION ∩ TEST = 0`, and `audit cohort ∩ TEST = 0`. **PASS.** No TEST
  semantic content was inspected to produce it.
- `governance/DEC-0033-evaluation-infrastructure-blocker.json` — the honest record of why the
  benchmark could not run. `blockerClass = INFRASTRUCTURE_NO_EXECUTION_ENVIRONMENT`,
  `subClass = NO_GPU_COMPUTE_AVAILABLE`, `phase = PRE_INFERENCE`,
  `recordKind = INFRASTRUCTURE_BLOCKER_NOT_AN_EVALUATION_RESULT`. The authorization is **not**
  consumed and remains valid.
- `docs/EVALUATION_EXECUTION_BLOCKER.md` — the human-readable companion to DEC-0033: the 16
  preconditions that were verified READY, the blocker itself, an explicit list of what was **not**
  done, and the 8 ordered steps required to unblock.
- `scripts/eval/build-dec0032-authorization.mjs`, `scripts/eval/build-dec0033-blocker.mjs` —
  deterministic generators with `--check` drift modes, so neither governance record can be
  hand-edited out of sync with its committed source.
- `scripts/eval/verify-evaluation-state.mjs` — a deterministic PASS/FAIL verifier (30 checks in 7
  groups) that enforces the honesty of the evaluation layer: no score may exist without execution,
  no placeholder score is tolerated, the authorization must be intact, an infrastructure blocker
  must be recorded **as** a blocker, TEST must remain isolated, nothing may be promoted, and
  `training` must remain unchanged.

#### Changed

- `governance/GHARIBO_MASTER_STATE.json` — master state `1.12.0 → 1.14.0`. Evaluation moves
  `EVALUATION_READY_AWAITING_AUTHORIZATION → EVALUATION_AUTHORIZED_READINESS`, the authorization
  is recorded, and the previously blocking `BLK-0003` is **CLOSED by DEC-0032** (closed only
  through an accepted human decision, never by inference). New blocker `BLK-0004`
  (`INFRASTRUCTURE_NO_EXECUTION_ENVIRONMENT`, **OPEN**) is the sole reason execution did not occur.
  `training.status` remains `COMPLETED`; no experiment status was rewritten.
- `docs/GHARIBO_MASTER_STATE.md` — regenerated deterministically (`npm run master:generate`), now
  33 decisions, 4 blockers, version `1.14.0`. Never hand-edited.
- `docs/EVALUATION_AUTHORIZATION_REQUEST.md` — v1.2.0. Records the signed decision and carries a
  `⛔ EXECUTION BLOCKED — INFRASTRUCTURE UNAVAILABLE` banner stating plainly that no TEST parse
  occurred and that the authorization is unspent.
- `docs/DOCUMENT_REGISTER.md` — registered `docs/EVALUATION_EXECUTION_BLOCKER.md`; the evaluation
  authorization request is now `Approved | 1.2.0`; register + master-state rows moved to `1.14.0`.
- `apps/web/lib/training/gold-authorization.mjs` — added
  `isEvaluationInfrastructureBlockedGoldState()`, which layers on top of
  `isEvaluationAuthorizedGoldState()` and requires the DEC-0033 blocker to be exact (class, phase,
  record, 64-hex hash) while `testInferenceOccurred === false`, `testRecordsParsed === 0`, and
  `metricValuesProduced === 0`. It strips its own layer and re-asserts the prior predicate, so it
  can never be satisfied by loosening the gate beneath it. The version allow-list
  `COMPLETED_MASTER_STATE_VERSIONS` gained `1.13.0` / `1.14.0`; the advanced-tip path additionally
  requires `evaluationResults === 0`, `evaluationStatus === "NOT_RUN"`, `promotable === false`, so
  the tolerance cannot be abused to smuggle in an evaluation claim.
- `package.json` — `eval:audit:auth`, `eval:audit:blocker`, `eval:audit:leakage`, `eval:verify`,
  and the composing `verify:eval` gate.

#### Notes

- **The benchmark did not run, and no result is reported.** Two independent constraints: there is
  no local CUDA device (the artifact is a ~20.9 B-parameter model trained effectively in float32),
  and the mandated governed Kaggle T4 path is asynchronous over a window wider than this session,
  with its kernel generator still carrying two unrepaired defects. Per the authorization's own
  hard stop, an infrastructure failure before TEST inference is recorded separately and is **not**
  disguised as an evaluation result.
- **M1–M13 remain `null` / `NOT_RUN`.** No `0`, no `"N/A"`, no estimate, no synthetic success.
- **`GHARIBO-V0.1` remains `NOT_CREATED`. Nothing is promoted.** The candidate adapter stays
  experimental. This is enforced by a test, not by convention.
- **Repository safety.** No raw TEST record, inference transcript, weight, adapter binary, Kaggle
  output binary, database, or secret is committed. The evaluation item bundle lives under the
  gitignored `.workbuddy-ai/`; raw processed data lives under the gitignored
  `data/processed/*`. Committed content is governance records, evaluation code, hash manifests,
  metrics summaries and docs only.

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
