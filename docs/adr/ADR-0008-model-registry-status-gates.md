# ADR-0008: Gate model promotion through registry statuses

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | 1.0.0 |

## Context

The project intends to produce a family of models (GHARIBO, GHARIBO-V1, GHARIBO-Code, …).
Once models start existing, the hard question is not "can we train one" but "which one is
allowed to be called the model". Without a recorded promotion decision, the answer becomes
whoever last copied a file into a directory.

A model also needs to be traceable back to what produced it — the dataset, the training run,
and the evaluation that justified keeping it — otherwise a regression cannot be explained or
rolled back.

## Decision

We will treat the **Model Registry as the single source of truth for model identity**, with an
explicit status lifecycle:

```
EXPERIMENT → CANDIDATE → ACCEPTED → DEPRECATED
```

A registry entry records the model's provenance (base model, dataset, training run,
evaluation results) and its naming. Promotion is a **recorded state transition**, not a file
move: a model is only `ACCEPTED` when the transition has been made deliberately. Training
runs create registry entries in `EXPERIMENT`; nothing is `ACCEPTED` by default.

## Consequences

### Positive
- "Which model is current" has exactly one answer, and it is auditable.
- Provenance is structural: from an `ACCEPTED` entry you can walk back to the evaluation, the
  training run, the dataset, and the underlying records (which themselves carry provenance via
  ADR-0007).
- Deprecation is first-class, so a bad model can be retired without deleting history.
- The lifecycle gives the evaluation work a purpose — a candidate is promoted *because* it
  passed, and the evidence is attached.

### Negative / Trade-offs
- Promotion is manual by design, so it is a process step someone must remember to perform.
  Nothing enforces that the evaluation was actually good.
- The status set is a closed enum and a coarse model of reality (no "shadow", "canary", or
  per-task variants), so some real states have to be encoded in notes.
- Registry entries can drift from the filesystem: an entry may reference weights that were
  moved or deleted, since the registry does not own the artifacts (see ADR-0002's scope and
  the model-artifact ignore rules).

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Track models as directories with a naming convention only | No recorded decision, no provenance, no history — the failure mode this ADR exists to prevent |
| Full MLflow / model-server registry | Operationally heavy for a single-operator lab; would duplicate state that already lives in SQLite |
| Git tags / releases as the registry | Couples model promotion to code releases; model artifacts are deliberately not in git |
| A single `is_current` flag | Loses the intermediate states and the audit trail of how a model was promoted |

## References

- `docs/PRD.md` — P0-15 (model registry)
- `docs/MODEL_REGISTRY.md`, `docs/ROADMAP.md`
- `apps/web/lib/db/repositories/model-registry.ts`, `apps/web/components/models/promote-dialog.tsx`
