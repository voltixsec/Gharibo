# GHARIBO Roadmap

| Field | Value |
|-------|-------|
| **Document Owner** | Product (GHARIBO AI LAB) |
| **Type** | Roadmap |
| **Status** | Approved |
| **Version** | 1.0.0 |
| **Last Updated** | 2026-09-14 |

> The milestone progression below is a planning document, not a frozen baseline. It may change as
> milestones complete; the frozen architecture baseline is `docs/ARCHITECTURE.md`.

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

## Next: Milestone 2 — First Real Dataset

- [ ] Configure a real provider (OpenAI-compatible or Ollama)
- [ ] Collect training data through Playground
- [ ] Run Research Gym tasks on a real domain
- [ ] Review and approve data in Data Factory
- [ ] Assemble first versioned dataset
- [ ] Export to JSONL

## Next: Milestone 3 — First LoRA Experiment

- [ ] Install PyTorch + ML dependencies on GPU machine
- [ ] Select base model (e.g., Qwen-2.5-7B-Instruct)
- [ ] Run pre-flight check (must be READY)
- [ ] Configure LoRA training run
- [ ] Execute training (real, not stubbed)
- [ ] Monitor training logs
- [ ] Save checkpoint

## Next: Milestone 4 — SFT

- [ ] Prepare SFT dataset (instruction-response pairs)
- [ ] Configure SFT training run
- [ ] Execute training
- [ ] Evaluate checkpoint

## Next: Milestone 5 — Evaluation

- [ ] Run benchmarks on trained checkpoint
- [ ] Compare base model vs. GHARIBO candidate
- [ ] Check for regressions
- [ ] Decide on promotion

## Next: Milestone 6 — GHARIBO-V0.1

- [ ] Promote best experiment to CANDIDATE
- [ ] Register in Model Registry
- [ ] Deploy for internal testing
- [ ] Gather feedback

## Next: Milestone 7 — DPO

- [ ] Collect preference data (chosen/rejected pairs)
- [ ] Configure DPO training
- [ ] Execute training
- [ ] Evaluate improvement

## Next: Milestone 8 — GRPO

- [ ] Define verifiable tasks (math, code, structured output)
- [ ] Configure GRPO training
- [ ] Execute training
- [ ] Evaluate on verifiable benchmarks

## Next: Milestone 9 — GHARIBO-V1

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
