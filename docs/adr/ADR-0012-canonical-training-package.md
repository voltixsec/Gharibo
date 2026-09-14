# ADR-0012: The canonical Training Package as the portable, reproducible training contract

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | 1.1.0 |

## Context

M1 stopped short of real training (ADR-0005): the Training Center can configure a run and perform a
genuine pre-flight check, but nothing executes. M2 must close the gap between *"we have a curated
dataset"* and *"we can re-run a fine-tune reproducibly"* on free Kaggle GPUs, across **multiple
notebook sessions**.

For that to be trustworthy, the run definition must be a single, self-contained, portable artifact
that an independent operator can execute and that fully determines the result: the experiment id,
the exact code commit, the base model **and** its loader representation, the dataset version and its
hashes, the exact pinned engine dependencies, the full QLoRA/SFT configuration, the seed, the
sequence length, the checkpoint policy, the (optional) artifact destination, and the evaluation
intent. If any of these live only in a database row or in someone's head, reproducibility is a
claim rather than a property — and the project's first rule is that it must never claim what it has
not done.

The options were: (a) keep training config as loose DB rows and ad-hoc command lines, (b) write a
custom export script per run, or (c) define one versioned, immutable, self-describing **Training
Package** that both GHARIBO and the worker consume.

## Decision

We will define a single **canonical Training Package** — one JSON manifest plus its referenced
inputs (JSONL splits), its run-specific notebook, and a checksum file — as the portable,
reproducible training contract. The manifest carries **every** field in PRD §6.1, in `snake_case`
matching §6.1 verbatim, with a `schema_version` making it self-describing.

Rules:

1. **GPU-free generation.** Building a package requires no GPU and no paid service.
2. **Immutability.** A package is immutable once issued; any change (config, data, resume) produces
   a **new** package with a new `package_id` = `sha256(canonical manifest)`. In-place edits never
   occur.
3. **Optional destination.** `artifact_destination` may be `null`; the package is still complete
   (local fallback).
4. **No secrets.** Tokens are referenced by name (a Kaggle Secret name), never stored.
5. **Schema versioning.** The reader accepts a package iff the `major` matches; a higher `minor` is
   forward-compatible (unknown keys ignored); a different `major` is a hard failure.
6. **Fail-loud validation.** A documented validator (`validatePackage`) rejects a package on any
   ERROR: missing required field, un-supported schema major, non-hex/absent dataset or split hash,
   an empty split, a dataset version that is not `TRAINING_READY`, non-derivable LoRA values,
   `dtype !== fp16`, a sequence length outside `{512,1024}`, empty engine dependencies, a
   non-private HF destination, `evaluation_config.executed !== false`, a non-`steps` save strategy,
   or a `package_id` that does not match the recomputed manifest hash.
7. **Both notebook forms.** A canonical template `.ipynb` is committed to the repo **and** a
   run-specific copy is included in the bundle.

## Consequences

### Positive
- Reproducibility becomes a property of an artifact, not a promise: the same package re-executes the
  same configuration, and its hashes are independently recomputable.
- The package is worker-neutral (ADR-0011) and storage-neutral (ADR-0014), so it survives a change
  of compute or destination without a rewrite.
- Content-addressing (`package_id`) gives free integrity checking and makes "which package produced
  this run?" answerable forever.
- Export can be implemented and tested with no GPU, so the pipeline is verifiable on the dev machine.

### Negative / Trade-offs
- A strict schema plus a validator is real upfront work, and every future field is a versioning
  decision — flexibility is traded for reproducibility.
- Immutability means resume issues a **new** package rather than editing one; operators must track
  package ids to follow a run's lineage.
- `snake_case` on the wire vs camelCase in TS adds a mapping layer (consistent with the existing
  DB↔TS convention, but it is a layer).
- The package can only be as reproducible as its pinned dependencies; without exact pins (Q10) it
  would degrade to "probably the same", which is why pinning is mandatory.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Keep training config as loose DB rows + a per-run shell command | Not portable, not immutable, not self-describing; nothing an independent operator could re-execute reliably |
| A bespoke export script per experiment | Duplicated logic, un-versioned, and no schema to validate against; drift is inevitable |
| A mutable "current config" that the notebook re-fetches | Breaks immutability and offline execution; a run could change underneath the operator |
| Embed the base model weights in the package | Inflates the bundle, defeats the free-tier storage budget, and is unnecessary — weights are pulled from the pinned revision |

## References

- `docs/PRD_MILESTONE_2.md` — P0-02, P0-03, P0-04, G1; §6.1 (schema), §6.3 (lifecycle)
- `docs/ARCHITECTURE_MILESTONE_2.md` §3 (type, manifest, bundle, versioning, validation)
- `docs/TRAINING_STRATEGY.md`, `docs/MODEL_REGISTRY.md` (lineage)
- `.workbuddy-ai/artifacts/m2-stack-facts.md` §3, §6 (model ids, Harmony)
- `apps/web/lib/training/{package,validate,export}.ts`, `apps/web/lib/workers/kaggle/notebook.template.ipynb`
