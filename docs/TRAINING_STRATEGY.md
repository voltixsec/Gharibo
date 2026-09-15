# GHARIBO Training Strategy

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Domain spec |
| **Status** | Frozen |
| **Version** | 1.4.0 |
| **Last Updated** | 2026-09-15 |

> Part of the Milestone 1 architecture baseline. See `docs/DOCUMENTATION_GOVERNANCE.md` §5 for
> change control and `docs/ARCHITECTURE.md` §1.3 for how this subsystem is wired.

> **v1.1.0 — Zero-cost policy (2026-09-14).** Milestone 2 establishes a binding **zero monetary
> cost** constraint on training. The compute policy in §"Compute & Cost Policy (Zero-Cost)" below
> is authoritative; it is recorded in ADR-0011 (provider-neutral `TrainingWorker`, Kaggle as
> Worker #1), ADR-0012 (canonical Training Package), ADR-0013 (content-addressed dataset
> versions), and ADR-0014 (zero-cost artifact policy). The incremental design lives in
> `docs/ARCHITECTURE_MILESTONE_2.md`.

> **v1.3.0 — Milestone 3A: READY_FOR_ENV_QUALIFICATION (2026-09-13).** No training has been executed.
> The autonomous work session completed Sections A–H: source artifact forensics, gold dataset
> construction (800 examples in Harmony format), dependency freeze promotion (6→12), verify-m3a gate
> runner (12 gates, 51 checks PASS), benchmark definitions, and the GHARIBO-exp-001 readiness package.
>
> 1. **The engine dependency freeze set is complete (12 entries) but versions are unresolved.**
>    `PINNED_ENGINE_DEPENDENCIES` (`apps/web/lib/training/package.ts`) now pins the full set:
>    `torch`, `triton`, `unsloth_zoo`, `unsloth`, `transformers`, `triton_kernels`, `peft`, `trl`,
>    `datasets`, `accelerate`, `bitsandbytes`, `openai-harmony`. `resolvedVersion` is `null` for every
>    entry — real versions require a Kaggle T4 run. The git specs for `unsloth` / `unsloth-zoo` /
>    `transformers` still track upstream default branches; the qualification harness will resolve
>    them to exact commit SHAs.
> 2. **The first dataset exists: `GHARIBO-Research-Gold-v0.1`.** 800 verified examples (640 train /
>    80 validation / 80 test), all pairwise disjoint, deterministic seeded split (seed=3407),
>    TEST permanently held out. Dataset, split, and source-manifest hashes computed. Dataset card
>    at `data/processed/gharibo-research-gold-v0.1/dataset-card.json`.
>
> **Unblock path.** Run the qualification harness on a free Kaggle T4
> (`scripts/qualify/qualify-kaggle-env.ipynb`); it resolves the exact versions and commit SHAs and
> emits a freeze artifact conforming to
> [`docs/ENV_QUALIFICATION_CONTRACT.md`](ENV_QUALIFICATION_CONTRACT.md), which pastes into
> `PINNED_ENGINE_DEPENDENCIES`. That contract requires the frozen form to be an **exact pin** —
> `name==version` for pip and `git+<url>@<40-hex commit>` for git — so a branch-tracking spec is not
> an acceptable freeze. Until the artifact exists and is `QUALIFIED`, the recipe is not reproducible
> and `GHARIBO-exp-001` must not be launched.
>
> **Unchanged.** The T4 constraints below (fp16 only, no bf16, no FlashAttention-2, ~14 GB
> VRAM floor), the zero-cost constraint, the free-tier resilience requirements, and the Harmony
> format requirement all remain binding.
>
> *(The block above is the verbatim v1.3.0 note. It was true when written and is retained as
> history per `docs/DOCUMENTATION_GOVERNANCE.md` §5.4. It is superseded for current-state purposes
> by the v1.4.0 note below.)*
>
> **v1.4.0 — first real execution completed; the fp16-only T4 assumption is corrected
> (2026-09-15).** Authorised by [ADR-0020](adr/ADR-0020-post-execution-truth-reconciliation.md),
> recorded as `DEC-0030`.
>
> 1. **Training has been executed.** `GHARIBO-exp-001` ran on the free Kaggle T4 worker (kernel
>    version 3, `KernelWorkerStatus.COMPLETE`): 640 examples, 1 epoch, 160 steps, batch 1 x
>    grad-accum 4, 3,981,312 trainable parameters, `train_runtime` 4041.9648 s, `train_loss`
>    0.6016419500112533. The statement "No training has been executed" above is **no longer true**
>    as of 2026-09-15.
> 2. **Correction to the T4 precision assumption.** The "fp16 only" constraint as written is
>    **wrong for `gpt-oss` on T4**: the Unsloth runtime refuses it —
>    `Using float16 precision for gpt_oss won't work! Using float32` followed by
>    `Switching to float32 training since model cannot work with float16` — and trained in
>    **float32**. The produced adapter is stored as F32 (96 tensors, 15,938,048 bytes). The
>    package's declared `fp16` is **not** retroactively edited; the master state records
>    `declaredDtype: "fp16"`, `effectiveDtype: "float32"`, `recipeEditedRetroactively: false`.
>    Future runs on this stack must budget for float32 memory (~2x the fp16 estimate against the
>    ~14 GB T4 floor) and must not be described as fp16 runs.
> 3. **Execution is not promotion and not evaluation.** `GHARIBO-V0.1` remains `NOT_CREATED`,
>    evaluation remains `NOT_RUN`, and the held-out TEST split remains untouched
>    (`HASH_INTEGRITY_ONLY`). The terminal state of this milestone is
>    `EVALUATION_READY_AWAITING_AUTHORIZATION`.

## Philosophy

GHARIBO follows a disciplined training philosophy:

### What belongs in model weights (training)
- Skills (reasoning, coding, writing, analysis)
- Behavioral patterns (following instructions, structured output)
- Domain knowledge that is stable (taxonomies, frameworks, core concepts)
- Language understanding and generation

### What belongs in tools/retrieval (NOT training)
- Fast-changing information (news, prices, stock data)
- Real-time data (weather, traffic, live metrics)
- Large knowledge bases (product catalogs, documentation)
- External system state (APIs, databases, services)

### Principle
Do not attempt to permanently train daily news, prices, or rapidly changing data into model weights. Use web research, retrieval, tools, and external knowledge stores for dynamic information. Train the model's ability to USE these tools effectively, not to memorize their output.

## Compute & Cost Policy (Zero-Cost)

**Binding constraint:** GHARIBO training infrastructure must currently operate at **zero monetary
cost**. This is a CEO-level constraint and may not be relaxed without an explicit written change.

| Concern | Decision |
|---------|----------|
| **Primary training worker** | Kaggle Notebooks — **free GPU tier** |
| **Target accelerator** | NVIDIA **T4** |
| **Multi-GPU** | Kaggle may expose T4 ×2, but the first recipe **must not require** multi-GPU execution |
| **Training engine** | **Unsloth Core** (pinned install set — a bare `pip install unsloth` is insufficient) |
| **Initial base candidate** | `openai/gpt-oss-20b` — the **initial candidate only**, not permanently the foundation |
| **Initial method** | 4-bit **QLoRA + SFT** |
| **First experiment** | `GHARIBO-exp-001` (registered as an EXPERIMENT only) |
| **Paid providers** | **Prohibited** — no Together AI, RunPod, Vertex AI, Lambda, CoreWeave, etc. |
| **Paid inference bake-off** | **Prohibited** — model selection must not consume paid inference budget |
| **Artifact storage** | Hugging Face **private** repo within the free allowance, plus a complete **local export/download fallback**. GitHub holds source and documentation only. |

### Hardware reality (T4 = Turing, compute capability 7.5)

The T4 is a Turing-generation GPU. This has concrete consequences the recipe must respect:

- **bf16 is not supported** (bf16 requires compute capability ≥ 8.0) — the recipe uses **fp16**.
- **FlashAttention-2 is unavailable** — do not enable it.
- **VRAM is tight.** `gpt-oss-20b` in 4-bit QLoRA needs roughly 14 GB minimum (16 GB recommended)
  on a 16 GB T4. The recipe must verify VRAM before starting and degrade sequence length if needed.

### Free-tier resilience (mandatory)

Because a Kaggle session is ephemeral and time-limited (≈30 h/week of GPU), a run must **never** be
required to complete in one session. The pipeline must support:

1. checkpointing;
2. resume-from-checkpoint (automatic when a checkpoint is supplied);
3. deterministic dataset versions;
4. immutable experiment IDs;
5. partial-run recovery;
6. artifact integrity hashes;
7. interrupted-session recovery;
8. training logs persisted **outside** the ephemeral runtime;
9. explicit `FAILED` / `INTERRUPTED` / `RESUMABLE` states.

### Format correctness

`gpt-oss-20b` is trained in the **OpenAI Harmony** format (roles `system` / `developer` / `user` /
`assistant` / `tool`; channels `final` / `analysis` / `commentary`). Training data must preserve
Harmony formatting — records are mapped to Harmony conversations by the canonical Training Package
(ADR-0012), never hand-serialized per-experiment.

## Training Methods (Phase 1)

### LoRA (Low-Rank Adaptation)
- Freezes base model weights, trains small adapter matrices
- Efficient: trains <1% of parameters
- Good for: behavioral alignment, style adaptation, domain specialization
- Typical: rank 8-64, alpha 16-128, target modules q_proj/v_proj

### QLoRA (Quantized LoRA)
- Base model quantized to 4-bit (NF4), LoRA adapters trained at full precision
- Dramatically reduces VRAM requirements (fits 7B model in ~6GB VRAM)
- Good for: training on consumer GPUs, rapid experimentation
- Trade-off: slight quality degradation vs full LoRA

### SFT (Supervised Fine-Tuning)
- Full or partial model fine-tuning on curated instruction-response pairs
- Good for: significant behavioral shifts, new capability acquisition
- Requires more VRAM than LoRA/QLoRA
- Typically: full fine-tune or last few layers

## Training Pipeline

```
1. Collect data (Playground saves, Research Gym, external sources)
2. Review & approve in Data Factory
3. Assemble into versioned Dataset
4. Export to JSONL
5. Configure Training Run (base model, method, hyperparameters)
6. Run pre-flight check (Python, PyTorch, CUDA, GPU, VRAM, deps, disk, dataset, model)
7. Launch training (P1: actual execution; P0: launch-ready with DRAFT status)
8. Evaluate checkpoints against benchmarks
9. Compare base model vs. candidate
10. Promote in Model Registry (EXPERIMENT -> CANDIDATE -> ACCEPTED)
```

## Future Methods (Phase 2+)

### DPO (Direct Preference Optimization)
- Trains on chosen/rejected response pairs
- Good for: alignment, quality improvement, preference learning
- Extension point: clean interface in Training Center

### GRPO (Group Relative Policy Optimization)
- Reinforcement learning with verifiable rewards
- Good for: tasks with objective correctness (math, code, structured output)
- Extension point: clean interface in Training Center

### Continued Pretraining
- Further pretraining on domain-specific text
- Good for: domain adaptation (medical, legal, technical)
- Extension point: clean interface in Training Center

## Pre-Flight Check

Before any training launch, the system performs REAL environment checks:

| Check | What it verifies | How |
|-------|-----------------|-----|
| Python | Version >= 3.10 | `sys.version_info` |
| PyTorch | Importable + version | `import torch` |
| CUDA | Available | `torch.cuda.is_available()` |
| GPU | Device count + name | `torch.cuda.device_count()`, `get_device_name()` |
| VRAM | Free memory >= 4GB | `torch.cuda.mem_get_info()` |
| Transformers | Importable + version | `importlib.import_module("transformers")` |
| PEFT | Importable + version | `importlib.import_module("peft")` |
| TRL | Importable + version | `importlib.import_module("trl")` |
| Disk | Free space >= 10GB | `psutil.disk_usage()` |
| Dataset | File exists + valid JSONL | Parse each line as JSON |
| Base Model | Local path or HF Hub | `os.path.exists()` or `requests.head()` |

The check runs in the Python trainer service (port 8100) and is proxied through the Next.js API. If any critical check is NOT_READY, the UI displays "ENVIRONMENT NOT READY" with an explanation.
