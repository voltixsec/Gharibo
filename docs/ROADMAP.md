# GHARIBO Roadmap

| Field | Value |
|-------|-------|
| **Document Owner** | Product (GHARIBO AI LAB) |
| **Type** | Roadmap |
| **Status** | Approved |
| **Version** | 1.1.0 |
| **Last Updated** | 2026-09-14 |

> The milestone progression below is a planning document, not a frozen baseline. It may change as
> milestones complete; the frozen architecture baseline is `docs/ARCHITECTURE.md`.

> **v1.1.0 — Zero-cost policy (2026-09-14).** Milestone 2 onward is planned under a binding
> **zero monetary cost** constraint. Free training compute (Kaggle Notebooks, T4) replaces any
> assumption of a purchased GPU machine or a paid training provider. See
> `docs/TRAINING_STRATEGY.md` §"Compute & Cost Policy (Zero-Cost)" and ADR-0011..ADR-0014.

## Overview

GHARIBO's progression from infrastructure to a full AI model family. Each milestone builds on the previous one.

## Milestone Progression

```
GHARIBO AI LAB (Infrastructure)
        |
        v
GHARIBO Dataset Factory (Data Pipeline)
        |
        v
GHARIBO Research Gym (Knowledge Building)
        |
        v
First LoRA Experiments
        |
        v
SFT (Supervised Fine-Tuning)
        |
        v
Evaluation
        |
        v
GHARIBO-V0.1 (First Candidate)
        |
        v
DPO (Direct Preference Optimization)
        |
        v
GRPO / Verifiable Tasks
        |
        v
GHARIBO-V1 (First Production Model)
        |
        v
Code Specialization (GHARIBO-Code)
        |
        v
Vision (GHARIBO-Vision)
        |
        v
Image Generation (GHARIBO-Image)
        |
        v
Video Generation (GHARIBO-Video)
        |
        v
Voice/Audio (GHARIBO-Voice)
        |
        v
Advanced Model Training
```

## Current Status: Milestone 1 — GHARIBO AI LAB (COMPLETE)

- [x] Monorepo infrastructure
- [x] Next.js full-stack app with 10 sections
- [x] Provider abstraction (OpenAI, Ollama, vLLM, HF)
- [x] Playground with streaming chat
- [x] Data Factory with pipeline + validation
- [x] Datasets with JSONL export
- [x] Research Gym with structured-knowledge task
- [x] Training Center with REAL pre-flight check
- [x] Model Registry with status gates
- [x] Evaluation framework scaffold
- [x] SQLite persistence
- [x] Python FastAPI services

## In Progress: Milestone 2 — Zero-Cost Training Pipeline

Infrastructure to *prepare* the first official experiment (`GHARIBO-exp-001`) without executing it.

- [x] M2 PRD + M2 architecture + ADR-0011..ADR-0014
- [ ] Canonical Training Package schema (provider-neutral contract)
- [ ] `TrainingWorker` abstraction + `KaggleTrainingWorker` (Worker #1)
- [ ] Kaggle notebook generator (hardware check, pinned deps, hash verification, QLoRA, checkpoint/resume)
- [ ] Export from AI LAB → Colab/Kaggle-ready Training Package
- [ ] Dataset Gold Pipeline: `RAW → NORMALIZED → REVIEW → APPROVED → TRAINING_READY` → immutable version → `TRAIN` / `VALIDATION` / `TEST`
- [ ] Provenance + hashes (dataset hash, split hashes, git SHA, base-model revision, engine version, env metadata)
- [ ] Training page extensions
- [ ] `GHARIBO-exp-001` registered as an **EXPERIMENT only**
- [ ] **Not in scope:** running training, downloading weights, fabricating benchmarks

## Next: Milestone 3 — First Real Training Run (GHARIBO-exp-001)

Executed on **free** compute under the zero-cost policy. Not started.

- [ ] Approve a dataset version to `TRAINING_READY`
- [ ] Export its Training Package from the AI LAB
- [ ] Run the Kaggle notebook on a free **T4** session (single GPU — no multi-GPU requirement)
- [ ] Train 4-bit **QLoRA + SFT** on `openai/gpt-oss-20b` with **Unsloth Core**
- [ ] Checkpoint, resume across sessions if interrupted, save LoRA adapter + trainer state
- [ ] Persist logs and artifacts outside the ephemeral runtime; optionally upload to a private HF repo
- [ ] **Requires explicit CTO authorization to execute**

## Next: Milestone 4 — Evaluation

- [ ] Run benchmarks on the trained checkpoint
- [ ] Compare base model vs. GHARIBO candidate
- [ ] Check for regressions
- [ ] Decide on promotion — no promotion to `GHARIBO-V0.1` without evaluation

## Next: Milestone 5 — GHARIBO-V0.1

- [ ] Promote the best experiment to CANDIDATE
- [ ] Register in Model Registry
- [ ] Deploy for internal testing
- [ ] Gather feedback

## Next: Milestone 6 — DPO

- [ ] Collect preference data (chosen/rejected pairs)
- [ ] Configure DPO training
- [ ] Execute training
- [ ] Evaluate improvement

## Next: Milestone 7 — GRPO

- [ ] Define verifiable tasks (math, code, structured output)
- [ ] Configure GRPO training
- [ ] Execute training
- [ ] Evaluate on verifiable benchmarks

## Next: Milestone 8 — GHARIBO-V1

- [ ] Final evaluation pass
- [ ] Promote to ACCEPTED in registry
- [ ] Officially name "GHARIBO-V1"
- [ ] Deploy

## Future: Specialization

- [ ] GHARIBO-Code (code-focused fine-tuning)
- [ ] GHARIBO-Vision (image understanding)
- [ ] GHARIBO-Image (image generation)
- [ ] GHARIBO-Video (video generation)
- [ ] GHARIBO-Voice (voice/audio)

## Future: Advanced Training

- [ ] Multi-GPU distributed training
- [ ] Continued pretraining on domain data
- [ ] Mixture-of-experts architectures
- [ ] Custom tokenizers
- [ ] Model distillation
- [ ] Automated hyperparameter optimization

## Key Principles Throughout

1. **No fake results** — every metric must be real
2. **Reproducibility** — every experiment must be re-runnable
3. **Evidence-based promotion** — models earn their version numbers
4. **Infrastructure first** — build the tools before using them
5. **Data quality over quantity** — curated > scraped
6. **Zero monetary cost** — free compute (Kaggle T4), free-tier storage, local fallback; no paid provider may become a dependency
