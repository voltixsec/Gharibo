# ADR-0020: Truthful post-execution reconciliation without promotion

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-15 |
| **Deciders** | CTO / Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | post-M3C (`docs/ARCHITECTURE.md` v1.2.1) |

## Context

On 2026-09-15 `GHARIBO-exp-001` actually executed on the free Kaggle T4 worker — kernel
`vokaigharibo/gharibo-exp-001-kaggle-start-fec22ca2`, attempt 3 / kernel version 3,
`KernelWorkerStatus.COMPLETE`, `lastRunTime 2026-09-15 18:35:56.230000`. Run
`ea6e30f2-ce26-4323-b35a-3436ee867eaf` under package
`78dd1bf374ed1c53785ea50bf179b1b7a4764d40c121d3d41cda4e2a2e3e68f2` trained for real: 640 examples,
1 epoch, 160 steps, batch 1 x grad-accum 4, 3,981,312 trainable parameters, `train_runtime`
4041.9648 s, `train_loss` 0.6016419500112533.

Every governance mechanism written before that moment encoded the *opposite* state as a rule:

- `scripts/master/validate-master-state.mjs` enforced a **"TRAINING HAS NOT STARTED" invariant**;
- `docs/MODEL_REGISTRY.md` v1.3.0 (Frozen) and `docs/TRAINING_STRATEGY.md` v1.3.0 (Frozen) both
  assert that no training has been executed;
- the master-state roadmap `STAGE-1` was `NOT_STARTED`;
- the database run row was `QUEUED`.

A frozen *falsehood* is worse than a frozen decision. Once execution is real, the pre-execution
invariant makes the validator fail on truth, and every downstream reader (human or agent) inherits
a state that no longer exists.

Two further facts forced a decision rather than a silent update:

1. **The runtime dtype deviated from the recipe.** The package declared `fp16`; the Unsloth runtime
   emitted `Using float16 precision for gpt_oss won't work! Using float32` and then
   `Switching to float32 training since model cannot work with float16`. The produced adapter is
   stored as F32 (96 tensors, 15,938,048 bytes). The package is content-addressed and immutable, so
   its `dtype` field cannot be edited without invalidating the package hash and rewriting history.
2. **Completion is not success.** Nothing in the accepted governance permits using the held-out
   TEST split at this stage, and ADR-0008 gates promotion on at least one evaluation result plus a
   training-run reference. Neither evaluation nor promotion was authorized by the execution itself.

## Decision

We will reconcile the project's recorded state to the executed reality **without promoting,
evaluating, or retroactively editing the recipe**:

1. **Accept the execution as real.** The Kaggle evidence is accepted in
   `governance/DEC-0030-kaggle-execution-acceptance.json` and mirrored into the master state as
   `training.executionCompletion`: `CHECKSUMS.sha256` verifies 129 of 130 declared files with
   0 mismatches and its rollup
   `788bc0a77d465bcbc997e8698177fbd90c9e8e2720e549159a27684095284885` recomputes exactly over the
   full 130-entry manifest; the final adapter and checkpoint-160 are byte-identical
   (`794917f25c4aa9e77acb6a746b69a703412539e993f6bfc1e8c602d64be678f`); checkpoint-150 is
   `5e062fa0bbba3c5276e3d6086f8e7dc0a7e1605c2dbf8c1d989ecbfe5a140249`.
2. **Classify the dtype deviation as (B) material and explicitly accepted, never hidden.** It is
   recorded as `MATERIAL_RUNTIME_DEVIATION_ACCEPTED_POST_EXECUTION`: engine-imposed, not
   operator-authored. The immutable package keeps `fp16`; the master state records
   `declaredDtype: "fp16"`, `effectiveDtype: "float32"`, `recipeEditedRetroactively: false`. No
   document, report or state may describe this run as an "fp16 run".
3. **Replace the obsolete validator invariant.** The "TRAINING HAS NOT STARTED" check is replaced by
   post-execution invariants that are still fail-closed: completion evidence must be real and
   coherent, TEST must stay isolated, the dtype deviation must be recorded, both failed attempts
   must survive, and no evaluation or promotion may be claimed. Regression tests freeze all of it.
4. **Amend the two Frozen M1 specifications additively.** `docs/MODEL_REGISTRY.md` and
   `docs/TRAINING_STRATEGY.md` move v1.3.0 → v1.4.0 with a dated version note under this ADR. Their
   existing v1.3.0 notes stay **verbatim** — they were true when written, and history is the point
   (§5.4). Only the machine-checked `adrs` fact and the version/date header of
   `docs/ARCHITECTURE.md` change in the frozen baseline.
5. **Reconcile the lifecycle honestly.** The database run transitions `QUEUED → RUNNING → COMPLETED`
   through the repository state machine, auditing every step at real externally-observed
   timestamps. A direct `QUEUED → COMPLETED` jump is rejected by the state machine and remains
   illegal. Prior DEC-0026 sealing triggers are dropped only where they block the reconciliation;
   the DEC-0025 seals and all historical events are preserved.
6. **Stop at the evaluation boundary.** The terminal state of this work is
   `EVALUATION_READY_AWAITING_AUTHORIZATION`. `GHARIBO-V0.1` stays `NOT_CREATED`, evaluation stays
   `NOT_RUN`, and the model is **not** promoted. Held-out TEST evaluation requires a separate,
   explicit authorization that does not exist yet.

## Consequences

### Positive
- The canonical state, the roadmap, the database and the governed documents now agree with reality;
  a reader no longer has to choose between them.
- The dtype deviation is visible and queryable instead of being a silent discrepancy between a
  recipe and its result.
- The validator keeps failing closed — it now fails if someone claims completion *without* evidence,
  rather than failing because completion happened.
- The "no promotion without evaluation" gate (ADR-0008) is exercised for the first time against a
  real completion, which is exactly when it matters.

### Negative / Trade-offs
- The Frozen M1 baseline gains a version bump and the `adrs` fact moves 19 → 20, so the baseline is
  no longer byte-static across this change.
- The run is **not** reproducible as an fp16 run: anyone repeating it on the same hardware and
  engine will get float32 again. That is a real property of the stack (T4 + gpt-oss), not a defect
  we can fix without paid compute or a different model.
- The adapter is F32 and therefore ~2x the expected artifact size, which tightens the Kaggle
  `/kaggle/working` 20 GB budget on any future run.
- Local database reconciliation is not reproducible from Git; `DEC-0030` (not the DB) is the
  durable evidence of record.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Retroactively edit the package `dtype` to `float32` and re-issue | The package is content-addressed and immutable; editing it invalidates `78dd1bf3…`, rewrites the launch history authorized by DEC-0029, and is explicitly prohibited. The deviation is recorded beside the package instead. |
| Re-run training to obtain a true fp16 run | fp16 is unsupported for gpt-oss on T4 by the engine itself — the re-run would deviate identically. It also burns zero-cost budget and is prohibited. |
| Keep claiming training has not started | A governance fiction. It would make the validator fail on truth and mislead every future session. |
| Treat the deviation as (A) an allowed routine adaptation | It is material: precision affects artifact size, reproducibility and cost. It must be accepted explicitly, not waved through. |
| Auto-promote the adapter to `GHARIBO-V0.1` on completion | ADR-0008 requires >=1 evaluation result and a training-run reference *plus* authorization; evaluation is `NOT_RUN` and TEST use is not authorized. |
| Rewrite the v1.3.0 notes in the Frozen specs in place | Destroys the historical record. §5.4 requires additive supersession, so the old notes survive and a new note is appended. |

## References

- `governance/DEC-0030-kaggle-execution-acceptance.json` (acceptance record, `acceptanceHash`
  `06194e95c22b07a4c433154f627f20f515dbb43100e7615885345f6b0cb0c647`)
- `governance/GHARIBO_MASTER_STATE.json` → `training.executionCompletion`, `training.parameterCountReview`
- `docs/adr/ADR-0008-model-registry-status-gates.md` (promotion gates)
- `docs/adr/ADR-0017-master-state-single-source-of-truth.md` (validator; its "TRAINING HAS NOT
  STARTED" check list is amended by this ADR — the ADR itself is not otherwise changed)
- `docs/EVALUATION.md` (held-out TEST authorization boundary)
- `docs/MODEL_REGISTRY.md` v1.4.0, `docs/TRAINING_STRATEGY.md` v1.4.0
- `scripts/master/validate-master-state.mjs` (`[training-invariant]` post-execution checks)
- `scripts/verify-m3a/gates.ts` gate 12 (post-execution acceptance + runtime-deviation truthfulness)
- `apps/web/lib/__tests__/m2-gold-execution-acceptance.test.ts`,
  `apps/web/lib/__tests__/m2-post-training-lifecycle.test.ts`
- `scripts/training/build-dec0030-acceptance.mjs`, `scripts/training/verify-kaggle-result.py`
