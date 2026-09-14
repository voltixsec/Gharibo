# GHARIBO AI LAB — Project State

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Governance |
| **Status** | Living |
| **Version** | 1.1.0 |
| **Last Updated** | 2026-09-14 |

The single source of truth for **where the project actually is** — as opposed to where it is
planned to be. Every claim here must be verifiable against the code and the document set.
Governance rules are in [`docs/DOCUMENTATION_GOVERNANCE.md`](docs/DOCUMENTATION_GOVERNANCE.md);
the document index is [`docs/DOCUMENT_REGISTER.md`](docs/DOCUMENT_REGISTER.md).

> **Rule of this document.** If something is not built, it is not listed as built. Planned work
> lives in [`docs/ROADMAP.md`](docs/ROADMAP.md); this file records only what exists, what is in
> progress, and what is explicitly blocked.

---

## 1. Snapshot

| Field | Value |
|-------|-------|
| **Package version** | `0.1.0` |
| **Current milestone** | Milestone 3A — Training Readiness — **READY_FOR_ENV_QUALIFICATION** (see §3.1) |
| **Last completed milestone** | Milestone 2 — Zero-Cost Training Pipeline (complete at `9735fe4`) |
| **Frozen baseline** | `docs/ARCHITECTURE.md` v1.1.2 (extends v1.0.0, M1) |
| **Runtime port** | `3000` (GHARIBO web app — unchanged) |
| **Model training status** | **Not started.** No weights downloaded. No experiment executed. |
| **Training budget** | **Zero monetary cost** — binding CEO constraint (see §4) |
| **Training readiness** | **READY_FOR_ENV_QUALIFICATION.** Dataset built, deps pinned, gates pass; Kaggle GPU run required next. See §3.1 |

---

## 1b. Master State

The canonical, machine-readable project state is
[`governance/GHARIBO_MASTER_STATE.json`](governance/GHARIBO_MASTER_STATE.json). It is the single
source of truth for the project; the human view
[`docs/GHARIBO_MASTER_STATE.md`](docs/GHARIBO_MASTER_STATE.md) is **deterministically generated**
from it and must **never be hand-edited**. Regenerate it with `npm run master:generate`; verify the
whole artifact with `npm run master:validate`.

The governance rule from ADR-0017: a material decision affecting architecture, training, datasets,
experiments, models, knowledge graph, procurement intelligence, integrations, security/IP or roadmap
is **not an accepted project decision** until (1) the master state is updated, (2) validation passes,
(3) the required ADR/doc updates are completed, and (4) the change is checkpointed in Git.

The master state also records **approved direction** that is not yet built — the Universal
Commercial + Procurement Knowledge Graph (ADR-0015), the VOKA ↔ GHARIBO integration boundary
(ADR-0016), and the post-training roadmap STAGE-1..STAGE-7. These are approved **direction**, not
delivered capability: nothing beyond the current milestone is executed or scheduled.

---

## 2. What exists today (Milestone 1 — Frozen baseline)

Milestone 1 delivered a working vertical slice. It is real, runnable, and frozen.

| Capability | State | Evidence |
|-----------|-------|----------|
| Next.js 14 App Router full-stack app | Built | `apps/web/` |
| 36 API route files / 53 handlers | Built | machine-checked in `docs/ARCHITECTURE.md` §2.7 (28/44 at M1 freeze; M2 added 8 routes / 9 handlers) |
| SQLite + Repository Pattern (17 tables) | Built | `apps/web/lib/db/schema.ts`, `apps/web/lib/db/repositories/` (13 at M1 freeze; M2 added 4) |
| Provider abstraction (4 backends) | Built | `apps/web/lib/providers/` |
| Credentials-by-reference | Built | `apps/web/lib/secrets.ts`, ADR-0004 |
| Data Factory pipeline state machine | Built | `docs/DATA_FACTORY.md`, ADR-0007 |
| Model Registry with status gates | Built (UI-level) | `docs/MODEL_REGISTRY.md`, ADR-0008 |
| Python FastAPI services (trainer/inference/research) | Built | `services/` on ports 8100/8101/8102 |
| Documentation governance + validator | Built | `docs/DOCUMENTATION_GOVERNANCE.md`, `scripts/validate-docs.mjs` |
| 14 ADRs, frozen architecture baseline | Built | `docs/adr/` |

**Milestone 1 did NOT include real training.** The Training Center can configure a run and perform
a pre-flight check, but launching training is gated and no training has ever been executed
(ADR-0005). This is intentional, not a gap.

---

## 3. Milestone 2 — COMPLETE

Milestone 2 = **Training Preparation Infrastructure**. It builds everything required to *prepare*
the first official experiment (`GHARIBO-exp-001`) without running it. Shipped and pushed.

| Workstream | State |
|-----------|-------|
| M2 PRD (`docs/PRD_MILESTONE_2.md`) | Approved v1.0.0 |
| M2 Architecture (`docs/ARCHITECTURE_MILESTONE_2.md`) | Frozen v1.0.0 |
| ADR-0011..ADR-0014 | Accepted |
| Contract + data foundation (T01) | Implemented |
| TrainingWorker + Kaggle worker + notebook generator (T02) | Implemented |
| Export + API surface (T03) | Implemented |
| Training page UX (T04) | Implemented |
| Verification script + QA tests | Done — 153/153 tests pass |
| Governance reconciliation + commit | Done — `5e286c6`, `9735fe4` (pushed) |

### 3.1 Milestone 3A — Training Readiness: READY_FOR_ENV_QUALIFICATION

Milestone 3A was to close every remaining blocker before CTO authorization. The autonomous work session
completed Sections A–H: source artifact forensics, gold dataset construction, training example generation,
dataset versioning, dependency freeze, verify-m3a gate runner, benchmark definitions, and the
GHARIBO-exp-001 readiness package.

| Section | Required input | Status |
|---------|----------------|--------|
| **A** — Source artifact forensics | Legacy UCL source files | **DELIVERED** — 8 files forensically analyzed (SHA-256, parse validity, entity distribution, referential integrity, master-state reconciliation). Immutable source manifest created. |
| **B** — `GHARIBO-Research-Gold-v0.1` | Verified gold records | **DELIVERED** — 14,444 ACCEPTED_GOLD / 4,043 SUPPORTING / 2 REJECTED / 157 NEEDS_REVIEW. 800 examples sampled for training. |
| **C** — Training example construction | Gold records → Harmony format | **DELIVERED** — 800 examples in OpenAI Harmony format (system/user/assistant). |
| **D** — Dataset version | Splits + hashes + card | **DELIVERED** — 640 train / 80 validation / 80 test, all pairwise disjoint, deterministic split, dataset+split+source-manifest hashes, dataset card. |
| **E** — Dependency freeze | 12 pinned deps | **DELIVERED** — 6→12 promoted (peft, trl, datasets, accelerate, bitsandbytes, openai-harmony). No floating branches, no `>=` ranges in freeze. Versions unresolved (null) — require real Kaggle run. |
| **F** — verify-m3a gate runner | 12 gates | **DELIVERED** — 51 checks PASS, 0 FAIL, 3 PENDING_EXTERNAL_EXECUTION. |
| **G** — Benchmark definitions | Metric definitions only | **DELIVERED** — 13 metrics defined, Base=NOT_RUN, Candidate=NOT_RUN. No fabricated scores. |
| **H** — GHARIBO-exp-001 readiness | Immutable package | **DELIVERED** — Status: READY_FOR_ENV_QUALIFICATION. References git SHA, base revision, dataset, hashes, config, Harmony format, qualification requirements, eval config. |

**Earlier UCL conclusion corrected:** The local VOKA DB is a dev/demo DB and was correctly identified as empty
of historical data. Historical UCL production artifacts existed externally and have now been physically supplied
to `data/raw/legacy-ucl/`. The earlier statement that "UCL never existed" is incorrect and has been corrected
in this document and the CHANGELOG.

**Dataset snapshot disclosure (M3B):** `GHARIBO-Research-Gold-v0.1` is derived from the physically supplied
**18,646-record** legacy UCL snapshot (8 files, 7 available + 1 unavailable). The historical UCL master state
records a corpus of approximately 20,087 records. The difference (1,441 records) corresponds to the missing
`VOKA_UCL_SECURITY_BATCH_004.jsonl` artifact, which was not supplied and must not be reconstructed or invented.
This limitation does not invalidate `GHARIBO-exp-001` — the current 18,646-record snapshot passes all quality
gates (zero parse errors, zero broken relations, zero duplicate lines, verified referential integrity).

**M3B Phase 1 — Gold Audit (100 examples, split-aware):** The 100-example audit cohort passes the
12-criterion audit: **100 PASS / 0 NEEDS_REVIEW / 0 FAIL**, over **TRAIN + VALIDATION only**
(train 83, validation 17). **TEST audited = 0.** The audit artifact
(`data/derived/gold-audit/gold-audit-100-v001.json`, artifactVersion 1.1.0) records a per-example
`split` field and a top-level `splitIsolation` block; two runs on the same inputs are
byte-identical.

**M3B — TEST-split supersession (contamination found and fixed):** The original
`GHARIBO-Research-Gold-v0.1` split (seed `3407`) was **contaminated**: 10 of the 100 audited
examples belonged to TEST, so TEST was not genuinely held out. The seed-3407 split was also not
reproducible from any committed source (its generator was never versioned). It was **superseded**
by a new committed, audit-aware deterministic split generator
(`scripts/split/cut-gold-split.py`, seed `20260914`) that quarantines the 100-example audit cohort
into TRAIN + VALIDATION, guaranteeing **audited ∩ TEST = 0**.

| Split | Superseded (seed 3407) | Current (seed 20260914) |
|-------|------------------------|--------------------------|
| TRAIN | `61afb232fa5e5783463499d1ee24355c52cf56edc5fe11b3bda48795152c6a6c` | `84025de18403b8660d9702877b2b6fd329cedb886cad0095ab67e4daa3828ad2` |
| VALIDATION | `f884c9a953f75a348ed257f84140878a519d6c9f96c9f39accd2660a51095906` | `063fb4422aed247b3f92c0f0d5b1291af46fd4357ca48829a7e7f6ce98815787` |
| TEST | `959068e5451874ab5c3398584c0187dfdb4815c6d00d3a37ca69a54d8f79f11b` (contaminated) | `55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b` |

The dataset hash is unchanged (`84acad9b…`) — no gold example content was modified. Counts remain
640 / 80 / 80.

**Qualification safety (M3B):** The Kaggle qualification harness is now structurally
training-free: runtime tripwires raise on any optimizer construction/step, backward call or
scheduler construction, and a `qualification_safety` evidence block (contract §13) is emitted.
A static safety gate (`qualify:check` + `verify:m3a` Gate 13) forbids the training primitives from
appearing in the generated notebook at all.

**Remaining blocker:** The Kaggle qualification notebook must be executed on a real T4 instance to resolve
dependency versions, verify GPU compatibility, and produce a qualification_hash. This requires CTO authorization
for Kaggle credentials. No training has been started.

---

## 4. Binding constraints (CEO / CTO)

These are hard constraints. They are not preferences and they may not be relaxed without an
explicit written change from the CEO.

1. **Zero monetary cost.** GHARIBO training infrastructure must operate at zero cost. No paid
   training providers (Together AI, RunPod, Vertex AI, Lambda, CoreWeave, …). No paid inference
   bake-off.
2. **Primary training worker: Kaggle Notebooks (free GPU).** Target accelerator NVIDIA T4. Kaggle
   may expose T4 ×2, but the first recipe **must not require multi-GPU**.
3. **Training engine: Unsloth Core.** Initial base candidate: `openai/gpt-oss-20b` (initial
   candidate only — not permanently the foundation). Method: 4-bit QLoRA + SFT.
4. **First experiment: `GHARIBO-exp-001`**, registered as an EXPERIMENT only. No promotion to
   `GHARIBO-V0.1` without evaluation.
5. **Artifact storage: Hugging Face private repo** within the free allowance, plus a complete
   local export/download fallback. GitHub is source-code and documentation only.
6. **Provider-neutral abstraction.** `TrainingWorker` is the interface; `KaggleTrainingWorker` is
   Worker #1, not the architecture itself.
7. **Free-tier resilience is mandatory.** Checkpointing, resume-from-checkpoint, deterministic
   dataset versions, immutable experiment IDs, partial-run recovery, artifact integrity hashes,
   interrupted-session recovery, logs persisted outside the ephemeral runtime, and explicit
   `FAILED` / `INTERRUPTED` / `RESUMABLE` states. A run must never be required to finish in one
   session.
8. **No fabrication.** No fabricated datasets, no fabricated benchmarks, no claimed metrics.

---

## 5. Not started (explicit)

- **Actual model training** — not started. `GHARIBO-exp-001` has not been run.
- **Weight download** — `openai/gpt-oss-20b` weights have **not** been downloaded.
- **`GHARIBO-V0.1`** — does not exist and will not exist without evaluation.
- **DPO / GRPO** — not started; out of scope for M2.

---

## 6. Known debt / corrections tracked

| Item | State |
|------|-------|
| `docs/MODEL_REGISTRY.md` claimed server-side promotion gating that M1 enforced only in the UI | **Resolved** — M2 adds repository-level enforcement; the doc wording was corrected (v1.1.0) |
| `docs/DATA_FACTORY.md` did not mention M2's `reasoning` field or server-side transitions | **Resolved** — corrected (v1.1.0) |
| `overview.md` is a point-in-time M1 delivery note | Marked `Superseded`; not authoritative |
| **M2 defect — `triton_kernels` spec was not installable.** `package.ts` derived the install arg without the `#subdirectory=python/triton_kernels` fragment, so it built the triton monorepo ROOT instead of the subpackage and the package never installed. | **Resolved in M3A** — the fragment is now part of the spec (`package.ts`); guarded by `check-qualify-harness.mjs` |
| **M2 defect — the M2 Kaggle notebook could not install its own dependency set.** Its Section 4 cell ran `uv pip install` with no target selector; on a Kaggle image with no active venv, uv aborts with "No virtual environment found". | **Resolved in M3A** — the template now passes `--system --python <sys.executable>` when `VIRTUAL_ENV` is unset |
| **Engine dependency freeze (M2 architecture §15, item O3)** | **Open.** The pin *set* is frozen in the package (`PINNED_ENGINE_DEPENDENCIES`), the base model is revision-pinned (`openai/gpt-oss-20b` @ `6cee5e81ee83…`), and `triton_kernels` is commit-pinned. But `resolved_version` is `null` for every dependency and the `unsloth` / `unsloth-zoo` / `transformers` git specs track their upstream default branch rather than a fixed commit SHA. Exact versions cannot be known without performing a real install, and inventing them is prohibited — so this is deferred, not faked. **Tightening these to exact commit SHAs is required before the first real run** (see §7). |

---

## 7. Exact blocker before the first real `GHARIBO-exp-001` training

The blocker is **not a missing capability** — Milestone 2 built the pipeline. It is **two missing
external inputs**. Neither can be manufactured without fabrication, so both stop and report.

### 7.1 Blocker A — the engine dependency freeze cannot be resolved here

Resolving the exact working versions (and git SHAs) of the training stack requires **executing an
install on a free Kaggle GPU**. This environment has no Kaggle account/session, no browser session
against Kaggle, and no local CUDA GPU. Recording a version without running the stack would be
fabrication, which is forbidden.

**Unblock:** run the delivered qualification harness on free Kaggle; it emits the freeze manifest
that pastes directly into `PINNED_ENGINE_DEPENDENCIES` (`apps/web/lib/training/package.ts`).

### 7.2 Blocker B — no verified legacy dataset artifacts exist

`GHARIBO-Research-Gold-v0.1` must be built only from physically available, verified legacy UCL /
structured-knowledge artifacts. Verified findings:

| Location | Finding |
|----------|---------|
| GHARIBO `data/raw`, `data/processed`, `data/datasets`, `data/exports`, `models/*` | **empty** (`.gitkeep` only) |
| GHARIBO `gharibo.db` | `data_factory_records` = **2 placeholder rows**; `research_records`, `datasets`, `training_examples` = **0** |
| Legacy UCL system (`C:\Dev\VOKA`, Postgres `voka` @ 54320) | UCL schema **exists** (52 migrations) but the library is **empty**: `UniversalCatalogItem` = 0, `UniversalSource` = 0, `UniversalIngestionRecord` = 0, `UniversalItemProvenance` = 0. `UniversalCategory` = 6 taxonomy-seed rows only |
| `VOKA/docs/UCL_PILOT_INDEX.md` | Pilots were evaluation-only: Wikidata "100 requested / **0 fetched**"; Icecat pilot "**0 DB writes, 0 publications**" |
| Filesystem sweep (`*.jsonl` / `*.csv` / `*.parquet` / `*ucl*` / `*.db` under `C:\Dev`) | **no dataset files** — VOKA docs and source code only |

**Unblock:** supply one of (a) a published UCL export (catalog items joined to provenance /
attributes / identifiers), (b) the UCL-6 pilot audit JSON payloads referenced by
`UCL_PILOT_INDEX.md`, or (c) a populated legacy production DB backup — plus confirmation of the
redistribution/licensing basis (UCL governance requires explicit `ALLOWED` commercial use and
redistribution). The exact required paths are listed in
`.workbuddy-ai/artifacts/m3a-recon-findings.md`.

### 7.3 Checklist to reach `READY_FOR_CTO_AUTHORIZATION`

1. Run the Kaggle qualification harness → paste the exact dependency freeze (§7.1).
2. Supply verified legacy artifacts → build `GHARIBO-Research-Gold-v0.1` with immutable
   `TRAIN` / `VALIDATION` / `TEST` splits and hashes (§7.2).
3. Export the immutable Training Package for the dataset version.
4. Define the benchmark from the held-out TEST split (definitions delivered; scores remain `NOT_RUN`).
5. **CTO authorization to execute training** — not given, and not requested by this milestone.

Until then, the pipeline is complete but idle — which is exactly the Milestone 2 contract, and
Milestone 3A's honest outcome is "readiness blocked, unblocking artifacts delivered".

### 7.4 Governance obligations carried forward

| Obligation | Why it exists | Trigger to discharge |
|-----------|---------------|----------------------|
| `docs/ENV_QUALIFICATION_CONTRACT.md` must be bumped to **2.0.0** in `docs/DOCUMENT_REGISTER.md` | Its 2026-09-14 revision is MAJOR-level: it **reverses** a stated requirement (`spec` was "verbatim", is now the frozen form; the verbatim origin moves to the new required key `requested_spec`). The version was deliberately held at `1.0.0` because the document is `Draft`, has never been `Approved`, and has never produced an artifact — so no released meaning is broken. | When the contract moves to `Approved` |
| `apps/web/lib/training/package.ts` `PINNED_ENGINE_DEPENDENCIES` must be replaced with the harness's frozen `spec` values | Every `resolved_version` is still `null` and the git specs still track upstream branches. §4.0 of the contract forbids shipping a floating pin. | After a real qualification run (Blocker A) |
| The six direct recipe dependencies (peft, trl, datasets, accelerate, bitsandbytes, `openai-harmony`) must be **promoted into `PINNED_ENGINE_DEPENDENCIES`** | A package the training recipe imports directly is a production training dependency. While it sits outside the pin set, only `dependencies[]` is reproducible from the manifest and the **package does not fully pin the training environment** — the exact failure the freeze exists to prevent. Bare-name specs are admissible requests (the harness freezes the resolved version), so writing them invents nothing, and the promotion invalidates nothing because `experiments` and `training_packages` are both empty. | **Discharged in Milestone 3A** — the pin set grows 6 → 12; `additional_dependencies[]` is thereafter reserved for transitive/optional packages only |
