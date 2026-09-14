# GHARIBO AI LAB — Project State

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Governance |
| **Status** | Living |
| **Version** | 1.0.0 |
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
| **Current milestone** | Milestone 2 — Zero-Cost Training Pipeline (in progress) |
| **Frozen baseline** | `docs/ARCHITECTURE.md` v1.1.0 (extends v1.0.0, M1) |
| **Runtime port** | `3000` (GHARIBO web app — unchanged) |
| **Model training status** | **Not started.** No weights downloaded. No experiment executed. |
| **Training budget** | **Zero monetary cost** — binding CEO constraint (see §4) |

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

## 3. In progress (Milestone 2)

Milestone 2 = **Training Preparation Infrastructure**. It builds everything required to *prepare*
the first official experiment (`GHARIBO-exp-001`) without running it.

| Workstream | State |
|-----------|-------|
| M2 PRD (`docs/PRD_MILESTONE_2.md`) | Approved v1.0.0 |
| M2 Architecture (`docs/ARCHITECTURE_MILESTONE_2.md`) | Frozen v1.0.0 |
| ADR-0011..ADR-0014 | Accepted |
| Contract + data foundation (T01) | Implemented |
| TrainingWorker + Kaggle worker + notebook generator (T02) | Implemented |
| Export + API surface (T03) | Implemented |
| Training page UX (T04) | Implemented |
| Verification script + QA tests | In progress |
| Governance reconciliation + commit | In progress |

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
| **Engine dependency freeze (M2 architecture §15, item O3)** | **Open.** The pin *set* is frozen in the package (`PINNED_ENGINE_DEPENDENCIES`), the base model is revision-pinned (`openai/gpt-oss-20b` @ `6cee5e81ee83…`), and `triton_kernels` is commit-pinned. But `resolved_version` is `null` for every dependency and the `unsloth` / `unsloth-zoo` / `transformers` git specs track their upstream default branch rather than a fixed commit SHA. Exact versions cannot be known without performing a real install, and inventing them is prohibited — so this is deferred, not faked. **Tightening these to exact commit SHAs is required before the first real run** (see §7). |

---

## 7. Exact blocker before the first real `GHARIBO-exp-001` training

The blocker is **deliberate and singular**: Milestone 2 builds the pipeline but is explicitly
forbidden from executing a run.

**Blocker: an approved, `TRAINING_READY` dataset version does not yet exist, and no training run
has been authorized.**

Concretely, before the first real run can begin:

1. A dataset must progress `RAW → NORMALIZED → REVIEW_REQUIRED → APPROVED → TRAINING_READY`
   and receive an immutable content-addressed version.
2. A Training Package for that version must be exported from the AI LAB.
3. The engine dependency set must be tightened to exact commit SHAs / resolved versions (§6, O3),
   so the run is reproducible rather than tracking upstream branches.
4. The Kaggle notebook must be run against that package on a free T4 session.
5. CTO authorization to execute training must be given (it has not been).

Until then, the pipeline is complete but idle — which is exactly the Milestone 2 contract.
