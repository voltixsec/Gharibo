# Evaluation Authorization Request — `GHARIBO-exp-001` adapter vs held-out TEST

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Governance |
| **Status** | In Review |
| **Version** | 1.0.0 |
| **Last Updated** | 2026-09-15 |

> ## ⚠️ THIS DOCUMENT GRANTS NO PERMISSION
>
> As of **2026-09-15** the held-out `TEST` split is **NOT authorized** for use in any form. This
> document is a **request**. Until the decision block in §8 is completed and recorded as an
> accepted decision in `governance/GHARIBO_MASTER_STATE.json`, the project remains at
> `EVALUATION_READY_AWAITING_AUTHORIZATION` and `GHARIBO-exp-001` evaluation stays `NOT_RUN`.
>
> Nothing in this document, and nothing in the completion of training, may be read as consent.
> Blocker **BLK-0003** is `OPEN`.

---

## 1. What is being requested

Explicit, recorded authorization to execute **one** governed benchmark run of the
`GHARIBO-exp-001` adapter against the **held-out TEST split** (80 records of
`GHARIBO-Research-Gold-v0.1`), in order to produce the first real evaluation scores, per
[`docs/EVALUATION.md`](EVALUATION.md) and [`docs/RESEARCH_BENCHMARK.md`](RESEARCH_BENCHMARK.md).

| Item | Value |
|------|-------|
| Artifact under evaluation | `GHARIBO-exp-001` QLoRA adapter, sha256 `794917f25c4aa9e77acb6a746b69a703412539e993f6bfc1e8c602d64be678f` (== checkpoint-160) |
| Base model | `openai/gpt-oss-20b` @ `6cee5e81ee83917806bbde320786a8fb61efebee` |
| Training run | `ea6e30f2-ce26-4323-b35a-3436ee867eaf` (`COMPLETED`, 640 examples, 1 epoch, 160 steps, `train_loss` 0.6016419500112533) |
| Package | `78dd1bf374ed1c53785ea50bf179b1b7a4764d40c121d3d41cda4e2a2e3e68f2` |
| Split under evaluation | `test` — 80 records, permanently held out, `HASH_INTEGRITY_ONLY` until now |
| Effective dtype | `float32` (declared `fp16`; deviation accepted in `DEC-0030`) |
| Current evaluation status | `NOT_RUN` — no score exists and none may be invented |

## 2. What is explicitly NOT requested

- **Not** authorization to promote anything. Promotion is a separate decision governed by
  ADR-0008 and requires ≥1 evaluation result *and* an explicit promotion decision.
  `GHARIBO-V0.1` must remain `NOT_CREATED` after this run.
- **Not** authorization to use TEST for tuning of any kind: no model selection, no checkpoint
  selection, no prompt/template selection, no few-shot selection, no threshold tuning, no
  dedup or filter policy.
- **Not** authorization to train further, to re-run `GHARIBO-exp-001`, or to change the dataset.
- **Not** authorization to publish scores before they are recorded and verified.

## 3. Preconditions already satisfied

| # | Precondition | Evidence |
|---|--------------|----------|
| 1 | Training completed for real, artifacts verified | `DEC-0030`; rollup `788bc0a7…4885` recomputes; 129/130 files, 0 mismatches |
| 2 | TEST has never been read | Completion record: `test=ABSENT`, `testUsage=HASH_INTEGRITY_ONLY`, `testRecordsParsed=0` |
| 3 | Split integrity is content-addressed and reproducible | `GHARIBO-Research-Gold-v0.1`, seed `20260914`, generator `scripts/split/cut-gold-split.py` |
| 4 | Audit cohort is quarantined out of TEST | `scripts/gold_cohort.py`; `audited ∩ TEST = 0` is structural |
| 5 | Metrics are defined but unrun | `docs/RESEARCH_BENCHMARK.md` — 13 metrics (M1–M13), all `NOT_RUN` |
| 6 | Leakage-audit procedure exists | `docs/RESEARCH_BENCHMARK.md` §3.5 |
| 7 | Artifact registration path exists and excludes engine build output | `apps/web/lib/db/repositories/training-artifacts.ts` (`NON_ARTIFACT_PREFIXES`) |

## 4. Permitted scope of TEST use (if authorized)

1. **Single purpose**: produce evaluation scores for the two arms `BASE` (unadapted base model)
   and `CANDIDATE` (the `GHARIBO-exp-001` adapter).
2. **Read-only, one direction**: TEST records may be loaded for inference only. No gradient, no
   selection loop, no re-run to improve a number.
3. **Logged**: every TEST access must be recorded (count of records parsed, hash of the split
   actually read, timestamp, artifact under evaluation).
4. **No feedback**: if the result is bad, the response is a new experiment with a new dataset
   version — never another pass over TEST.

## 5. Required sequencing

1. **Leakage audit first** (`docs/RESEARCH_BENCHMARK.md` §3.5): prove train/validation and TEST
   are disjoint by hash before any TEST record is parsed.
2. Run `BASE`, then `CANDIDATE`, under the identical harness.
3. Record real scores. Every metric stays `null` (`NOT_RUN`) until its execution produces it;
   `0`, `"N/A"` and estimates are forbidden as stand-ins.
4. Leave the model unpromoted. Promotion requires a subsequent, separate decision.

## 6. Metrics to be produced

The 13 machine-verifiable metrics M1–M13 defined in `docs/RESEARCH_BENCHMARK.md`. None has a
value today.

## 7. How the outcome will be recorded

- A new decision record (`DEC-00NN`) capturing the authorization, its scope and its limits.
- Real scores written into the master state `training` / `experiments` blocks and the database —
  never hand-written into documentation as prose.
- `BLK-0003` moved `OPEN → CLOSED` only by that decision, never by this request.

## 8. Decision required

| Field | Value |
|-------|-------|
| Decision | *(AUTHORIZED / AUTHORIZED WITH LIMITS / REJECTED / DEFERRED — unfilled)* |
| Decider | *(CTO or CEO — unfilled)* |
| Date | *(unfilled)* |
| Scope limitations | *(unfilled — e.g. single run, no selection, no promotion)* |
| Resulting decision id | *(to be created on approval)* |

**This block is deliberately empty.** Filling it is a human act. Until it is filled, no TEST
record may be parsed.

## 9. If authorization is not granted

The project stays exactly where it is: `EVALUATION_READY_AWAITING_AUTHORIZATION`,
evaluation `NOT_RUN`, `GHARIBO-V0.1` `NOT_CREATED`, roadmap `STAGE-1` `IN_PROGRESS`. That is a
valid, honest end state — the alternative is a number nobody earned.

## References

- [`docs/EVALUATION.md`](EVALUATION.md) — evaluation framework (Frozen, v1.2.0)
- [`docs/RESEARCH_BENCHMARK.md`](RESEARCH_BENCHMARK.md) — metric definitions (Draft, v1.1.0)
- `docs/adr/ADR-0008-model-registry-status-gates.md` — promotion gates
- `docs/adr/ADR-0020-post-execution-truth-reconciliation.md` — why we stop here
- `governance/DEC-0030-kaggle-execution-acceptance.json` — accepted execution evidence
- `governance/GHARIBO_MASTER_STATE.json` — `blockers.BLK-0003`, `nextActions.ACT-0001`
