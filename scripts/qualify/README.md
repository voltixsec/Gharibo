# Milestone 3A / 3C — free-Kaggle environment qualification harness

GHARIBO's training engine cannot start because its dependency set is **not pinned to
exact reproducible versions**. `PINNED_ENGINE_DEPENDENCIES` in
`apps/web/lib/training/package.ts` currently pins the base model by revision and
`triton_kernels` by commit, but `torch`/`triton` are floors (`>=`), the
`unsloth` / `unsloth-zoo` / `transformers` git specs track upstream branches with no
commit SHA, and **every `resolvedVersion` is `null`**.

Those values cannot be guessed. They have to be produced by actually installing the
stack on the target hardware. This harness does exactly that on the **free Kaggle GPU
tier (T4 or better)** and emits an artifact conforming to
[`docs/ENV_QUALIFICATION_CONTRACT.md`](../../docs/ENV_QUALIFICATION_CONTRACT.md) v1.4.0
(artifact schema `1.1.0`, harness version `2.1.0`).

The harness answers **two** questions, and both must pass before the engine may freeze:

| part | question | contract |
| --- | --- | --- |
| **A — dependencies** | Is the engine pin-set resolvable, exact, and reproducible? | §4–§12 |
| **B — model compatibility** | Does `openai/gpt-oss-20b` actually load, initialise and run a forward pass on *this* real GPU — without training? | §13–§14 |

Part A alone can be satisfied by a machine with no GPU. Part B cannot: it exists to
replace "we believe a 20B MoE fits in 16 GB with QLoRA" with "we measured it fitting".

## Files

| file | role |
| --- | --- |
| `qualify-kaggle-env.ipynb` | **The runnable harness.** Upload this to Kaggle and Run All. |
| `qualify-kaggle-env.mjs` | The deterministic generator that renders the notebook (mirrors the M2 `notebook-render.ts` template + sentinel pattern). It injects the dependency inventory, the model/recipe identity and the dataset hashes straight from the repo, so the notebook cannot drift from the pins. |
| `check-qualify-harness.mjs` | Structural/contract validator. Enforces "never fabricate a version or SHA", "qualification only", the T4 constraints, pin/inventory consistency, the model-compatibility sequence, and conformance to the qualification contract. |
| `README.md` | This file. |

Do not hand-edit the `.ipynb` — edit `qualify-kaggle-env.mjs` and re-render.

```bash
npm run qualify:render   # re-render the notebook after editing the generator
npm run qualify:check    # CI gate: freshness + contract conformance
```

## What the harness does

### Part A — dependencies (§4–§12)

1. Prints the detected hardware (GPU model, compute capability, VRAM bytes, CUDA,
   cuDNN, Python, torch).
2. **Fails loudly before doing anything expensive** if the GPU is not sufficient for
   `gpt-oss-20b` 4-bit QLoRA (needs `>= sm_75` and `>= 14 GiB` VRAM).
3. **Verifies the attached dataset before installing anything.** It locates the
   operator-attached Kaggle Dataset under `/kaggle/input`, recomputes the **train split
   hash** from the raw line bytes, and **aborts on any mismatch** — a qualification run
   against the wrong data would be worthless. Only `train.jsonl` is required
   (TRAIN-ONLY fixture: `qualification_fixture_source = "TRAIN_ONLY"`,
   `test_data_accessed = false`). A `qualification_fixture_hash` is computed over
   the 2-8 deterministic fixture examples.
4. Installs the training stack via **`uv`**. A plain `pip install unsloth` does *not*
   work — this is a known trap — so `uv` is used for the whole resolved transaction.
5. Resolves and records the exact working versions for `unsloth`, `unsloth_zoo`,
   `transformers`, `torch`, `triton`, `triton_kernels`, `peft`, `trl`, `datasets`,
   `accelerate`, `bitsandbytes`, and the Harmony package.
6. Records exact **git commit SHAs** for every git-sourced dependency, read from the
   PEP 610 `direct_url.json` metadata (`vcs_info.commit_id`) — not from a guess.
7. Runs a **second, fresh resolution** in a throwaway venv with no cache and asserts
   the two dependency sets are identical (contract §6).
8. Writes `/kaggle/working/env-qualification.json` in canonical form, plus a
   human-readable report, a paste-ready TypeScript snippet and a checksum rollup.
9. **Self-validates against contract §10 before finishing** and aborts if the record it
   just produced would be invalid.

### Part B — model compatibility (§13–§14)

Ten further steps run in a fixed, recorded order (`model_compatibility.steps[]`), each
capturing `ok` / `seconds` / `error`:

| # | step | what it proves |
| --- | --- | --- |
| 1 | `resolve_base_model_revision` | the exact revision of `openai/gpt-oss-20b` in use |
| 2 | `resolve_loader_model_revision` | the exact revision of `unsloth/gpt-oss-20b` |
| 3 | `load_tokenizer` | the tokenizer loads at the pinned revision |
| 4 | `verify_harmony_encoding` | `openai_harmony` exposes the gpt-oss encoding |
| 5 | `verify_harmony_tokenizer` | the tokenizer round-trips a Harmony conversation |
| 6 | `tokenize_real_example` | a **real GHARIBO example** tokenizes |
| 7 | `load_base_model` | the base model loads 4-bit on this GPU |
| 8 | `init_qlora_adapters` | LoRA/QLoRA adapters attach |
| 9 | `count_parameters` | total / trainable / percentage |
| 10 | `collate_batch` | one small batch collates with the declared shape |
| 11 | `parameter_digest_before` | the pre-forward fingerprint |
| 12 | `forward_dry_run` | one forward pass under `no_grad`, **forward-only** |
| 13 | `parameter_digest_after` | the post-forward fingerprint — must equal step 11 |
| 14 | `verify_artifact_destination` | the checkpoint destination is writable |

The real example is chosen **deterministically** — the TRAIN record whose
`sha256(line bytes)` sorts first — so re-running picks the same record.

**It never trains.** `QUALIFICATION_ONLY = True` is asserted on the execution path and
runtime tripwires stay armed across the whole run, including while the model is loaded.
The forward dry run passes **no `labels`**, so no loss exists to differentiate; and it is
bracketed by a sha256 digest over the trainable parameters, so
`model_parameters_updated` is *proven* `false` rather than asserted. When no model was
loaded there is no digest pair and the field is `null` — never a fabricated `false`.

It never prints, logs or writes a secret — every echoed string passes through
`redact()`, which strips URL credentials, `?token=`-style query values and
`hf_`/`ghp_`/`sk-`-shaped strings — and the record additionally passes a path scrubber so
no filesystem path reaches the publishable artifact. It reads no environment variable
except `VIRTUAL_ENV`.

## How to run it on Kaggle (free tier)

1. Go to <https://www.kaggle.com/code> → **New Notebook** → **File → Import Notebook**
   → upload `scripts/qualify/qualify-kaggle-env.ipynb`.
2. Notebook **Settings → Accelerator → GPU (T4 or better)**. The harness detects all
   visible GPUs but the Unsloth loader uses a single device. Multi-GPU info is
   recorded for audit (`gpu_models`, `vram_per_gpu`, `total_visible_vram`).
3. Notebook **Settings → Internet → On**. The install, the git clones and the model
   download all need it.
4. **Attach the dataset (TRAIN-ONLY fixture).** Attach `GHARIBO-Research-Gold-v0.1`
   as a Kaggle Dataset input containing **only `train.jsonl`**. Do **NOT** attach
   `validation.jsonl` or `test.jsonl` — the qualification fixture is sourced from
   TRAIN_ONLY and `test_data_accessed` is `false`. Part B cannot run without the train
   split, and the harness verifies it against the committed hashes before installing
   anything.
5. **Do not add any Kaggle Secret.** This harness needs no token and reads none.
6. **Run All.** The install dominates the runtime, the reproducibility pass installs the
   stack a second time, and part B downloads ~12 GB of weights, so expect a long
   single-cell wait rather than a fast run.
7. Run it as a **Save Version / committed** run so `/kaggle/working` persists as
   notebook Output, then download the outputs.

**No auto-freeze:** The harness produces the qualification artifact but does NOT
automatically apply any dependency freeze. `auto_freeze_applied` is `false` and
`experiment_authorized` is `false`. The CTO must inspect `env-qualification.json`
before any freeze is applied or `GHARIBO-exp-001` is authorized.

**Output hygiene:** Only `env-qualification.json`, `env-qualification.md`,
`PINNED_ENGINE_DEPENDENCIES.frozen.ts`, `qualification-install-args.json`, and
`CHECKSUMS.sha256` are written to `/kaggle/working`. No model weights, LoRA adapters,
checkpoints, HF cache, or dataset copies are exported. The harness checks for
forbidden output files and reports `output_hygiene_verified`.

## Outputs (in `/kaggle/working`, also the notebook Output)

| file | what it is |
| --- | --- |
| `env-qualification.json` | The contract artifact (contract §2). This is the one that matters. |
| `env-qualification.md` | The same information as a human-readable report. |
| `PINNED_ENGINE_DEPENDENCIES.frozen.ts` | Paste-ready replacement for `PINNED_ENGINE_DEPENDENCIES`. |
| `qualification-install-args.json` | The exact `uv` arguments used, for reproducing the environment. |
| `CHECKSUMS.sha256` | Per-artifact hashes + rollup. |

## Reading `env-qualification.json`

The shape is owned by `docs/ENV_QUALIFICATION_CONTRACT.md`. The fields that decide
whether you may freeze:

| field | meaning |
| --- | --- |
| `status` | `QUALIFIED` \| `PARTIAL` \| `FAILED` \| `QUALIFICATION_FAILED_MEASURED` (contract §8). |
| `reproducibility.assertion` | `IDENTICAL` \| `MISMATCH` \| `NOT_RUN` (contract §6). Two passes are required for `IDENTICAL`. |
| `unknowns[]` | Every value that could not be determined, with a reason (contract §7.2). |
| `warnings[]` | Non-fatal notes — notably `"spec is a range, not an exact pin"`. |
| `qualification_hash` | Content address of the record (contract §9), recomputed and verified in the harness. |
| `dependencies[]` | Exactly the `PINNED_ENGINE_DEPENDENCIES` names (contract §4.3 rule 1), five core keys + `requested_spec` on every record + `resolved_commit` on every git record + the `installer` extension. |
| `requested_spec` | The **verbatim** current pin from `package.ts` (`torch>=2.8.0`, `@git+https://…/unsloth`). Audit origin only — never pasted, never executed. |
| `spec` | The **frozen** form that ships (contract §4.0): `name==version` for pip, `git+<url>@<40-hex>[#subdirectory=…]` for git. This is what §11.1 pastes. |
| `additional_dependencies[]` | Recipe-required packages that are **not** pinned in `package.ts` (see below). |
| `qualification_safety` | The training-free evidence block (contract §13.2): the five safety flags plus a `basis` map. |
| `model_compatibility` | Part B (contract §14.3): the mandated keys plus audit extensions, including TRAIN-ONLY fixture fields (`qualification_fixture_source`, `test_data_accessed`), generic GPU fields (`gpu_count`, `gpu_models`, `vram_per_gpu`, `total_visible_vram`, `multi_gpu_used_by_loader`), output hygiene (`output_hygiene_verified`), and no-auto-freeze fields (`auto_freeze_applied`, `experiment_authorized`). |

### Part B — `model_compatibility`

| field | meaning |
| --- | --- |
| `base_model` / `base_model_revision` | The qualified base model and its **resolved** revision. |
| `base_model_revision_matches_pin` | Whether the live revision equals the `package.ts` pin. A divergence is surfaced in `warnings[]` for a human to decide — never silently reconciled. |
| `tokenizer_loaded`, `harmony_verified`, `real_example_tokenized`, `model_loaded`, `qlora_initialized`, `batch_collated`, `forward_dry_run_completed` | The seven capability booleans. |
| `total_parameters` / `trainable_parameters` / `trainable_percentage` | The parameter accounting. |
| `vram_before_load` / `vram_after_load` / `vram_after_adapter_init` / `peak_vram` | The four VRAM readings, in bytes. `vram_after_load` **must exceed** `vram_before_load` — a 4-bit load that allocates nothing did not happen. |
| `artifact_destination_writable` | Whether the checkpoint destination accepted a write/read-back/delete probe. |
| `optimizer_created`, `backward_executed`, `optimizer_step_executed`, `training_loop_executed`, `model_parameters_updated` | The safety flags. Must agree with `qualification_safety` (contract §10 rule 20). |
| `parameter_digest_before` / `parameter_digest_after` | sha256 over the trainable parameters before and after the forward dry run. |
| `failed_step` / `failed_step_error` | Populated only for `QUALIFICATION_FAILED_MEASURED`. |

### The freeze gate

```
frozen_ok = (status == "QUALIFIED") AND (unknowns is empty)      # contract §7.3
```

A record is `QUALIFIED` only when **both** parts pass: the 15 success criteria of contract
§14.6 and the dependency rules of §4–§12.

`frozen_ok = true` → paste the frozen pins. `frozen_ok = false` → the engine record
stays `UNQUALIFIED`; the package can still be built and exported, but it is not a
reproducibility claim.

`MISMATCH` is a hard stop: the two fresh environments disagreed, so the set is not
reproducible and **the freeze must not be applied**. Investigate before re-running.

`QUALIFICATION_FAILED_MEASURED` is **not** a failure to qualify the dependencies — it is
a measurement that the base model could not be loaded or initialised on this GPU. The
harness records the failing step, the exact exception, the VRAM readings taken so far and
the resolved versions, then stops. **No smaller model is substituted and the architecture
is not changed.** This is a real, publishable result: it tells the project that its
central hardware bet does not hold, at the cost of one Kaggle session.

## Where the freeze goes

1. Open `PINNED_ENGINE_DEPENDENCIES.frozen.ts` from the notebook output.
2. Paste its array over `PINNED_ENGINE_DEPENDENCIES` in
   `apps/web/lib/training/package.ts` (the type annotation and the
   `pinnedEngineConfig()` helper stay unchanged).
3. Per contract §11.1, `spec` is copied **as-is** (it is already the *frozen* spec, §4.0) and
   `resolvedVersion` comes from `resolved_version`. `requested_spec`, `resolved_commit` and the
   other extensions are *not* copied into `EngineDependency` — the commit already rides inside the
   frozen `spec`, so no sixth field is needed. The audit keys stay in the qualification artifact
   (and optionally in `provenance`).
4. Keep `UNSLOTH_ENGINE_VERSION` as the freeze label and bump it to the run date.
5. Re-run `npm run verify:m2`, `npm run qualify:check` and `npm test`.

### `additional_dependencies[]` — please read

The recipe needs `peft`, `trl`, `datasets`, `accelerate`, `bitsandbytes` and the
Harmony package, but none of them is in `PINNED_ENGINE_DEPENDENCIES` today. Contract
§4.3 rule 1 requires `dependencies[]` to contain **exactly** the pinned names, so the
harness installs and resolves them but records them under the additive
`additional_dependencies[]` extension. Nothing is hidden, and the contract's
`dependencies[]` stays exact.

**Open decision for Architecture:** either promote those six into
`PINNED_ENGINE_DEPENDENCIES` (they then move into `dependencies[]` automatically on the
next render, with no harness change), or accept them as recorded-but-unpinned. Until
that is decided, the `PINNED_ENGINE_DEPENDENCIES.frozen.ts` snippet covers the six
pinned names only.

## Contract ambiguities resolved, and M2 defects fixed

These are places where the contract's text is not self-consistent. The harness picks
the reading that keeps contract §11.4 satisfiable ("a successful run empties
`unknowns[]` and sets `status = QUALIFIED`") and discloses the choice in `warnings[]`.

1. **`environment.fp16_supported`.** Contract §5 names
   `torch.cuda.is_fp16_supported()` as the source of truth, but **no released torch
   exposes that function**. The harness probes for it defensively; when it is absent it
   derives the value from the driver-reported compute capability (fp16 tensor cores
   need `sm_70+`) and adds a `warnings[]` entry naming the derivation. It never
   silently invents the value. If the derivation is unacceptable, the contract should
   drop the field or name a real API.
2. **`git_commit_sha` and `package_id` are not counted in `unknowns[]`.** §7.2 says
   every unresolved value must be enumerated, but §3 documents both of these as
   legitimate states (the literal `"unknown"`; `null` before package issuance) and §7.1
   gives `"unknown"` its own admissible representation rather than treating it as a
   null. Enumerating them would make `QUALIFIED` unreachable. Both are disclosed in
   `warnings[]` instead.
3. **`url: null` on pip dependencies is not an unknown.** §7.1's nullable list omits
   `url`, and §11.3's own worked example shows `"url": null` for `torch`/`triton` with
   no `unknowns[]` entry — a pip package has no git URL by definition, not by failure.
4. **`triton_kernels` install fragment (M2 defect, now fixed).** `package.ts` previously derived
   `git+https://github.com/triton-lang/triton.git@<sha>` with no
   `#subdirectory=python/triton_kernels`. The package lives in a subdirectory of the triton
   monorepo, so the bare URL does not install it. The contract's §4.0 frozen-git shape and the §4.4
   table both include `[#subdirectory=<path>]`, so the fragment is part of the **frozen** `spec`.
   The M2 pin in `package.ts` was corrected to carry the fragment (the harness's frozen `spec`
   inherits it); the regression is guarded by `check-qualify-harness.mjs`.
5. **`uv pip install` target selector (M2 defect, now fixed).** M2's install cell ran
   `uv pip install` with no target selector; on a Kaggle image with no active virtualenv, `uv`
   refuses with "no virtual environment found". The harness passes
   `--system --python <sys.executable>` and uses the active venv when `VIRTUAL_ENV` is set; the M2
   template was corrected to match.
6. **The dataset is verified, not embedded (3C).** Contract §14.2 needs a *real* GHARIBO
   example, but the dataset must never be committed. The harness therefore embeds only the
   committed hashes and verifies the operator-attached `/kaggle/input` copy against them. The
   `qualify:check` gate additionally fails if any ≥200-char committed dataset line appears in the
   notebook.

## Switches

All are module-level constants in cell 2 of the notebook:

| constant | default | effect |
| --- | --- | --- |
| `RUN_IMPORT_SMOKE_TEST` | `True` | Imports each module in a subprocess to prove the resolved set is loadable. Downloads **no** weights. Also supplies `import_name` on each record. |
| `RUN_FRESH_ENV_REPRODUCTION` | `True` | Pass 2 of the reproducibility assertion (contract §6). Costs a second install; disabling it forces `assertion = NOT_RUN` and therefore `status = PARTIAL`. |
| `RUN_MODEL_COMPATIBILITY` | `True` | Part B (contract §14). Disabling it makes the run dependency-only again: `QUALIFIED` becomes unreachable and the model-compatibility fields fall to `null` with `unknowns[]` entries. |

`EXPERIMENT_ID` is also a constant in the injected inventory block (default
`GHARIBO-exp-001`, matching the repo's fixture). Change it in
`qualify-kaggle-env.mjs` if the qualification should carry a different experiment id.

## GPU notes (T4 or better)

- The harness detects **all** visible GPUs (not just device 0) and records
  `gpu_count`, `gpu_models`, `vram_per_gpu`, and `total_visible_vram` in both the
  `environment` block and the `model_compatibility` block. `multi_gpu_used_by_loader`
  is `false` — the Unsloth loader uses a single device.
- Compute capability `sm_75` (T4) is the floor: **no native bf16**. The recipe is
  fp16 and the harness aborts if the resolved recipe dtype is not `fp16`. Note that
  `torch.cuda.is_bf16_supported()` can report `True` on a T4; the harness records that
  raw value in `environment.bf16_supported` but never lets it drive the dtype.
- **No FlashAttention-2** (requires `sm_80+`). The harness records
  `flash_attention_2_supported: false` on a T4.
- `TORCH_CUDA_ARCH_LIST=7.5` is exported before installing so a source build
  (`triton_kernels`) cannot emit `sm_80+` kernels the T4 cannot load.
- **Low-VRAM downgrade.** Below 15 GiB of VRAM the harness lowers `max_seq_length` to
  its declared minimum (`MIN_SEQUENCE_LENGTH`), mirroring the M2 budget gate. The
  effective value is what the batch is collated at and what is recorded.
- Part B downloads ~12 GB of weights into the session. Only `/kaggle/working` persists,
  and Kaggle sessions can be interrupted — a `QUALIFICATION_FAILED_MEASURED` run that
  died mid-download is a *measured* failure of that session, not a property of the model.
  Re-run before drawing a conclusion.

## Static safety gates

Two independent gates enforce the training prohibition on the committed notebook:

```bash
npm run qualify:check    # scripts/qualify/check-qualify-harness.mjs
npm run verify:m3a       # Gate 13, scripts/verify-m3a/gates.ts
```

Both do a conservative raw-substring scan for training primitives (`trainer.train(`,
`optimizer.step(`, `loss.backward(`, `torch.optim.`, `lr_scheduler`, `SFTTrainer`,
`TrainingArguments(`, `save_pretrained`, `push_to_hub`, …). Model **loading** is required
by part B, so the loading tokens are deliberately not forbidden; what is forbidden is
everything that *writes* a parameter, *creates* an optimizer or scheduler, or *persists* a
checkpoint. Gate 13 additionally asserts the positive side: the 14-step sequence is
present, all mandated artifact keys are assembled, and the no-parameter-update proof
exists. The checker also verifies the TRAIN-ONLY fixture, generic GPU detection, output
hygiene guard, and no-auto-freeze fields.
