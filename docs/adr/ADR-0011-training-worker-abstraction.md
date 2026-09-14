# ADR-0011: Provider-neutral `TrainingWorker` abstraction with Kaggle as Worker #1

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | 1.1.0 |

## Context

Milestone 1 shipped a provider abstraction (ADR-0003) that decouples *which model answers a prompt*
from the application: four interchangeable backends sit behind one `ModelProvider` interface, and
nothing in the app branches on the provider type. Milestone 2 faces the analogous question for
**training compute**, under a hard constraint: GHARIBO training infrastructure must operate at
**zero monetary cost**, so the compute worker is Kaggle Notebooks (free T4) — not a paid service.

There is a real risk that "run it on Kaggle" leaks Kaggle's specifics (kernel refs, `/kaggle/working`,
Secrets, accelerator selection) into the core data model, the API, and the Training Package. If it
does, a second worker — a future free-tier or self-hosted runner (P2-01) — would require rewriting
the contract, and the project would have re-created the coupling ADR-0003 was written to avoid.

The available options were: (a) hardcode the Kaggle path, (b) build a general job-runner
orchestration layer now, or (c) mirror the proven provider abstraction with a small, pure
`TrainingWorker` interface and ship Kaggle as its first implementation.

## Decision

We will abstract training execution behind a provider-neutral **`TrainingWorker`** interface and
ship **`KaggleTrainingWorker` as Worker #1**. The interface (`apps/web/lib/workers/index.ts`) has a
runtime factory `getTrainingWorker(id)` and a discovery registry, exactly mirroring
`getProvider(config)`.

The interface is **pure**: every method is a total function from a `TrainingPackage` (plain data) to
an artifact, and none touches a GPU, the network, or a secret.

- `renderNotebook(pkg) → NotebookArtifact` — deterministic `.ipynb`
- `buildBundle(pkg) → BundleFile[]` — the on-disk bundle layout
- `instructions(pkg) → WorkerInstructions` — exact operator steps
- `normalizeStatus(raw) → WorkerStatus` — worker status → GHARIBO resilience states
- `planResume(req) → ResumePlan` — resume → patch for a **new** immutable package

Worker-specific knowledge is confined to `capabilities` (GPU class, dtype, persistent path/quota,
session length, resume/secret support) and to the Kaggle implementation directory. The package
carries **no** worker field; `artifact_destination` is worker-independent.

## Consequences

### Positive
- The Training Package describes **what** to train and stays valid for any future worker; adding a
  worker is one new directory implementing one interface, with no schema or API change.
- `normalizeStatus` is the single translation point, so the resilience state machine (ADR-0013's
  sibling design, §10) is worker-independent.
- Purity makes the worker unit-testable with no GPU and no network — the notebook generator can be
  asserted byte-for-byte in CI.
- Provider-neutrality is demonstrable, not merely claimed: `/api/training-workers` lists
  capabilities without the UI branching on `workerId`.

### Negative / Trade-offs
- An interface plus a factory plus a registry is more indirection than a single Kaggle code path;
  for exactly one implementation this is overhead we accept deliberately.
- Purity constrains the worker to render-time work; anything requiring live worker state (e.g.
  polling a running kernel) must live outside the interface, in the import path, or be deferred.
- The interface cannot express worker-specific optimizations (Kaggle `T4 x2`); the first recipe is
  single-device by policy, so this is acceptable now but will need revisiting if multi-GPU returns.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Hardcode the Kaggle path in the package and API | Couples the portable contract to one vendor; contradicts the ADR-0003 precedent and blocks P2-01 without a rewrite |
| Build a general job-orchestration layer now | Over-engineering for one worker; the orchestration semantics are not yet known, and M2 must stay zero-cost and minimal |
| Make the package carry a `worker` field | Re-introduces the coupling the abstraction removes; a package should be portable across workers, not bound to one |
| Keep the worker interface but let it hold live run state | Breaks testability and purity; run state belongs to the run/import path, not to the render-time worker |

## References

- `docs/PRD_MILESTONE_2.md` — P0-01 (provider-neutral `TrainingWorker`), G1, NG-7/NG-9
- `docs/ARCHITECTURE_MILESTONE_2.md` §2 (abstraction), §8 (API), §9 (Kaggle worker + notebook)
- `docs/ARCHITECTURE.md` §3.2 (`ModelProvider` — the pattern being mirrored), ADR-0003
- `.workbuddy-ai/artifacts/m2-stack-facts.md` §1–§2 (Kaggle free tier, T4 constraints)
- `apps/web/lib/workers/index.ts`, `apps/web/lib/workers/kaggle/*`
