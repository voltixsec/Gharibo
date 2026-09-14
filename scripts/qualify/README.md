# Milestone 3A — free-Kaggle environment qualification harness

GHARIBO's training engine cannot start because its dependency set is **not pinned to
exact reproducible versions**. `PINNED_ENGINE_DEPENDENCIES` in
`apps/web/lib/training/package.ts` currently pins the base model by revision and
`triton_kernels` by commit, but `torch`/`triton` are floors (`>=`), the
`unsloth` / `unsloth-zoo` / `transformers` git specs track upstream branches with no
commit SHA, and **every `resolvedVersion` is `null`**.

Those values cannot be guessed. They have to be produced by actually installing the
stack on the target hardware. This harness does exactly that on the **free Kaggle T4
tier** and emits an artifact conforming to
[`docs/ENV_QUALIFICATION_CONTRACT.md`](../../docs/ENV_QUALIFICATION_CONTRACT.md) v1.0.0.

## Files

| file | role |
| --- | --- |
| `qualify-kaggle-env.ipynb` | **The runnable harness.** Upload this to Kaggle and Run All. |
| `qualify-kaggle-env.mjs` | The deterministic generator that renders the notebook (mirrors the M2 `notebook-render.ts` template + sentinel pattern). It injects the dependency inventory and the engine version straight from `package.ts`, so the notebook cannot drift from the repo's pins. |
| `check-qualify-harness.mjs` | Structural/contract validator. Enforces "never fabricate a version or SHA", "qualification only", the T4 constraints, pin/inventory consistency and conformance to the qualification contract. |
| `README.md` | This file. |

Do not hand-edit the `.ipynb` — edit `qualify-kaggle-env.mjs` and re-render.

```bash
npm run qualify:render   # re-render the notebook after editing the generator
npm run qualify:check    # CI gate: freshness + contract conformance
```

## What the harness does

1. Prints the detected hardware (GPU model, compute capability, VRAM bytes, CUDA,
   cuDNN, Python, torch).
2. **Fails loudly before doing anything expensive** if the GPU is not sufficient for
   `gpt-oss-20b` 4-bit QLoRA (needs `>= sm_75` and `>= 14 GiB` VRAM).
3. Installs the training stack via **`uv`**. A plain `pip install unsloth` does *not*
   work — this is a known trap — so `uv` is used for the whole resolved transaction.
4. Resolves and records the exact working versions for `unsloth`, `unsloth_zoo`,
   `transformers`, `torch`, `triton`, `triton_kernels`, `peft`, `trl`, `datasets`,
   `accelerate`, `bitsandbytes`, and the Harmony package.
5. Records exact **git commit SHAs** for every git-sourced dependency, read from the
   PEP 610 `direct_url.json` metadata (`vcs_info.commit_id`) — not from a guess.
6. Runs a **second, fresh resolution** in a throwaway venv with no cache and asserts
   the two dependency sets are identical (contract §6).
7. Writes `/kaggle/working/env-qualification.json` in canonical form, plus a
   human-readable report, a paste-ready TypeScript snippet and a checksum rollup.
8. **Self-validates against contract §10 before finishing** and aborts if the record it
   just produced would be invalid.

It **never** downloads model weights, never loads a model, and never runs SFT/QLoRA.
It never prints, logs or writes a secret — every echoed string passes through
`redact()`, which strips URL credentials, `?token=`-style query values and
`hf_`/`ghp_`/`sk-`-shaped strings. It reads no environment variable except
`VIRTUAL_ENV`.

## How to run it on Kaggle (free tier)

1. Go to <https://www.kaggle.com/code> → **New Notebook** → **File → Import Notebook**
   → upload `scripts/qualify/qualify-kaggle-env.ipynb`.
2. Notebook **Settings → Accelerator → GPU T4 x2**. The harness uses a single device;
   the second GPU is simply unused.
3. Notebook **Settings → Internet → On**. The install and the git clones need it.
4. **Do not add any Kaggle Secret.** This harness needs no token and reads none.
5. **Run All.** The install dominates the runtime, and the reproducibility pass installs
   the stack a second time, so expect a long single-cell wait rather than a fast run.
6. Run it as a **Save Version / committed** run so `/kaggle/working` persists as
   notebook Output, then download the outputs.

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
| `status` | `QUALIFIED` \| `PARTIAL` \| `FAILED` (contract §8). |
| `reproducibility.assertion` | `IDENTICAL` \| `MISMATCH` \| `NOT_RUN` (contract §6). Two passes are required for `IDENTICAL`. |
| `unknowns[]` | Every value that could not be determined, with a reason (contract §7.2). |
| `warnings[]` | Non-fatal notes — notably `"spec is a range, not an exact pin"`. |
| `qualification_hash` | Content address of the record (contract §9), recomputed and verified in the harness. |
| `dependencies[]` | Exactly the `PINNED_ENGINE_DEPENDENCIES` names (contract §4.3 rule 1), five core keys + `requested_spec` on every record + `resolved_commit` on every git record + the `installer` extension. |
| `requested_spec` | The **verbatim** current pin from `package.ts` (`torch>=2.8.0`, `@git+https://…/unsloth`). Audit origin only — never pasted, never executed. |
| `spec` | The **frozen** form that ships (contract §4.0): `name==version` for pip, `git+<url>@<40-hex>[#subdirectory=…]` for git. This is what §11.1 pastes. |
| `additional_dependencies[]` | Recipe-required packages that are **not** pinned in `package.ts` (see below). |

### The freeze gate

```
frozen_ok = (status == "QUALIFIED") AND (unknowns is empty)      # contract §7.3
```

`frozen_ok = true` → paste the frozen pins. `frozen_ok = false` → the engine record
stays `UNQUALIFIED`; the package can still be built and exported, but it is not a
reproducibility claim.

`MISMATCH` is a hard stop: the two fresh environments disagreed, so the set is not
reproducible and **the freeze must not be applied**. Investigate before re-running.

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

## Switches

Both are module-level constants in cell 2 of the notebook:

| constant | default | effect |
| --- | --- | --- |
| `RUN_IMPORT_SMOKE_TEST` | `True` | Imports each module in a subprocess to prove the resolved set is loadable. Downloads **no** weights. Also supplies `import_name` on each record. |
| `RUN_FRESH_ENV_REPRODUCTION` | `True` | Pass 2 of the reproducibility assertion (contract §6). Costs a second install; disabling it forces `assertion = NOT_RUN` and therefore `status = PARTIAL`. |

`EXPERIMENT_ID` is also a constant in the injected inventory block (default
`GHARIBO-exp-001`, matching the repo's fixture). Change it in
`qualify-kaggle-env.mjs` if the qualification should carry a different experiment id.

## T4 / Turing notes

- Compute capability `sm_75`: **no native bf16**. The recipe is fp16 and the harness
  aborts if the resolved recipe dtype is not `fp16`. Note that
  `torch.cuda.is_bf16_supported()` can report `True` on a T4; the harness records that
  raw value in `environment.bf16_supported` but never lets it drive the dtype.
- **No FlashAttention-2** (requires `sm_80+`). The harness records
  `flash_attention_2_supported: false` on a T4.
- `TORCH_CUDA_ARCH_LIST=7.5` is exported before installing so a source build
  (`triton_kernels`) cannot emit `sm_80+` kernels the T4 cannot load.
