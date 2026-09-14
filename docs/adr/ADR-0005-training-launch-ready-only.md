# ADR-0005: Training is launch-ready only in Milestone 1

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | 1.0.0 |

## Context

The project's stated goal is a real GHARIBO model family. There is strong pressure to show a
"training" screen that produces numbers, and equally strong pressure from the project's own
rules: no fake training, no fake metrics, no hardcoded demo results.

The machine in use has no GPU, and PyTorch/transformers/peft/trl are not installed. Actual
training therefore cannot run here yet — but the *readiness* of a training environment can be
genuinely measured.

The choice was between (a) simulating a training run so the UI looks complete, (b) hiding the
Training section entirely until hardware exists, or (c) building the full configuration and
environment-validation path, and refusing to pretend to execute.

## Decision

We will make Training **launch-ready but not executing** in Milestone 1:

- Training runs are created in `DRAFT` status and persisted.
- `POST /train` on the trainer service returns **HTTP 501 Not Implemented**.
- The **pre-flight check is real**: the Python service imports `torch` and inspects
  CUDA availability, GPU device count/name, VRAM, `transformers`/`peft`/`trl` presence, free
  disk, dataset validity, and base-model availability, reporting `READY` / `NOT_READY` /
  `UNKNOWN` per item. On this machine it correctly reports `NOT_READY` for the GPU items.
- No metric is ever fabricated. There is no placeholder loss curve and no synthetic accuracy.

## Consequences

### Positive
- The lab never lies about what it has done, which is the precondition for trusting anything
  it reports later. A `NOT_READY` pre-flight is a useful, honest signal.
- Every artifact needed for the first real run already exists: validated datasets, a
  hyperparameter configuration surface, run history, and an environment gate.
- The pre-flight check is the migration checklist — it tells an operator exactly what to
  install or provision to move from "launch-ready" to "executing".
- No wasted effort producing convincing-looking fake output.

### Negative / Trade-offs
- The Training section looks "incomplete" to a casual observer: you can configure and check
  but not run. This is a deliberate trade against the project's honesty rule.
- `/train` returning 501 is a dead endpoint until P1; clients must handle it.
- The pre-flight check depends on the Python service being up. When it is unreachable the web
  app degrades to a single `trainer_service NOT_READY` item rather than failing.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Simulate a training run to make the UI look finished | Directly violates the project's no-fake-results rule; destroys trust in every later metric |
| Omit the Training section until a GPU exists | Loses the ability to prepare configuration, datasets, and the environment gate in advance; delays the first real run |
| Run a tiny CPU-only training job to "prove" the pipeline | Cannot be done without installing torch, and would still not exercise CUDA/VRAM paths; risks implying capability the machine lacks |

## References

- `docs/PRD.md` — P0-11 (training config), P0-12 (real pre-flight)
- `docs/TRAINING_STRATEGY.md`, `docs/ROADMAP.md`
- `services/trainer/core/preflight_checks.py`, `services/trainer/routers/training.py`
