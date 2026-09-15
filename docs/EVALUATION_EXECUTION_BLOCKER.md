# Evaluation Execution Blocker — `GHARIBO-exp-001` held-out TEST benchmark not executed

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Governance |
| **Status** | Approved |
| **Version** | 1.0.0 |
| **Last Updated** | 2026-09-16 |

## 1. Purpose

`governance/DEC-0032-evaluation-authorization.json` authorizes **one** governed held-out TEST
benchmark. This record documents why that benchmark could **not** be executed in this session,
and it does so in the only way the governing documents permit:

> An infrastructure failure before any valid metric-producing TEST inference must be recorded
> separately and MUST NOT be disguised as an evaluation result.
> — `DEC-0032` `hardStops[3]`

**No TEST inference occurred. No metric value was produced. Every M1–M13 score remains `null`.**

---

## 2. Classification

```
blockerClass  = INFRASTRUCTURE_NO_EXECUTION_ENVIRONMENT
subClass      = NO_GPU_COMPUTE_AVAILABLE
phase         = PRE_INFERENCE (before any TEST record was passed to a model)
```

This is **not** an evaluation result, **not** an `INVALID` report, and **not** a failed metric.
`evaluationStatus` therefore stays `NOT_RUN`; it does not become `INVALID`, because no
inference ran and no prediction payload exists to quarantine.

---

## 3. What was verified as READY

Every precondition the authorization and `docs/RESEARCH_BENCHMARK.md` require was satisfied
before the blocker was reached.

| Precondition | Status | Evidence |
|---|---|---|
| Authorization durably recorded | PASS | `governance/DEC-0032-evaluation-authorization.json` (`authorizationHash 079afeb7…3a96`) |
| Sequential decision id verified, not assumed | PASS | register held `DEC-0001 … DEC-0031`; `DEC-0032` is the next free id |
| `BLK-0003` closed only via this decision | PASS | `closedByDecisionId: "DEC-0032"` in Master State |
| Master State transitioned | PASS | `training.evaluationAuthorization.evaluationStatusAfter = EVALUATION_AUTHORIZED_AWAITING_EXECUTION` |
| Governance validators pass before TEST access | PASS | `master:validate` 19/19 checks |
| §3.5 leakage audit | **PASS** | `governance/EVALUATION-LEAKAGE-AUDIT.json`, hash/ID-only, 7/7 checks |
| `TRAIN ∩ TEST = 0` | PASS | split disjointness check |
| `VALIDATION ∩ TEST = 0` | PASS | split disjointness check |
| `AUDIT ∩ TEST = 0` | PASS | `testAudited: 0` (structural quarantine) |
| TEST record count | PASS | 80, `testSplitHash 55466db2…0e45b` reproduced exactly |
| Candidate adapter identity | PASS | local sha256 `794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f` — byte-exact vs pin |
| Base revision pin | PASS | `6cee5e81ee83917806bbde320786a8fb61efebee` |
| Model-visible prompt payload projected | PASS | `prompts.jsonl` 80 items, `sha256 10e8d34a…3215`; scorer-only `gold.jsonl` `1622b05a…dbb0` |
| Scoring harness deterministic | PASS | gold-as-prediction control → every defined metric 1.0 / 0.0, gates `PASS`; byte-identical across runs |
| `NOT_RUN` rule enforced structurally | PASS | `score-arm.mjs` emits `status: NOT_RUN` + all-`null` scores when no predictions exist |

The harness is not the blocker. It is complete and verified.

---

## 4. The blocker

### 4.1 No local GPU

`nvidia-smi` is absent; the host has no CUDA device. The pinned artifact is `openai/gpt-oss-20b`
(~20.9 B parameters) and the accepted runtime deviation is that the adapter was stored in
**float32** (`MATERIAL_RUNTIME_DEVIATION_ACCEPTED_POST_EXECUTION`, `DEC-0030`). A float32
20 B-parameter load needs roughly 40 GB of accelerator memory. The host has 36 GB of system RAM
and no GPU. Local execution is **not viable**, and this was confirmed before attempting it.

### 4.2 No remote GPU session was opened in this session

The mandated execution environment is a governed **Kaggle** run (`DEC-0032` `forbidden` list bars
every paid provider, and the zero-cost mandate bars Colab). Kaggle GPU execution is reachable
only by pushing a kernel and opening a GPU-backed session. Two independent constraints prevent
this from being completed inside the current session:

1. **Asynchronous, out-of-band execution.** A kernel push starts a *remote* job. It requires a
   free GPU slot, then runs unattended — the dependency install stage alone was measured at
   dozens of minutes during the accepted qualification, and the two inference arms over 80
   records at up to 1024 new tokens are expected to add on the order of an hour or more. The
   result is retrievable only after the remote job completes and its output is downloaded.
   That exceeded the execution window available to this session.
2. **Unverified kernel generator.** The kernel generator
   `scripts/eval/build-eval-kernel.mjs` has **not** been corrected or executed. Two defects were
   found while reading it against the accepted production artifacts, and pushing it unrepaired
   would produce an environment that is *not* the accepted engine freeze — which would make the
   benchmark incomparable to the qualification baseline and would itself be a governance defect:
   - **Install staging.** It uses an ad-hoc `%pip install` sequence instead of the accepted
     three-stage `uv` discipline. Reusing the accepted discipline is what makes BASE and
     CANDIDATE load in the same environment the adapter was trained and qualified in.
   - **Chat-template rendering.** It calls `apply_chat_template(..., return_tensors='pt',
     return_dict=True)` directly on message dicts, whereas the proven production path renders
     with `tokenize=False, add_generation_prompt=False` to a string and tokenizes afterwards.
     Rendering is a *frozen prompt/template rule* under the benchmark specification; getting it
     wrong would silently change the prompts the model sees.

Pushing an unrepaired kernel would not have produced a trustworthy measurement. Not pushing it
preserves the authorization: `DEC-0032` permits **one** benchmark execution, and this session did
not consume it.

---

## 5. What was NOT done, and why

| Action | State | Reason |
|---|---|---|
| TEST records parsed for inference | **NOT DONE** | no execution environment; the authorization permits TEST parsing only as part of the one benchmark execution |
| BASE inference | **NOT DONE** | same |
| CANDIDATE inference | **NOT DONE** | same |
| M1–M13 measurement | **NOT RUN** | no predictions exist; §9 forbids any non-`null` score |
| `evaluationStatus` set to a completed state | **NOT DONE** | it would be false |
| `evaluationResults` incremented | **NOT DONE** | it would be false |
| Promotion / `GHARIBO-V0.1` | **NOT DONE** | forbidden in this task regardless of outcome |

No placeholder, estimate, `0`, or `"N/A"` was written into any score field. The `NOT_RUN` rule
(`docs/RESEARCH_BENCHMARK.md` §9) is intact.

---

## 6. Consequence for the authorization

`DEC-0032` grants **exactly one** governed held-out TEST benchmark execution. Because no TEST
inference materially occurred, that grant is **not spent**. The authorization remains live and
the next session may execute the benchmark without a new decision, provided the harness is first
repaired and both arms run in a single execution.

> If TEST inference has materially occurred, the run MUST NOT be repeated merely because scores
> are disappointing.
> — `DEC-0032` `hardStops[2]`

This condition is **not** triggered: TEST inference has not occurred in any degree.

---

## 7. Required action to unblock

In order, and all before any TEST record is parsed:

1. **Repair `scripts/eval/build-eval-kernel.mjs`** — reproduce the accepted three-stage `uv`
   install discipline (`install` → `--upgrade --no-deps` → `--no-deps --upgrade torchao>=0.16.0`),
   preserve preinstalled `torch`/`triton` via a constraint file, skip `triton_kernels` on the
   preserved path, and render prompts with `tokenize=False, add_generation_prompt=False` before
   tokenizing.
2. **Generate the notebook** — run the generator to emit `scripts/eval/kaggle/gharibo-eval-001.ipynb`.
3. **Add the static safety gate** — `scripts/eval/check-eval-kernel.mjs`, importing the shared
   `FORBIDDEN_TOKENS` list, mirroring `scripts/qualify/check-qualify-harness.mjs`.
4. **Prepare the private input dataset** — `prompts.jsonl` only, never `gold.jsonl`. The filter
   already asserts `gold payloads found : 0` inside the kernel, and the dataset must remain
   private and untracked by Git.
5. **Push and run** — one governed Kaggle T4 execution covering BASE **then** CANDIDATE over the
   same 80 TEST records with identical decoding.
6. **Download outputs** — `predictions-base.jsonl`, `predictions-candidate.jsonl`, `run-record.json`.
7. **Score locally** — `score-arm.mjs` over `gold.jsonl`, producing real M1–M13 values.
8. **Register results** — `evaluationStatus` completed-equivalent, `evaluationResults >= 1`,
   real scores and hashes into Master State.

---

## 8. Standing guarantees

- Training stays `COMPLETED`. The candidate adapter stays **EXPERIMENTAL and unpromoted**.
- `GHARIBO-V0.1` stays **`NOT_CREATED`**.
- No TEST payload content has been committed, published, summarized, or exposed.
- No score exists before a real execution produces it.

---

## References

- `governance/DEC-0032-evaluation-authorization.json`
- `governance/EVALUATION-LEAKAGE-AUDIT.json`
- `governance/DEC-0030-kaggle-execution-acceptance.json`
- `docs/EVALUATION_AUTHORIZATION_REQUEST.md`
- `docs/RESEARCH_BENCHMARK.md` §3.5, §5, §6, §7.1, §9
- `docs/EVALUATION.md`
