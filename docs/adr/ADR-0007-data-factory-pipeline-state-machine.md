# ADR-0007: Data Factory as an explicit pipeline state machine

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | 1.0.0 |

## Context

Training data is the scarce resource in this project. Records enter the lab from several
sources — the Playground capture buttons, imported JSONL, and the Research Gym — and they
arrive in inconsistent shapes, with missing fields, duplicated content, and untraceable
provenance.

If a record could go straight from "just captured" to "in a training dataset", the lab would
train on unvetted, unattributable data and would have no way to explain or reproduce a
dataset's contents. Conversely, if vetting were a manual, undocumented step, nothing would
be reproducible.

The design question was how to represent the lifecycle of a record so that (a) nothing reaches
a dataset without explicit human approval, (b) the state of every record is always known, and
(c) validation is consistent rather than ad hoc.

## Decision

We will model data preparation as an **explicit pipeline state machine** over
`data_factory_records`:

```
RAW → NORMALIZED → REVIEW_REQUIRED → APPROVED → TRAINING_READY
                        ↘ REJECTED
```

Every transition is a persisted status change; a record cannot skip a state. A **validation
engine** (`apps/web/lib/validation/*`) runs on ingest and on demand, executing five
independent validators — `schema`, `required_fields`, `duplicate`, `url_source`, `field_type`
— and returns a per-record verdict of **PASS / WARNING / FAIL** with itemised reasons.
Records may only be assembled into a dataset from `APPROVED` / `TRAINING_READY` states.

## Consequences

### Positive
- Provenance and consent are structural, not procedural: there is no code path from `RAW` to a
  dataset, so unvetted data cannot leak into training by accident.
- Dataset composition is reproducible — a dataset's membership is derivable from record states.
- Validation is centralised, so a new rule is one validator plus a test, applied uniformly to
  every ingest path (capture, import, research).
- The verdict vocabulary (`PASS`/`WARNING`/`FAIL`) is shared by the API and the UI, so the
  operator sees exactly what a record's problem is.

### Negative / Trade-offs
- A record must traverse states, so bulk-importing a large vetted corpus still requires an
  approval pass. This is deliberate friction, but it is friction.
- Five validators cannot express every quality notion (semantic correctness, label accuracy);
  the engine will give false confidence if treated as a quality guarantee rather than a
  hygiene gate.
- The state list is a closed enum; adding a state means touching the schema, the repository,
  the API, and the UI together.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| A boolean `approved` flag | Loses the intermediate states needed to reason about what still needs attention; no audit of how a record got here |
| Validate only at dataset-assembly time | Lets bad data accumulate silently and produces one giant error at the worst moment |
| No pipeline — train directly from captured records | Violates the project's data-provenance and reproducibility requirements |
| External data tool (Label Studio, Argilla) | Operationally heavy and would fragment the lab's state; the PRD asks for an integrated Data Factory |

## References

- `docs/PRD.md` — P0-07 (data factory pipeline), P0-08 (validation engine)
- `docs/DATA_FACTORY.md`
- `apps/web/lib/validation/*`, `apps/web/lib/db/repositories/data-factory.ts`
