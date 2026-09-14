# GHARIBO AI LAB — Milestone 2 PRD: Zero-Cost Training Pipeline & First Dataset

| Field | Value |
|-------|-------|
| **Document Owner** | Product (GHARIBO AI LAB) |
| **Type** | PRD |
| **Status** | Approved |
| **Version** | 1.0.0 |
| **Last Updated** | 2026-09-14 |

---

## 1. Purpose & Relationship to Milestone 1

### 1.1 Purpose

Milestone 1 delivered a working vertical slice: a Next.js control center, a provider abstraction, a
Data Factory with a real pipeline, datasets with JSONL export, a Training Center whose pre-flight
check really inspects the machine, a Model Registry with status gates, and an Evaluation scaffold.

Milestone 1 deliberately stopped short of **real training execution** — on the dev machine there is
no GPU, and the pre-flight check correctly reports `NOT_READY` (ADR-0005: launch-ready only).

Milestone 2 closes that gap **without spending money**. It introduces the missing link between
*"we have a curated dataset"* and *"we can actually run a reproducible fine-tune"*:

> GHARIBO exports a **provider-neutral, reproducible Training Package** from AI LAB →
> the package is executed on **Kaggle Notebooks (free GPU)** by the first implementation of a
> `TrainingWorker` → the run produces checkpoints, a LoRA adapter, metrics, and a full experiment
> manifest → results are imported back into GHARIBO as an **EXPERIMENT** (never a promoted model).

The compute worker changes; the architecture does not. Kaggle is **Worker #1**, not GHARIBO itself.

### 1.2 What M2 inherits from M1 (do not re-specify)

| M1 asset | How M2 uses it |
|---|---|
| `DataFactoryRecord` + pipeline state machine (ADR-0007) | Extended into the **Gold Pipeline**; states remain the source of truth |
| `datasets` / `dataset_records` tables (immutable versioned snapshots) | Extended with **content-addressed hashes** and deterministic splits |
| `training_runs` table (lora_rank/alpha/target_modules columns) | M2 derives engine `r`/`lora_alpha`/`target_modules` **from these stored columns** (no hardcoding) |
| Training pre-flight check (`preflight` route + trainer service) | Reused as the *dev-machine* gate; M2 adds the *Kaggle* gate inside the notebook |
| Model Registry status gates (ADR-0008) | `GHARIBO-exp-001` registers as **EXPERIMENT only** |
| Experiments table (code_version, configuration, seed, results) | Extended to store the **Training Package** + manifest + imported results |
| Provider abstraction (ADR-0003) | The design template the new `TrainingWorker` abstraction mirrors |

### 1.3 Policy context (hard constraint)

**GHARIBO training infrastructure must currently operate at ZERO monetary cost.** This is a
milestone-level constraint, not a preference. It shapes every requirement below.

- **Primary training worker:** Kaggle Notebooks, **free GPU tier**.
- **Target accelerator:** **NVIDIA T4** (~16 GB). Kaggle may expose T4 ×2, but the first recipe
  **must not require multi-GPU** — `GHARIBO-exp-001` runs on a single device.
- **Engine:** **Unsloth Core**. **Base candidate:** **`openai/gpt-oss-20b`**. **Method:** 4-bit
  **QLoRA + SFT**. **Experiment:** **`GHARIBO-exp-001`**.
- **Artifact storage:** a **Hugging Face PRIVATE repo within the free allowance**, **plus local
  export/download as a complete fallback**. GitHub stays source-code/documentation only.
- **Provider neutrality:** keep a `TrainingWorker` interface; `KaggleTrainingWorker` is the
  **first implementation**, not the architecture.

> **Explicitly prohibited:** Together AI, RunPod, Vertex AI, Lambda, CoreWeave, and any other paid
> training provider or paid storage. These must never appear as a requirement, dependency, default,
> or fallback anywhere in M2.

---

## 2. Goals

| # | Goal | Measurable Success Criteria |
|---|------|-----------------------------|
| G1 | **Reproducible, portable training contract** | A single **Training Package** (one JSON manifest + referenced artifacts) fully describes a run such that an independent operator can re-execute it on Kaggle and obtain the same configuration. The package carries experiment ID, Git SHA, base model + revision, dataset version + hashes, split hashes, exact Unsloth dependency versions, full QLoRA config, seed, sequence length, checkpoint policy, artifact destination, and evaluation config. |
| G2 | **Zero-cost, free-tier-resilient execution** | `GHARIBO-exp-001` can be trained on a single free Kaggle T4 across **one or more notebook sessions** using checkpointing and resume — never assuming a run finishes in a single session. Total monetary cost = **$0**. |
| G3 | **Honest provenance & gated promotion** | Every experiment records verifiable provenance (dataset hash, split hashes, Git commit SHA, base model revision, engine version, environment metadata) and registers in the Model Registry as **EXPERIMENT** — never promoted to `GHARIBO-V0.1` or `GHARIBO-V1` without evaluation. |

---

## 3. Non-Goals (Explicit Prohibitions)

These are **prohibitions**, not deferrals. M2 must not do any of the following.

| # | Non-Goal |
|---|----------|
| NG-1 | **No actual training is performed in this milestone's implementation of the PRD** — M2 builds the pipeline, package, and notebook; it does not run a real fine-tune as a deliverable of this spec. |
| NG-2 | **No downloading of gpt-oss weights** on the dev machine. |
| NG-3 | **No fabricated datasets, metrics, loss curves, or benchmark results.** Every number must come from a real run. |
| NG-4 | **No "GHARIBO-V0.1" and no "GHARIBO-V1".** No model promotion of any kind. |
| NG-5 | **No DPO and no GRPO** in this milestone. |
| NG-6 | **No changing the accepted (frozen) M1 architecture** without a new ADR. |
| NG-7 | **No paid training providers and no paid storage** (Together AI, RunPod, Vertex AI, Lambda, CoreWeave, etc.). |
| NG-8 | **No multi-GPU requirement** for the first recipe. |
| NG-9 | **No Google Colab** — the worker is Kaggle. |
| NG-10 | **No secrets in source or output** — HF tokens never appear in notebook source, logs, or committed files. |

---

## 4. Personas & Journeys

### 4.1 Personas

| Persona | Role | M2 need | Pain point M2 removes |
|---|---|---|---|
| **Maya — ML Engineer** | Operates the training loop | A reproducible package she can run on free Kaggle GPU, with checkpoint/resume across sessions | Sessions dying mid-run and losing progress; irreproducible hyperparameters |
| **Ravi — Researcher / Data Curator** | Builds and curates datasets | A Gold Pipeline that yields an immutable, hashed dataset version with deterministic splits | Not knowing whether the data a run used is the data he approved |
| **Lin — Team Lead / Founder** | Owns promotion decisions | Verifiable provenance and lineage; `GHARIBO-exp-001` clearly labeled EXPERIMENT | A model being called "GHARIBO-V1" without evidence |

### 4.2 Key Journeys

**J1 — Export & run (Maya).**
Training page → select an immutable **dataset version** → inspect the generated QLoRA
configuration → **Generate / Export Training Package** → follow the exact command + notebook
instructions → upload the package (or the notebook + inputs) to Kaggle → run the committed notebook
on a free T4 → the notebook prints hardware, verifies VRAM, pins and verifies dependencies,
verifies dataset hashes, trains with checkpointing, and writes adapter + trainer state + metrics +
manifest under `/kaggle/working`.

**J2 — Resume after interruption (Maya).**
A session is terminated mid-run → a checkpoint + trainer state exist under `/kaggle/working`
(persisted as notebook Output) → Maya re-attaches the previous output (or a Kaggle Dataset) as
input → supplies `resume_from_checkpoint` → the notebook resumes and the run is marked
`RESUMABLE` → `COMPLETED` only when training genuinely finishes.

**J3 — Curate to gold (Ravi).**
Records flow `RAW → NORMALIZED → REVIEW → APPROVED → TRAINING_READY` → an immutable dataset version
is cut → deterministic TRAIN / VALIDATION / TEST splits are hashed and recorded → the hashes travel
inside the Training Package.

**J4 — Import & register (Lin).**
Training results (metrics + manifest) are imported back into GHARIBO → `GHARIBO-exp-001` is
registered as **EXPERIMENT**, with lineage `derived from openai/gpt-oss-20b` → promotion remains
blocked pending evaluation.

---

## 5. Requirements Pool

> **P0 = must have for M2.** P1 = important, next. P2 = future / extension.
> Acceptance criteria are stated per requirement so the architecture and implementation can be
> verified against them.
>
> Requirement IDs are milestone-scoped (`M2-P0-NN`) to avoid collision with the Milestone 1 PRD's
> `P0-NN` sequence. Traceability per `docs/DOCUMENTATION_GOVERNANCE.md` §10 uses the full scoped ID
> (e.g. `M2-P0-05` → `ARCHITECTURE.md` §N → ADR → code path).

### 5.1 P0 — Must Have

| ID | Requirement | Area | Acceptance Criteria |
|----|-------------|------|---------------------|
| **M2-P0-01** | **Provider-neutral `TrainingWorker` interface.** A single interface abstracts where training runs; `KaggleTrainingWorker` is **Worker #1**. | Architecture | Interface defined and documented (mirroring the M1 provider abstraction). `KaggleTrainingWorker` is the only implementation required in M2. No paid-provider implementation exists. The interface is referenced by ADR-0011. |
| **M2-P0-02** | **Canonical Training Package.** A single, portable contract carries the full experiment definition. | Training Package | Package contains **all** fields in §6.1. Package is self-describing (schema version). Generating a package never requires a GPU. |
| **M2-P0-03** | **Export from GHARIBO AI LAB → Kaggle-ready package.** The Training page can generate and download the package. | Training/UX | One action produces a downloadable package (manifest + referenced inputs + notebook). Export fails loudly if the selected dataset version is not `TRAINING_READY` or hashes cannot be computed. |
| **M2-P0-04** | **Reproducible Kaggle notebook.** A generated notebook that runs the package on a free T4. | Training Package | Notebook is deterministic: same package → same notebook. Notebook source contains **no** secrets and **no** hardcoded personal paths. |
| **M2-P0-05** | **Hardware detection + VRAM verification, fail-loud.** The notebook prints detected hardware and verifies sufficient VRAM **before** training. | Resilience | Prints GPU name, compute capability, VRAM, and selected dtype. Asserts the budget for gpt-oss-20b QLoRA (≥ ~14 GB documented minimum) and **aborts with a clear message before training** rather than OOM-ing mid-run. Asserts **fp16** (T4 is Turing/sm_75; bf16 is unsupported). |
| **M2-P0-06** | **Pinned dependency install + version verification.** Install the exact pinned Unsloth stack; verify before use. | Reproducibility | Notebook installs the pinned set from the package (see §6.1 `engine.dependencies`) and **fails on any version mismatch**. Confirms the stack actually imports on the device. |
| **M2-P0-07** | **Dataset hash verification.** The notebook verifies the dataset it loads matches the package. | Provenance | Dataset hash and each split hash are recomputed in the notebook and compared to the package; mismatch → hard failure. |
| **M2-P0-08** | **Load the correct gpt-oss training representation + preserve Harmony.** | Training Package | Notebook loads the gpt-oss 4-bit representation used for QLoRA. Training text is rendered through the **OpenAI Harmony** format; `analysis` channel content is **hidden from end users**; roles and special tokens are handled per §6.2. |
| **M2-P0-09** | **Configure Unsloth QLoRA (conservative, single-GPU, fp16).** | Training | QLoRA config is generated from the package. Engine `r`/`lora_alpha`/`target_modules` are **derived from stored `training_runs` columns**, not hardcoded. Uses `use_gradient_checkpointing="unsloth"`, `optim="adamw_8bit"`, `per_device_train_batch_size=1`, `gradient_accumulation_steps≥4`, conservative `max_seq_length`. |
| **M2-P0-10** | **Checkpointing + artifact saving.** Training checkpoints and saves all artifacts. | Resilience | Writes checkpoints, LoRA adapter, **trainer state**, metrics, and a **full experiment manifest** under `/kaggle/working`. `save_strategy="steps"` with a bounded `save_total_limit` (20 GB cap). |
| **M2-P0-11** | **Resume from checkpoint.** A supplied checkpoint resumes training automatically. | Resilience | When `resume_from_checkpoint` is provided by the package, the notebook resumes without restarting from zero and records the resume point in the manifest. |
| **M2-P0-12** | **Optional private HF upload; token never exposed.** | Security | Artifact destination is **optional** in the package. When configured, upload targets a **PRIVATE** HF repo via **Kaggle Secrets**; the token is never written to notebook source, never printed to output, and never committed. With no destination configured, local export/download is a **complete fallback**. |
| **M2-P0-13** | **Zero-cost enforcement.** | Policy | No requirement, dependency, default, or fallback references a paid provider or paid storage. Documented in the package schema and the notebook header. |
| **M2-P0-14** | **Dataset Gold Pipeline foundation.** `RAW → NORMALIZED → REVIEW → APPROVED → TRAINING_READY`. | Data | Each transition is persisted and auditable; `TRAINING_READY` is a precondition for cutting a dataset version. Extends (does not replace) ADR-0007 states. |
| **M2-P0-15** | **Immutable dataset version + deterministic hashed splits.** | Data/Provenance | Cutting a version produces an immutable snapshot with a **content hash**; splits TRAIN / VALIDATION / TEST are deterministic (seeded) and each has a recorded hash. Re-cutting the same inputs yields identical hashes. |
| **M2-P0-16** | **Provenance record.** Every experiment records full provenance. | Provenance | Records dataset hash, split hashes, Git commit SHA, base model **identity + revision**, training engine version, and environment metadata (see §8). |
| **M2-P0-17** | **Training page extensions.** | Training/UX | User can (a) choose a dataset version, (b) inspect the generated training config, (c) generate/export the Kaggle package, (d) see exact command/notebook instructions. See §9. |
| **M2-P0-18** | **Registry / Experiments: EXPERIMENT only.** | Registry | `GHARIBO-exp-001` registers as **EXPERIMENT**, with lineage `derived from openai/gpt-oss-20b`. Promotion to `CANDIDATE`/`ACCEPTED` is blocked (ADR-0008). No `GHARIBO-V0.1`/`GHARIBO-V1` entry is created. |
| **M2-P0-19** | **Free-tier resilience states.** | Resilience | Training runs expose **`FAILED` / `INTERRUPTED` / `RESUMABLE`** states in addition to M1 states. An experiment is **never required to finish in a single notebook session**. |
| **M2-P0-20** | **Logs & state persist outside the ephemeral runtime.** | Resilience | Training logs, checkpoints, trainer state, metrics, and manifest are written to a **persistent** location (`/kaggle/working` and/or the configured destination) — never only to ephemeral runtime storage. |
| **M2-P0-21** | **Governance compliance.** | Governance | New routes/tables/pages update the `docs:facts` block in `ARCHITECTURE.md` §2.7; new material decisions are captured as ADR-0011+ (§12.2). `npm run docs:validate` must pass. |

### 5.2 P1 — Important (Next)

| ID | Requirement | Area |
|----|-------------|------|
| M2-P1-01 | **Import training results back into GHARIBO** (metrics, manifest, artifact pointers) and attach them to the experiment. | Experiments |
| M2-P1-02 | **Artifact integrity verification on import** (re-hash adapter/metrics against manifest). | Provenance |
| M2-P1-03 | **Notebook run-history view** (list of sessions/attempts per experiment, with resume lineage). | Resilience/UX |
| M2-P1-04 | **Config diffing** between two Training Packages. | Reproducibility |
| M2-P1-05 | **Automated dataset-hash re-verification** at export time against the recorded version hash. | Provenance |
| M2-P1-06 | **Split re-materialization check** (deterministic split reproduction test). | Data |
| M2-P1-07 | **Second `TrainingWorker` interface stub** proving provider-neutrality (interface-only, no paid provider). | Architecture |

### 5.3 P2 — Future / Extension

| ID | Requirement | Area |
|----|-------------|------|
| M2-P2-01 | Additional free-tier or self-hosted workers behind the same interface. | Architecture |
| M2-P2-02 | Automated multi-session orchestration (auto-resume without manual re-attach). | Resilience |
| M2-P2-03 | Evaluation execution against imported adapters. | Evaluation |
| M2-P2-04 | DPO / GRPO extension points (explicitly out of scope for M2). | Training |

---

## 6. Training Package — Product Requirements

### 6.1 Canonical Training Package Schema

The Training Package is **the** portable, reproducible training contract. It is provider-neutral: it
describes *what* to train, not *where*. It must carry **all** of the following.

| Group | Field | Notes |
|---|---|---|
| **Identity** | `schema_version` | Version of the package contract itself |
| | `experiment_id` | e.g. `GHARIBO-exp-001`; immutable |
| **Code** | `git_commit_sha` | Exact repo commit the run is based on |
| **Model** | `base_model` | `openai/gpt-oss-20b` — **identity / lineage** |
| | `base_model_revision` | Pinned revision of the base model |
| | `loader_model_id` | `unsloth/gpt-oss-20b` (4-bit/MXFP4 representation actually loaded) |
| **Data** | `dataset_version` | Immutable dataset version identifier |
| | `dataset_hash` | Content hash of the full dataset |
| | `split_hashes` | `{ train, validation, test }` hashes |
| | `split_policy` | Deterministic, seeded split rule |
| **Engine** | `engine` | `unsloth` |
| | `engine.dependencies` | **Exact pinned Unsloth dependency set** (see §6.4) |
| **QLoRA config** | `quantization` | `4-bit` |
| | `lora.r`, `lora.alpha`, `lora.target_modules`, `lora.dropout`, `lora.bias` | Derived from stored `training_runs` columns |
| | `method` | `QLoRA + SFT` |
| | `sequence_length` | `max_seq_length` (conservative for a 16 GB T4) |
| | `batch.per_device_train_batch_size`, `batch.gradient_accumulation_steps` | Conservative single-GPU values |
| | `optimizer` | `adamw_8bit` |
| | `learning_rate`, `epochs` / `max_steps`, `warmup_steps`, `lr_scheduler_type`, `weight_decay` | Full SFT config |
| | `dtype` | `fp16` (T4 = Turing; bf16 unsupported) |
| **Determinism** | `seed` | Recorded and applied |
| **Checkpoints** | `checkpoint_policy` | `save_strategy`, `save_steps`, `save_total_limit`, resume semantics |
| **Artifacts** | `artifact_destination` | **Optional.** Private HF repo and/or local export path |
| **Evaluation** | `evaluation_config` | Benchmark categories/metrics to run after training |
| **Provenance** | `environment_metadata` | See §8 |

**Package invariants**
1. Generating a package requires **no GPU** and **no paid service**.
2. A package is **immutable once issued**; changes produce a new package version.
3. `artifact_destination` may be **absent** — the package is still complete (local fallback).
4. The package never embeds secrets (HF tokens are referenced, never stored).

### 6.2 Record → Harmony Mapping (mandatory)

GHARIBO records are `{ input, context, chosen_output }`-shaped; gpt-oss expects **OpenAI Harmony**.
The package must carry an explicit, documented mapping. For the first specialization
("Research + Structured Knowledge Building"):

| GHARIBO field | Harmony role/channel |
|---|---|
| Task framing / instructions | `developer` |
| `input` + `context` | `user` |
| Reasoning (if present) | `assistant` → `analysis` (**never shown to end users**) |
| `chosen_output` | `assistant` → `final` |
| Tool interactions (if any) | `tool` / `assistant` → `commentary` |

Rendering must use the model's Harmony-aware chat template (roles `system`/`developer`/`user`/
`assistant`/`tool`; special tokens `<|start|>`, `<|end|>`, `<|message|>`, `<|channel|>`,
`<|constrain|>`, `<|call|>`, `<|return|>`; reasoning effort configurable). The notebook must
preserve this formatting exactly.

### 6.3 Package Lifecycle

```
Training config (AI LAB)  →  Training Package (immutable)  →  Kaggle run  →  Artifacts + Manifest  →  Import
        M2-P0-17                     M2-P0-02/M2-P0-03                   M2-P0-04..M2-P0-12            M2-P0-10           M2-P1-01
```

### 6.4 Pinned Engine Dependencies

The package records the **exact pinned Unsloth dependency set** (engine version) so a run is
reproducible. The notebook's version-verification step compares installed versions to this pinned
set and **fails on mismatch**. Plain `pip install unsloth` is **not** the supported path; the
package specifies the supported pinned installation set (per verified stack facts).

---

## 7. Dataset Gold Pipeline

The Gold Pipeline extends the M1 Data Factory state machine (ADR-0007) — it does not replace it.

```
RAW → NORMALIZED → REVIEW → APPROVED → TRAINING_READY → immutable dataset version → TRAIN / VALIDATION / TEST
```

| Stage | Meaning | M2 requirement |
|---|---|---|
| `RAW` | Initial import/save | (M1) |
| `NORMALIZED` | Formatted, deduplicated, field-standardized | (M1) |
| `REVIEW` | Human review required | (M1, `REVIEW_REQUIRED`) |
| `APPROVED` | Reviewed and approved | (M1) |
| `TRAINING_READY` | Included in an assembled dataset, ready to cut | Precondition for a dataset version (M2-P0-14) |
| **immutable dataset version** | Content-addressed snapshot | M2-P0-15 |
| **TRAIN / VALIDATION / TEST** | Deterministic, seeded, hashed splits | M2-P0-15, M2-P0-16 |

**Rules**
1. A dataset version is **immutable** once cut; re-cutting identical inputs reproduces identical
   hashes.
2. Only `TRAINING_READY` records may enter a version.
3. Splits are deterministic and their hashes are recorded and travel in the Training Package.
4. The Gold Pipeline never silently discards records (inherits the M1 validation philosophy).

---

## 8. Provenance & Hashing

Every experiment records verifiable provenance. Nothing is asserted that cannot be recomputed.

| Provenance item | Requirement |
|---|---|
| **Dataset hash** | Content hash of the exact dataset version used |
| **Split hashes** | `train` / `validation` / `test` hashes |
| **Git commit SHA** | Repo commit the run is based on |
| **Base model revision** | Pinned revision of `openai/gpt-oss-20b` (+ loader id) |
| **Training engine version** | Unsloth + pinned dependency set |
| **Environment metadata** | Hardware (GPU, compute capability, VRAM), driver/CUDA, key package versions |
| **Artifact integrity hashes** | Hashes of adapter, trainer state, metrics, manifest |

**Verification contract:** the notebook verifies dataset/split hashes before training; the import
path (M2-P1-02) re-verifies artifact hashes. A mismatch is a **hard failure**, never a warning.

---

## 9. Training Page UX

The Training page gains an M2 flow (existing M1 run configuration remains).

| Element | Behavior | Req |
|---|---|---|
| **Dataset version selector** | Lists immutable dataset versions; only `TRAINING_READY`-derived versions selectable | M2-P0-17 |
| **Training config inspector** | Shows the generated QLoRA/SFT config (from package): dtype `fp16`, seq length, batch, grad-accum, optimizer, LoRA `r`/`alpha`/`target_modules`, seed, checkpoint policy | M2-P0-17 |
| **Generate / Export Training Package** | Produces a downloadable Kaggle-ready package (manifest + inputs + notebook) | M2-P0-03 |
| **Exact instructions** | Displays the exact command/notebook steps to run on Kaggle, including "run as a committed/Save-Version run so `/kaggle/working` output persists" | M2-P0-17 |
| **Resilience status** | Shows `FAILED` / `INTERRUPTED` / `RESUMABLE` and the resume instructions | M2-P0-19 |
| **Import training results** | (M2-P1-01) Import metrics/manifest back into the experiment | M2-P1-01 |

**UX rule:** the page must never imply that training has run when it has not. If no real run has
occurred, the experiment shows as not-yet-trained.

---

## 10. Model Registry & Experiments

- **Register `GHARIBO-exp-001` as `EXPERIMENT` only** (ADR-0008 gates apply).
- **Lineage:** `GHARIBO-exp-001` **derived from** `openai/gpt-oss-20b`.
- **No promotion** to `CANDIDATE`/`ACCEPTED` in M2. **No `GHARIBO-V0.1`/`GHARIBO-V1` entry.**
- The Experiments record stores the **Training Package** reference, the **experiment manifest**, and
  (P1) imported results — extending M1's `experiments` table.

---

## 11. Free-Tier Resource Resilience

Individual Kaggle sessions may terminate, and GPU availability/quota is limited (free tier ≈ 30
h/week, T4 ×2 or P100; only `/kaggle/working`, ≤20 GB, persists between sessions). Therefore
**training MUST support** the following, and **an experiment is never required to finish in a single
notebook session**:

| # | Requirement | Req |
|---|---|---|
| R1 | **Checkpointing** — periodic checkpoints during training | M2-P0-10 |
| R2 | **Resume-from-checkpoint** — a supplied checkpoint resumes automatically | M2-P0-11 |
| R3 | **Deterministic dataset versions** — identical inputs → identical hashes | M2-P0-15 |
| R4 | **Immutable experiment IDs** — an experiment ID never changes meaning | M2-P0-02 |
| R5 | **Partial-run recovery** — partial progress is not lost on termination | M2-P0-10/M2-P0-20 |
| R6 | **Artifact integrity hashes** — every artifact is hashable and verifiable | §8 |
| R7 | **Interrupted-session recovery** — re-attaching prior output resumes the run | M2-P0-11 |
| R8 | **Training logs persisted outside the ephemeral runtime** | M2-P0-20 |
| R9 | **Explicit states: `FAILED` / `INTERRUPTED` / `RESUMABLE`** | M2-P0-19 |

**Design consequences to state honestly:**
- Only `/kaggle/working` survives a session (≤20 GB), so checkpoints + trainer state + metrics +
  manifest **must all live there**, and the notebook must run as a **committed/Save-Version run**.
- Multi-session resume works by re-attaching the previous run's output (or a Kaggle Dataset) as
  input and pointing `resume_from_checkpoint` at it.
- gpt-oss-20b QLoRA is documented at **~14 GB minimum**; on a 16 GB T4 that is genuinely tight, so
  multi-session, checkpointed runs are **the norm, not the exception**.
- The T4 is **Turing (sm_75)**: **bf16 is unsupported** and **FlashAttention-2 is unavailable** →
  the recipe is **fp16** and must not assume FA2.

---

## 12. Model Selection Policy

Stated exactly as decided:

- **`openai/gpt-oss-20b` is retained as the INITIAL training candidate only**, because the available
  Unsloth QLoRA path fits the free 16 GB-class GPU target.
- This does **NOT** permanently declare it the final GHARIBO foundation.
- **No paid inference bake-off.** Model comparison that requires paid inference is out of scope.
- The Model Registry records lineage: **`GHARIBO-exp-001` derived from `openai/gpt-oss-20b`.**
- **No promotion to `GHARIBO-V0.1` without evaluation.**

### 12.2 Required ADRs (governance)

New material decisions needing **ADR-0011+** (per `docs/DOCUMENTATION_GOVERNANCE.md` §5):

1. Provider-neutral **`TrainingWorker`** abstraction with **`KaggleTrainingWorker` as Worker #1**.
2. The canonical **Training Package** as the portable, reproducible training contract.
3. **Content-addressed immutable dataset versions** with deterministic, hashed splits.
4. **Zero-cost artifact policy** (HF private within free allowance; local fallback; GitHub never
   holds artifacts).

**No superseding ADR is required:** the repo is clean and no Colab or paid-provider ADR was ever
committed — the zero-cost design is the **first** M2 baseline.

---

## 13. Success Metrics & Definition of Done

### 13.1 Success Metrics

| Metric | Target |
|---|---|
| Training Package completeness | 100% of §6.1 fields present and validated on export |
| Export requires no GPU | 100% of exports succeed on a GPU-less dev machine |
| Reproducibility | Re-generating a package from identical inputs yields identical config + hashes |
| Hash verification | Notebook hard-fails on any dataset/split mismatch (0 silent passes) |
| Zero-cost compliance | $0 monetary cost; 0 references to paid providers anywhere |
| Secret exposure | 0 HF tokens in notebook source, logs, or committed files |
| Single-session assumption | 0 requirements that assume a run finishes in one session |
| Promotion safety | 0 models promoted; `GHARIBO-exp-001` = `EXPERIMENT` only |
| Governance | `npm run docs:validate` passes with updated `docs:facts` |

### 13.2 Definition of Done

1. `docs/PRD_MILESTONE_2.md` approved (this document).
2. Required ADRs (ADR-0011+) written and accepted.
3. `TrainingWorker` interface + `KaggleTrainingWorker` (Worker #1) designed; package schema defined.
4. Training Package export implemented and GPU-free.
5. Kaggle notebook generator implemented with all M2-P0-04..M2-P0-12 behaviors.
6. Gold Pipeline + immutable versions + deterministic hashed splits implemented.
7. Provenance/hashing recorded and verifiable.
8. Training page extensions (M2-P0-17) implemented.
9. `GHARIBO-exp-001` registered as **EXPERIMENT** with correct lineage.
10. Resilience states + persistence implemented.
11. `docs:facts` updated; `npm run docs:validate` passes.
12. **No fabricated data, no real training claimed, no promotion.**

---

## 14. Open Questions

| # | Question | Why it matters |
|---|----------|----------------|
| Q1 | What is the **concrete target dataset** for `GHARIBO-exp-001`, and what minimum record count makes the first run meaningful? | Defines the first real Training Package; M2 can build the pipeline without it, but the first run needs it. |
| Q2 | What **`max_seq_length`** should be the M2 default (512 vs 1024)? | Directly affects the 14 GB-minimum VRAM budget on a 16 GB T4. |
| Q3 | What is the **checkpoint interval / `save_total_limit`** given the 20 GB `/kaggle/working` cap? | Balances resume granularity against storage exhaustion. |
| Q4 | Is a **HF private repo** to be provisioned for `GHARIBO-exp-001`, or is **local export** the default destination for the first run? | `artifact_destination` is optional; the first run's default must be chosen. |
| Q5 | Which **evaluation configuration** (benchmark categories/metrics) is recorded in the first package? | The package carries `evaluation_config`; a concrete first set is needed. |
| Q6 | How should the **Kaggle notebook be delivered** — as a `.ipynb` in the package, a generated script, or both? | Affects the export format and the "exact instructions" UX. |
| Q7 | What is the **first Research-Gym domain** feeding the Gold Pipeline for `GHARIBO-exp-001`? | Determines the Harmony `developer` framing and record shape. |
| Q8 | Should `INTERRUPTED` vs `FAILED` be distinguished automatically (e.g. via heartbeat/timeout), or set manually? | Affects the resilience state machine implementation. |
| Q9 | What is the **`artifact_integrity_hash` algorithm** (e.g. SHA-256 over artifact bytes vs over a manifest of hashes)? | Must be fixed so hashes are comparable across sessions. |
| Q10 | Do we pin the **Unsloth dependency set** at M2 freeze, or allow a narrow range with verification? | Reproducibility vs. maintainability of the pinned stack. |

---

*End of PRD_MILESTONE_2.md — Milestone 2, GHARIBO AI LAB.*
