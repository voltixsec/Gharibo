# Evaluation Benchmark Launch — `GHARIBO-exp-001` held-out TEST benchmark

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Governance |
| **Status** | Approved |
| **Version** | 1.3.0 |
| **Last Updated** | 2026-09-16 |

## 1. Purpose

`governance/DEC-0032-evaluation-authorization.json` authorized **one** governed held-out TEST
benchmark. `governance/DEC-0033-evaluation-infrastructure-blocker.json` recorded that it could not
be executed, because no GPU execution environment was available.

This document records the **clearing of that blocker, the launch of the authorized execution, the
pre-inference failure of that first launch, and the repaired relaunch**.

> **This is a launch record, not a result.** No prediction file had been downloaded and no score had
> been computed when it was written. Every M1–M13 value remains `null`.

---

## 0. Update — three launches, five defects, zero scores, and an escalation

> **CURRENT STATE: the harness-repair loop is HALTED and ESCALATED to the CEO (`DEC-0036`).**
> Three kernel pushes have been made; **all three failed pre-inference**, and **no further attempt
> is authorized**. Five distinct defect classes were found and closed, two of them introduced by the
> repair for the one before. **No TEST inference has occurred and no M1–M13 value exists.**

Attempt 1 died in cell 1 (§0.1). Its repair was relaunched and died in cell 5 (§0.3). That repair
was pushed and died in cell 6 (§0.6) — reaching further each time, and never reaching inference.

### 0.1 Attempt 1 — `NameError` in cell 1

```
NameError: name 'false' is not defined        (cell 1, 9.58 s of relative log time)
```

**Cause.** The generator emitted the governed pins as a **raw JSON literal** into Python source:

```python
PINS = { ... "doSample": false ... }      # JSON `false` is not Python `false`
```

JSON and Python disagree on `true` / `false` / `null`, so the cell raised `NameError` before the
install stage and before any model was loaded.

**Why this is recorded rather than quietly fixed.** Three reasons, in order of importance:

1. A launch whose outcome is omitted reads as a success.
2. Repairing silently and pushing again would make a two-attempt path look like a one-attempt path.
3. The failure is *diagnostically valuable*: it is the direct evidence that **no TEST inference
   occurred**, which is what keeps the single authorized execution unspent.

**No TEST inference occurred.** Verified by `scripts/eval/verify-eval-failure-evidence.py`, which
derives the conclusion from the raw log rather than asserting it (**4/4** checks): the log contains
the `NameError`, attributes it to `In [1]`, and contains **no** inference marker and **no**
install-stage marker — the failure preceded both. The script is proven to flip to
`testInferenceOccurred = true` when an inference marker is injected.

3. **Therefore the relaunch is the SAME single authorized execution restarted, not a second one.**
   `DEC-0032` `hardStops[2]` bars a repeat only where TEST inference has *materially occurred*.

### 0.2 Three defects, and the gate layer that was missing

Repairing the first defect introduced the second, and repairing that introduced the third:

| # | Defect | Class | Consequence if shipped |
|---|---|---|---|
| A | Pins emitted as a raw JSON literal | fatal at runtime | **`NameError` in cell 1** — the observed failure |
| B | Canonical encoder passed `Object.keys()` as `JSON.stringify`'s replacer | silent data loss | an array in that position is a property **allow-list applied at every level**, shredding `engineDependencies` into nine `{}` |
| C | JSON round-trip degraded the float decoding pins to `int` | silent contract degradation | `temperature` measured as `int 0`, not `float 0.0` |

**All 41 pre-existing static checks PASSED on the notebook that crashed.** Every one of them
inspected the pins *object in Node* rather than the Python actually emitted. A static checker cannot
see a runtime error, and the repair that survived was the one that **executed the artifact**.

Two gates were added, both **adversarially verified** (re-inject the defect → observe FAIL; restore
→ observe PASS):

| Gate | Checks | What it adds |
|---|---|---|
| `check-eval-kernel.mjs` | 41 → **53** | pin-encoding defect class, incl. the empty-nested-object and round-trip guards |
| `verify-eval-kernel-runtime.py` | **22** (new) | compiles every code cell and **executes the pins cell with its asserts live** |

`verify-eval-kernel-runtime.py` covers the **pre-inference surface only**. Cells that load the 20B
model are compile-checked and scanned but not executed, because doing so needs the accelerator this
gate exists to avoid requiring. It is not a substitute for the run and does not claim to be.

### 0.3 Relaunched kernel

| Field | Value |
|---|---|
| Kernel | `vokaigharibo/gharibo-eval-001-fec22ca2` (version 1) |
| Why a new id | Kaggle rejects a push whose title does not slugify to the declared id (`409 Conflict`) |
| Supersedes | `vokaigharibo/gharibo-eval-001` (failed pre-inference) |
| Status at record time | **`RUNNING`** |
| Not changed | dataset, prompts, arms, order, decoding, harness, pins |

> **From this point on, NO further relaunch is permitted without a new human decision.** Once the
> relaunch reaches inference, `hardStops[2]` binds: if it fails, or succeeds with disappointing
> numbers, the answer is to record that — not to try again.

### 0.4 Attempt 2 — the relaunch failed, on a fourth defect

The relaunched kernel did **not** reach inference either. It died in **cell 5**, during model load:

```
[unsloth_zoo.log|WARNING] Unsloth: Ignoring revision = `6cee5e81ee83917806bbde320786a8fb61efebee`
  since `unsloth/gpt-oss-20b` resolved to `unsloth/gpt-oss-20b-unsloth-bnb-4bit`,
  which does not have that revision. Pass `use_exact_model_name = True` to load your repo as-is.

RuntimeError: Unsloth: Failed to load model. Both AutoConfig and PeftConfig loading failed.
```

| # | Defect | Class | Consequence if shipped |
|---|---|---|---|
| D | Pinned base revision passed as `revision=` to Unsloth's **distribution** repo id | runtime-only loader contract | the pin is **dropped with a warning**, a substitute repo is chosen, and model load then fails outright |

`unsloth/gpt-oss-20b` is not a model repo — it is a **distribution** id that Unsloth resolves
internally to `unsloth/gpt-oss-20b-unsloth-bnb-4bit`. The pinned revision does not exist on that
substitute, so the argument was not merely useless: it made the load unsatisfiable. The e2e-qualified
convention in `scripts/qualify/qualify-kaggle-env.mjs` already loads with `model_name=LOADER_MODEL`
and **no** `revision=`; the kernel now matches it.

**Why a fourth defect survived three gates.** The pin was *recorded everywhere* and *enforced
nowhere*. It was found because a deliberately weakened static check — one that matched the string
`baseModelRevision` anywhere in the cell, satisfied by the run-record line alone — was caught
satisfying itself on an unrelated line. Tightening the check made it **FAIL**, which honestly proved
the pin had never been compared to anything. That fix added an enforcement cell that resolves the
declared revision against the **live** base repository via `HfApi().model_info` and asserts equality
**before any model loads**. `check-eval-kernel.mjs` went 49 → **53** checks.

**Still no TEST inference.** `scripts/eval/verify-eval-failure-evidence.py` was run against this
second log and returns `testInferenceOccurred = False` (4/4): **8 inference markers scanned, none
present**; install ran; 80 prompts loaded; the model load was attempted and raised;
`gold payloads found : 0`. The verifier separates inference markers (`torch.inference_mode`,
`.generate(`, `predictions-*.jsonl`, …) from **stage** markers (`Stage 1`, `uv pip install`),
because treating an installer log line as inference evidence is exactly how an unspent authorization
gets declared spent.

### 0.5 Attempt 3 — the tokenizer/processor could not be loaded, and the loop is HALTED

The second repair (kernel version 3) was pushed. It reached **further than any previous attempt** —
pins loaded, 80 prompts loaded, **all three governed install stages completed**, and
`FastLanguageModel.from_pretrained` was entered — then died in **cell 6**:

```
RuntimeError: Unsloth: Could not load the tokenizer/processor. If you are offline, make sure the
tokenizer files exist in the checkpoint folder or were previously downloaded to the Hugging Face
cache, or set HF_HUB_OFFLINE=1 to force local loading.

# underlying hub response:
HTTPStatusError: Client error '404 Not Found' for url
  https://huggingface.co/api/models/unsloth/gpt-oss-20b-unsloth-bnb-4bit/tree/main/additional_chat_templates?recursive=false&expand=false
  -> RemoteEntryNotFoundError
```

| # | Defect | Class | Note |
|---|---|---|---|
| E | tokenizer/processor unavailable at the load path | runtime-only loader defect | a transient Xet transport warning precedes the 404, so whether the folder is genuinely absent hub-side or the download was partial is **not established and is not asserted** |

**Still pre-inference, and provably so.** `verify-eval-failure-evidence.py` scans **8 inference
markers, finds none**, and classifies the run as `TOKENIZER_PROCESSOR_LOAD_FAILURE` / `MODEL_LOAD`
(4/4). Neither `base loaded from` nor `BASE loaded` appears in the log, so **no model object was
ever constructed** — which makes "no inference occurred" structural rather than merely asserted.

> **ESCALATION.** A third pre-inference failure triggers the rule `DEC-0035` wrote before it was
> needed: *escalate rather than repair again*. `DEC-0036` therefore **halts the repair loop**. No
> repair was performed, no fourth kernel was pushed, and **no fourth attempt is authorized**. The
> decision to continue — a targeted further repair, a diagnostic no-inference probe, a runtime
> change, or postponement — belongs to the CEO.

### 0.6 Pre-flight controls

Six controls are now asserted before a third push. Each is a claim about the **artifact**, checked by
a gate — not an intention:

| # | Control | Enforced by |
|---|---|---|
| PF-1 | the loader call passes **no** `revision` argument | `check-eval-kernel.mjs` |
| PF-2 | the pinned base revision is enforced against the **live** base repo | `check-eval-kernel.mjs`, `verify-eval-kernel-runtime.py` |
| PF-3 | the loader must not have substituted a repository (`_name_or_path` asserted) | `verify-eval-kernel-runtime.py` |
| PF-4 | governed pins decode with their **declared** Python types | `verify-eval-kernel-runtime.py` (executes the cell) |
| PF-5 | rendering uses the frozen render-then-tokenize convention (`developer` turn) | `check-eval-kernel.mjs` |
| PF-6 | the notebook refuses to run if any gold payload is present | `verify-eval-kernel-runtime.py`, `verify-eval-bundle.py` |

### 0.7 Three launches, five defects, zero scores

| | Count |
|---|---|
| Kernel pushes | **3** |
| Defects found and closed | **5** (A, B, C, D, E) |
| Defects introduced *by fixing the previous one* | **2** (B, D) |
| Gates hardened / added | **3** |
| Repairs without reaching inference | **2** |
| Attempts reaching the install stage | 2 of 3 |
| Attempts reaching the model-load path | 2 of 3 |
| **Attempts reaching inference** | **0** |
| **Metric values produced** | **0** |

Two of the five defects were created by the repair for the one before. That is the load-bearing
argument for a gate that **executes** the artifact rather than one that re-reads it: all 41 original
static checks passed on a notebook that could not run, and the fourth defect was invisible to every
textual check because the source was well-formed.

**Progress is real and orthogonal to the question.** Each attempt reached strictly further than the
last, which is genuine evidence that the repairs worked as repairs. It is also **no evidence at all
about model quality**, and it must never be reported as though it were.

> **Escalation rule, now triggered.** A **third** pre-inference failure must be escalated to the CEO
> rather than repaired again. Repairs are bounded by the pre-inference test rather than by a count —
> but repeated harness failure is itself evidence about the plan. `DEC-0036` is that escalation.

---

## 2. What cleared the blocker

`BLK-0004` was cleared by `DEC-0033`'s remediation, committed as `b29c043`, and extended by
`DEC-0035`.

| Blocker reason | Resolution |
|---|---|
| `KERNEL_GENERATOR_UNREPAIRED` — ad-hoc `%pip` install staging | Replaced with the accepted three-stage governed `uv` discipline, transcribed from the training manifest |
| `KERNEL_GENERATOR_UNREPAIRED` — direct `apply_chat_template(..., return_tensors='pt')` | Replaced with the frozen render-then-tokenize convention; the standing instruction moved from a `system` turn to a `developer` turn |
| No static safety gate on the kernel | `scripts/eval/check-eval-kernel.mjs` — **53** checks, verified by adversarial injection |
| No **runtime** gate on the kernel | `scripts/eval/verify-eval-kernel-runtime.py` — **22** checks, verified by adversarial injection |
| No privacy verification of the upload payload | `scripts/eval/verify-eval-bundle.py` — 19 checks, verified by adversarial injection |

**The blocker's other reason was NOT a code problem** and is addressed differently: the absence of a
GPU was resolved by using the governed Kaggle T4 route, which the zero-cost mandate permits.

---

## 3. The launch

| Field | Value |
|---|---|
| Worker | Kaggle Notebooks (free tier) |
| Accelerator | `NvidiaTeslaT4` |
| Kernel | `vokaigharibo/gharibo-eval-001-fec22ca2` (version 1) — see §0 for the superseded first push |
| Kernel URL | https://www.kaggle.com/code/vokaigharibo/gharibo-eval-001-fec22ca2 |
| Status at record time | **`RUNNING`** (a launch-time observation, not a result) |
| Dataset | `vokaigharibo/gharibo-eval-prompts-fec22ca2` (**private**) |

### 3.1 What the payload contained

The bundle inverts the training bundle's secret. During training, **TEST** was the secret held out;
during evaluation, the **ANSWER** is. So the upload carries model-visible prompts only:

| File | Included | Note |
|---|---|---|
| `dataset/prompts.jsonl` | ✅ | 80 items, `system` + `user` turns only |
| `dataset/dataset-metadata.json` | ✅ | private, `other` licence |
| `kernel/gharibo-eval-001.ipynb` | ✅ | 12 cells, 0 outputs, no embedded payload |
| `kernel/kernel-metadata.json` | ✅ | T4, internet on, private |
| `gold.jsonl` | ❌ | **held on the scoring host** |
| `test.jsonl` / `train.jsonl` / `validation.jsonl` | ❌ | never travel |

Hashes (as relaunched):

```
promptsSha256    = dcea32df3697921322afc33eae856bf6fd4e111785f63c4d399de7077e43f333
notebookSha256   = 43b407ef466c07421d85794a6754eb6238c610c248cd60d3ab5867f2cf068362
launchBundleHash = a9276863f88109409cff20507c3f83e81c8486cc2e408c6edb10a6687895dd87
```

### 3.2 Pre-upload verification

`scripts/eval/verify-eval-bundle.py` returned **19/19 PASS** immediately before upload. It proves,
from the *other* side of the wire (i.e. by loading the real gold corpus and asking whether any of it
is reachable from the payload):

- no answer-bearing file exists anywhere below the bundle root;
- no acceptance answer is reachable from the upload payload — checked against two answer shapes
  (`gold_raw`, the ~1 KB answer document, and the short parsed taxonomy labels) using an
  **escape-agnostic normalisation**, because a leak embedded inside a JSON string would otherwise be
  invisible to a literal substring scan;
- all 80 `system`/`user` turns survive byte-exactly and in the governed order;
- the recorded hashes match the bytes on disk.

The verifier was confirmed to fire on all three leak shapes by **adversarial injection**: an
answer-bearing file, a verbatim `gold_raw` paste, and an escape-obscured leak.

### 3.3 Run design

| Aspect | Value |
|---|---|
| Arms | `base`, then `candidate` |
| Order | `BASE_THEN_CANDIDATE` (required by the specification; running one arm alone would depart from the frozen design) |
| Records | 80, `testSplitHash 55466db2…0e45b` |
| Decoding | temperature 0.0, `do_sample` false, `top_p` 1.0, `top_k` 0, `max_new_tokens` 1024, seed 0, `repeats` 1 |
| Candidate identity | adapter `794917f2…678f`, asserted inside the kernel against the pinned hash |
| Base identity | revision `6cee5e81ee83917806bbde320786a8fb61efebee` |
| Harness | `gharibo-eval-harness-1.0.0` |
| Scoring | **local only**, against `gold.jsonl`; the kernel produces predictions and no score |

The kernel refuses to run if the adapter hash differs from the pin, if gradients are enabled on
either arm, if the item count is not 80, or if any gold payload is reachable in the inference
environment.

---

## 4. Authorization accounting

`DEC-0032` grants **exactly one** governed benchmark execution.

| Field | Value |
|---|---|
| `authorizationConsumed` | **`true`** |
| `furtherAttemptAuthorized` | `false` |
| `furtherAttemptRequiresNewDecision` | `true` |
| `rerunRequiresNewDecision` | `true` |

**What `authorizationConsumed: true` means here — and what it does not.**

It means: *the one permitted execution has been **committed**, and it may not be re-run for
convenience.* It does **not** mean the authorization was satisfied, and it does **not** license a
second attempt.

This is a deliberate, narrow reading. `DEC-0032` `hardStops[2]` states:

> If TEST inference has materially occurred, the run MUST NOT be repeated merely because scores are
> disappointing.

Retrying until the numbers look acceptable is test-set fitting. Marking the authorization spent
removes the discretion to do it.

**Why the relaunch did not violate this.** The condition is *material TEST inference*, and the failed
launch produced none: it died in cell 1 before the install stage, before a model was loaded, and
before a single TEST record was read (§0). The relaunch therefore restarts the same execution rather
than beginning a second one. That distinction is not asserted here — it is derived from the raw log
by `verify-eval-failure-evidence.py`, which fails if any inference marker is present.

**From the relaunch onward the condition flips.** Once this kernel reaches inference, a further
attempt requires a **new human decision**.

---

## 5. Honesty at record time

| Fact | Value |
|---|---|
| `testInferenceOccurred` | `POSSIBLY_IN_FLIGHT` |
| `testRecordsParsedLocally` | `0` |
| `metricValuesProduced` | `0` |
| `executionSucceeded` | `false` |
| Kernel pushes | `3` (all three `FAILED_PRE_INFERENCE`) |
| Defects found and closed | `5` (A, B, C, D, E) |
| Harness repairs without reaching inference | `2` |
| Harness-repair loop | **`HALTED`** by `DEC-0036` |
| Authorization consumed | `true` |
| Authorization spent | `false` — no TEST inference has materially occurred |
| `hardStops[2]` satisfied | `false` |
| `hardStops[3]` satisfied | `true` — the failures are recorded separately, not disguised |
| Further attempt authorized | `false` — a further attempt needs a **new human decision** |
| `predictionsDownloaded` | `false` |
| `scoringPerformed` | `false` |
| `evaluationStatus` | `EVALUATION_AUTHORIZED_READINESS` (unchanged) |
| `evaluationResults` | `0` (unchanged) |

No score exists. A launch is not evidence that the benchmark succeeded, and the kernel's live
`RUNNING` status is an observation about the scheduler, not about the model.

`FAILED_PRE_INFERENCE` is recorded as a **failure**, not as a zero and not as a gap to be quietly
overwritten by the relaunch. `RESEARCH_BENCHMARK.md` §9 forbids `0`, `"N/A"` and estimates as
placeholders, and a failed attempt is no more permitted to become a score than a successful one.

---

## 6. Standing guarantees

- `training.status` stays **`COMPLETED`**.
- The candidate adapter stays **EXPERIMENTAL and unpromoted**.
- `GHARIBO-V0.1` stays **`NOT_CREATED`**.
- No TEST payload content has been committed, published, or exposed. The gold answers never left the
  scoring host.
- No tuning, checkpoint selection or threshold adjustment occurred, and none is authorized.

---

## 7. What must happen next

**The next step is a CEO decision, not a fourth kernel push.** `DEC-0036` halts the repair loop and
presents four options:

| Option | What it means |
|---|---|
| **A. One targeted further repair** | Fix the tokenizer/processor load path specifically and push once more. |
| **B. A diagnostic, no-inference probe** | Establish whether the 404 is hub-side or transport-induced *before* repairing anything. This is the only option that answers the open question rather than guessing at it. |
| **C. Change the runtime** | The free-tier T4 path may not reproducibly load a 20B 4-bit model. |
| **D. Re-scope or postpone** | Record that no evaluation is possible under the current zero-cost constraints. |

`DEC-0036` presents these and **recommends none** — choosing between them is the decision the
escalation exists to obtain.

Whenever execution does resume, the standing rules are unchanged: download the prediction payloads,
verify the recorded adapter and prompt hashes against the pins, score both arms locally against
`gold.jsonl`, and register the real M1–M13 values. If a run fails, record the real error; do **not**
back-fill a score, and do **not** treat "still technically unspent" as "clear to retry". Promotion
remains a **separate** authorization from the one exercised here.

### 7.1 What has NOT happened

- No M1–M13 value exists. Every metric remains `null`; `0` is not a placeholder for it.
- No promotion, no `GHARIBO-V0.1`, no checkpoint selection, no prompt or threshold tuning.
- No TEST payload content has been committed, published, or exposed. The gold answers never left the
  scoring host.
- No tuning, checkpoint selection or threshold adjustment occurred, and none is authorized.

---

## References

- `governance/DEC-0032-evaluation-authorization.json`
- `governance/DEC-0033-evaluation-infrastructure-blocker.json`
- `governance/DEC-0034-evaluation-benchmark-launch.json`
- `governance/DEC-0035-evaluation-kernel-relaunch.json`
- `governance/DEC-0036-evaluation-escalation.json`
- `docs/EVALUATION_EXECUTION_BLOCKER.md`
- `docs/EVALUATION_AUTHORIZATION_REQUEST.md`
- `docs/RESEARCH_BENCHMARK.md` §3.5, §5, §6, §7.1, §9
- `scripts/eval/verify-eval-kernel-runtime.py`
- `scripts/eval/verify-eval-failure-evidence.py`
- `scripts/eval/check-eval-kernel.mjs`
