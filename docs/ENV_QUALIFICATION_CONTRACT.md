# GHARIBO Environment Qualification Contract

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Domain spec |
| **Status** | Draft |
| **Version** | 1.4.0 |
| **Last Updated** | 2026-09-14 |

> **v1.4.0 — CTO governance corrections (TRAIN-ONLY fixture, generic GPU, output hygiene, no auto-freeze).**
> Four corrections to the M3C qualification harness:
> 1. **TRAIN-ONLY fixture:** The harness now attaches only `train.jsonl` as a Kaggle Dataset input
>    (not all three splits). `expected_split_files` is `["train.jsonl"]`. The dataset verification
>    only checks the train split hash. A `qualification_fixture_hash` replaces the full dataset hash.
>    `qualification_fixture_source = "TRAIN_ONLY"` and `test_data_accessed = false` are recorded.
> 2. **Generic GPU detection:** The hardcoded "T4 x2" accelerator reference is replaced with
>    "GPU (T4 or better)". The probe detects all visible GPUs and records `gpu_count`, `gpu_models`,
>    `vram_per_gpu`, `total_visible_vram`, and `multi_gpu_used_by_loader`.
> 3. **Output hygiene:** A guard checks that no forbidden output files (model weights, adapters,
>    configs) persist in `/kaggle/working`. `output_hygiene_verified` is recorded.
> 4. **No auto-freeze:** `auto_freeze_applied = false` and `experiment_authorized = false` are
>    recorded. The CTO must inspect the artifact before any freeze is applied.

> **v1.3.0 — Milestone 3C: REAL model-compatibility qualification (§14).** Supersedes the
> model-free constraint of §13.4. The harness must now prove that `openai/gpt-oss-20b`
> actually loads and runs a forward pass through the intended 4-bit QLoRA path on the free
> Kaggle T4: resolve the live model revision, load the tokenizer, verify Harmony formatting
> on a **real GHARIBO training example**, tokenize that example, load the 4-bit base model,
> initialise the QLoRA adapters, report total/trainable parameters, collate one small batch,
> run **exactly one** forward-only dry run under `torch.no_grad()`, record four VRAM
> readings, verify the artifact destination is writable, and prove no parameter changed via
> a deterministic parameter digest taken before and after the dry run. The mission-mandated
> flat block `model_compatibility` (§14.3) carries those values under the mission's own key
> names. `contract_schema_version` moves `1.0.0 → 1.1.0`: the change is additive for the
> package consumer (it reads only `dependencies[]` and `environment`), but the §8 status
> vocabulary gains a fourth value, `QUALIFICATION_FAILED_MEASURED`. The **major stays 1**, so
> §10 rule 1 and the paste transform (§11) are unaffected. §13 is **retained and
> strengthened**: the harness may now load a model and run a forward pass, but it still may
> not construct an optimizer, run a backward pass, take a step, create a scheduler, run a
> training loop, enable gradients, update a parameter, or write a model artifact.

> **v1.2.0 — Milestone 3B: Qualification Safety (§13).** Adds a normative
> **Qualification Safety** section. The harness must be structurally training-free: it
> arms runtime tripwires on the optimizer constructor, the optimizer step, the
> scheduler constructors, the tensor/autograd backward functions and the accelerate
> backward, and it emits a `qualification_safety` evidence block into
> `env-qualification.json` whose values are computed from the tripwire state and a
> parameter-digest comparison — never hardcoded. A static safety gate
> (`scripts/qualify/check-qualify-harness.mjs` + `verify-m3a` Gate 13) forbids the
> training primitives from appearing in the generated notebook at all. This is an
> **additive** change: `qualification_safety` is an extra top-level block permitted by
> §3.1, so `contract_schema_version` stays `1.0.0`. No released meaning is broken.

> **Revision note (2026-09-14) — freeze semantics corrected before first use.** The "`spec` is
> verbatim" rule is reversed: `spec` is now the **frozen** form (`name==version` for pip,
> `git+<url>@<40-hex>` for git) and the verbatim origin moves to a new **required** key
> `requested_spec`. Reason: the mission requires that no floating production training dependency
> survives the freeze, and `EngineDependency` has no commit slot, so the commit must ride in `spec`.
> Also corrected: `additional_dependencies[]` is a first-class block (§4.5); extra top-level keys are
> explicitly permitted (§3.1); the environment record's thirteen keys are enumerated and
> `fp16_supported` derivation must be disclosed (§5); validation rules 14–18 added (§10).
>
> This is a **MAJOR-level** change to the contract's meaning (it reverses a stated requirement), but
> the document is still `Draft` and **no artifact has ever been produced under it**, so the version
> stays `1.0.0` while the contract is unreleased. **When this document moves to `Approved`, it MUST
> be bumped to `2.0.0` in `docs/DOCUMENT_REGISTER.md`**, because a consumer of the old verbatim rule
> is invalidated.

> **Scope.** This document defines the exact, machine-readable artifact a **Kaggle qualification
> harness** must emit so its output can be pasted directly into
> `apps/web/lib/training/package.ts` — specifically into `EngineConfig.dependencies[]` and
> `EnvironmentMetadata`. It defines a *contract*, not a result: it contains **no resolved versions**.
> Every value that cannot be determined exactly is `null` (§6). It is a companion to
> `docs/ARCHITECTURE_MILESTONE_2.md` §3 (package contract), §3.5 (validation), §5 (hashing) and
> §9 (notebook), and to `docs/ARCHITECTURE_MILESTONE_2.md` §15 open item **O3** (exact pinned
> dependency versions).
>
> Change control: `docs/DOCUMENTATION_GOVERNANCE.md` §5.
>
> **v1.1.0 — Milestone 3A autonomous work session (2026-09-13).** The 6 direct recipe dependencies
> (`peft`, `trl`, `datasets`, `accelerate`, `bitsandbytes`, `openai-harmony`) have been promoted
> from §4.5 `additional_dependencies[]` into `PINNED_ENGINE_DEPENDENCIES` (6→12 entries). The §4.4
> mirror table below now lists all 12 names. The harness (`scripts/qualify/qualify-kaggle-env.mjs`)
> and the harness checker (`scripts/qualify/check-qualify-harness.mjs`) have been updated to
> reflect the 12-entry pin set. `UNPINNED_QUALIFICATION_ENTRIES` is now empty. The notebook
> content address has been regenerated. No versions have been resolved — all `resolvedVersion`
> fields remain `null`. The `frozenOk` gate remains `false` (requires a real Kaggle T4 run). This
> is an additive change to the contract's mirror table; no structural change to the schema.

---

## 1. Purpose

The Training Package pins an engine dependency set, but the package builder can only record what a
real install resolves. Today `PINNED_ENGINE_DEPENDENCIES` carries `resolvedVersion: null` for every
entry. Unsloth packages use PyPI requests; Transformers and TRL use the supplied upstream pins.
**Actual resolved versions remain unmeasured until a real install.**

This contract closes that gap honestly, in **two parts**:

| Part | Question it answers | Sections |
|---|---|---|
| **A — dependencies** | Is the engine pin-set resolvable, exact, and reproducible? | §4–§12 |
| **B — model compatibility** | Does `openai/gpt-oss-20b` actually load, initialise and run a forward pass on this real GPU — without training? | §13–§14 |

1. the harness runs on the real worker (Kaggle, NVIDIA T4) and records what it actually installed;
2. it runs the resolution in **two fresh environments** and asserts the sets are identical;
3. it **loads the qualified base model** and proves by parameter digest that no parameter is
   updated (part B);
4. it emits `env-qualification.json` in the shape defined here;
5. that file is transformed (§11) into the package's engine + environment records with **no manual
   editing and no guessing**.

A dependency set that has not been through this harness is `UNQUALIFIED`, and the package that
carries it is not a frozen pin (§7). A set that has been resolved but whose base model could not be
loaded on the target hardware is `QUALIFICATION_FAILED_MEASURED` (§8, §14.5) — a measurement, not a
freeze.

---

## 2. Artifact

| Property | Value |
|---|---|
| Filename | `env-qualification.json` |
| Encoding | UTF-8, no BOM |
| Canonical form | sorted keys, no insignificant whitespace (M2 §5) |
| Media type | `application/json` |
| Location | `/kaggle/working/env-qualification.json` (and returned as harness stdout summary) |

The file is **immutable once written**. A re-run produces a new file with a new `qualification_hash`.

---

## 3. Top-level schema

```jsonc
{
  "contract_schema_version": "1.0.0",
  "harness_version": "1.0.0",
  "experiment_id": "GHARIBO-exp-001",
  "git_commit_sha": "<40-hex> | \"unknown\"",
  "package_id": "<sha256 hex> | null",
  "engine": {
    "engine": "unsloth",
    "engine_version": "<freeze label, e.g. unsloth-freeze-YYYY.MM.DD>"
  },
  "captured_at": "<ISO 8601 UTC>",
  "status": "QUALIFIED | PARTIAL | FAILED | QUALIFICATION_FAILED_MEASURED",

  "dependencies": [ /* §4 — one record per pinned dependency */ ],
  "additional_dependencies": [ /* §4.5 — recipe-required, not pinned in package.ts */ ],
  "environment":  { /* §5 */ },
  "reproducibility": { /* §6 */ },
  "unknowns": [ /* §7 — explicit list of every unresolved value */ ],
  "warnings": [ /* optional: non-fatal notes, e.g. "spec is a range, not an exact pin" */ ],

  "qualification_safety": { /* §13 — training-free evidence */ },
  "model_compatibility": { /* §14 — real gpt-oss-20b compatibility evidence */ },

  "qualification_hash": "<sha256 of this object with qualification_hash = \"\">"
}
```

| Field | Type | Nullable | Rule |
|---|---|---|---|
| `contract_schema_version` | string (semver) | no | Major must equal the consumer's supported major |
| `harness_version` | string (semver) | no | Version of the harness that produced the file |
| `experiment_id` | string | no | e.g. `GHARIBO-exp-001` |
| `git_commit_sha` | string | no | 40-hex, or the literal `"unknown"` (M2 §3.2) |
| `package_id` | string \| null | yes | `null` when qualification runs before package issuance |
| `engine.engine` | `"unsloth"` | no | Must match `EngineConfig.engine` |
| `engine.engine_version` | string | no | The freeze label, not a resolved pip version |
| `captured_at` | string | no | ISO 8601 UTC |
| `status` | enum | no | See §8 |
| `qualification_hash` | string | no | Content address of the record (§9) |

### 3.1 Additional (non-required) top-level keys are permitted

The required keys above must all be present. **Extra top-level keys are allowed and are ignored by
the consumer** — the same forward-compatibility rule as §4.2 and M2 §3.4. This lets the harness
carry its own audit blocks (e.g. `harness`, `provenance`, `import_smoke`, `requested_specs`) without
a contract change. Two such blocks are **normative** rather than merely permitted:
`qualification_safety` (§13.2) and `model_compatibility` (§14.3).

| Rule | Value |
|---|---|
| Extras allowed? | **Yes**, at any level |
| May an extra shadow a required key? | **No** — a name collision with a required key is a violation |
| Must the five required blocks still be present? | **Yes** — an extra is never a substitute. In particular a bespoke `verification{}` block does **not** replace `reproducibility{}`, and `model_compatibility` does **not** replace `dependencies[]` or `environment` |
| Secrets / paths in extras | Forbidden — §10 rule 13 scans the whole document, extras included |

---

## 4. Dependency records

> All values in the examples below are **placeholders**. The only admissible source of truth for a
> real freeze is the harness output. No value in this document is a measurement.

### 4.0 `requested_spec` vs `spec` — the freeze rule (normative)

Two fields, two jobs. This distinction is the whole point of the artifact:

| Field | Job | Value |
|---|---|---|
| `requested_spec` | **Audit origin.** What `PINNED_ENGINE_DEPENDENCIES` asks for *today*, byte-for-byte. Never executed. | verbatim current pin |
| `spec` | **The pin that ships.** The frozen, exact, reproducible form. This is what §11.1 pastes into `EngineDependency.spec`. | frozen form below |

| `source` | Frozen `spec` | Shape |
|---|---|---|
| `pip` | `<distribution-name>==<resolved_version>` | `torch==<resolved version>` |
| `git` | `git+<url>@<40-hex-commit>[#subdirectory=<path>]` | `git+<git url>@<40-hex commit>` |

**Rationale (binding).** The mission requirement is that no floating production training dependency
survives the freeze. Both a range (`torch>=2.8.0`) and a branch (`@git+https://…/unsloth`) are
floating. `EngineDependency` has exactly five fields and **no commit slot**, so the commit must ride
in `spec`. Reproducibility beats verbatim; `requested_spec` preserves the verbatim origin for audit,
so nothing is lost. This is a deliberate, reasoned exception to the old "verbatim" rule.

**Fallback.** If a dependency cannot be resolved, `spec` MUST fall back to the verbatim
`requested_spec`, `resolved_version` is `null`, the value is listed in `unknowns[]`, and `status`
can be `PARTIAL` at best (§7, §8). A `spec` that could not be frozen is never presented as frozen.

### 4.1 Record shape (wire form)

Each element of `dependencies[]` carries five **core keys** that map 1:1 onto the package's
`EngineDependency` (`snake_case` wire form, `toManifest`, `apps/web/lib/training/package.ts:237`),
plus required audit keys.

```jsonc
{
  "name": "<name, exactly as in PINNED_ENGINE_DEPENDENCIES>",
  "source": "pip",
  "spec": "<frozen spec — see §4.0>",
  "resolved_version": "<exact installed version (pip) / 40-hex commit SHA (git), or null>",
  "url": "<git URL for source git, else null>",

  "requested_spec": "<the verbatim PINNED_ENGINE_DEPENDENCIES spec this was resolved from>",
  "resolved_commit": "<40-hex SHA for source git; null if unresolved>"
}
```

| Core key | Type | Nullable | Maps to `EngineDependency` | Rule |
|---|---|---|---|---|
| `name` | string | no | `name` | Must equal the `name` in `PINNED_ENGINE_DEPENDENCIES` |
| `source` | `"pip"` \| `"git"` | no | `source` | Same enum as the package |
| `spec` | string | no | `spec` | The **frozen** spec (§4.0), or the verbatim `requested_spec` when unfreezable |
| `resolved_version` | string \| null | **yes** | `resolvedVersion` | Exact installed version (pip) or resolved commit SHA (git), or `null` |
| `url` | string \| null | yes | `url` | Git URL where applicable, else `null` |

| Required audit key | Type | Applies to | Rule |
|---|---|---|---|
| `requested_spec` | string | all records | The verbatim `PINNED_ENGINE_DEPENDENCIES` spec, never normalized |
| `resolved_commit` | string \| null | `source: "git"` | 40-hex commit SHA; must be present (even as `null`) on every git record |

### 4.2 Optional capture extensions

Extensions are allowed and are **ignored** by the package consumer (forward-compatible per M2
§3.4: unknown keys are ignored). They exist so the freeze is auditable.

| Extension key | Type | Meaning |
|---|---|---|
| `resolved_ref` | string \| null | Branch/tag actually checked out, if any |
| `resolved_url` | string \| null | Direct artifact URL (wheel/sdist) actually installed |
| `wheel_sha256` | string \| null | SHA-256 of the installed wheel/sdist, when available |
| `installer` | string | `"uv"` \| `"pip"` — which installer produced the record |
| `import_name` | string \| null | Module name used for the import smoke test |

### 4.3 Rules

1. **One record per pinned dependency.** The set of `name` values in `dependencies[]` must equal the
   set of `name` values in `PINNED_ENGINE_DEPENDENCIES`, except the explicitly recorded conditional
   `triton_kernels` exclusion on the Kaggle preserve-preinstalled path (§4.6). A
   mismatch is a contract violation (§10). Packages the recipe imports directly MUST be pinned (see
   §4.5); only transitive or optional packages belong in `additional_dependencies[]`.
2. **`spec` is the frozen form, not the request** (§4.0). `pip` → `name==version`; `git` →
   `git+<url>@<40-hex>`. `requested_spec` holds the verbatim origin. A record whose `spec` could not
   be frozen must equal its `requested_spec` and is an unknown.
3. **Git specs must resolve to a commit.** For `source: "git"`, a valid qualification requires a
   non-null `resolved_commit`, and the commit MUST appear in the frozen `spec`. The upstream default
   branch moves; a commit SHA is the only thing that makes the pin reproducible. A git record with
   `resolved_commit: null` is an **unknown** (§7) and forces `status = "PARTIAL"` at best.
4. **Nothing is inferred.** `resolved_version` comes from installed distribution metadata
   (`importlib.metadata.version(name)`); for `source: "git"` the resolved version **is** the commit
   SHA. Never from the spec, a branch name, a release note, or a documentation page.
5. **Ordering is normalized.** The harness sorts records by `name` (lexicographic) before hashing,
   so `qualification_hash` is order-independent.
6. **Warnings are computed on `requested_spec`, not `spec`.** A range/branch warning describes the
   *request*; the frozen `spec` is exact by construction, so testing it would produce a false
   negative. Each unfrozen (`spec == requested_spec`) entry still yields
   `"spec is a range, not an exact pin: <requested_spec>"`.

### 4.4 Required dependency names (from the current freeze)

The names the harness must emit, matching `PINNED_ENGINE_DEPENDENCIES` exactly:

| `name` | `source` | `requested_spec` (verbatim, today) | frozen `spec` shape after a successful run |
|---|---|---|---|
| `torch` | pip | `torch>=2.8.0` | `torch==<resolved version>` |
| `triton` | pip | `triton>=3.4.0` | `triton==<resolved version>` |
| `unsloth_zoo` | pip | `unsloth_zoo` | `unsloth_zoo==<resolved version>` |
| `unsloth` | pip | `unsloth` | `unsloth==<resolved version>` |
| `transformers` | pip | `transformers==4.56.2` | `transformers==<resolved version>` |
| `triton_kernels` | git | `@05b2c186c1b6c9a08375389d5efe9cb4c401c075#subdirectory=python/triton_kernels` | `git+https://github.com/triton-lang/triton.git@<40-hex commit>#subdirectory=python/triton_kernels` |
| `peft` | pip | `peft` | `peft==<resolved version>` |
| `trl` | pip | `trl==0.22.2` | `trl==<resolved version>` |
| `datasets` | pip | `datasets` | `datasets==<resolved version>` |
| `accelerate` | pip | `accelerate` | `accelerate==<resolved version>` |
| `bitsandbytes` | pip | `bitsandbytes` | `bitsandbytes==<resolved version>` |
| `openai-harmony` | pip | `openai-harmony` | `openai-harmony==<resolved version>` |

> This table mirrors `apps/web/lib/training/package.ts:49`. If that constant changes, this table
> changes with it. The `requested_spec` column is real (it is the repo's current pin); the frozen
> `spec` column is a **shape only** and contains no versions. The last 6 entries were promoted
> from §4.5 `additional_dependencies[]` during the M3A autonomous work session — they are now
> pinned in `PINNED_ENGINE_DEPENDENCIES` (pinned_in_package_ts = true) and belong in
> `dependencies[]`, not `additional_dependencies[]`.

### 4.5 `additional_dependencies[]` — the pin-set completeness rule

**Criterion (binding).** A package the recipe **imports directly** is a production training
dependency and MUST be pinned in `PINNED_ENGINE_DEPENDENCIES`, so it belongs in `dependencies[]`. A
package that arrives only transitively, or that is optional/experimental for the recipe, MAY be
recorded in `additional_dependencies[]` instead.

| Class | Home | Pasted into the package? |
|---|---|---|
| Direct recipe requirement (imported by the training script) | `dependencies[]` — MUST be pinned in `package.ts` | Yes (§11.1) |
| Transitive-only or optional | `additional_dependencies[]` | No |

**Current direct requirements — PROMOTED (M3A session).** The gpt-oss-20b 4-bit QLoRA + SFT recipe
imports, and therefore must pin: `peft`, `trl`, `datasets`, `accelerate`, `bitsandbytes`, and the
Harmony package (`openai-harmony`). **These 6 packages have been promoted to
`PINNED_ENGINE_DEPENDENCIES` during the M3A autonomous work session** — they are now in
`dependencies[]` (pinned_in_package_ts = true), not `additional_dependencies[]`. The harness picks
them up automatically because it derives its inventory from that constant.
Qualification-only checks also record `tokenizers>=0.22.0,<=0.23.0` and `torchao>=0.16.0`
in `additional_dependencies[]`; `requested_spec` must retain these actual constraints.

A bare name (e.g. `peft`) is an admissible `requested_spec`: it is a *request*, and the harness
freezes the resolved `peft==<version>`. Writing the request invents no version.

**Block shape** (same record shape as §4.1):

```jsonc
"additional_dependencies": [ { /* §4.1 shape, "pinned_in_package_ts": false */ } ]
```

| Rule | Value |
|---|---|
| Shape | Identical to §4.1, plus the boolean `pinned_in_package_ts` (`false` here) |
| Paste target | **None.** §11.1 pastes only `dependencies[]` into the package |
| Purpose | Environment audit + reproducibility of the *run*, not of the *package* |
| `warnings[]` | MUST contain one entry naming these packages and stating they are not in `dependencies[]` |
| When empty | The block may be empty or absent; if absent, no warning is required (§10 rule 18) |

---

### 4.6 Kaggle T4 qualification install selection

On Kaggle with detected preinstalled torch, preserve its measured distribution version
and any detected preinstalled triton version. Apply exact constraints to dependency-resolving
commands and verify these versions after installation. A conflict must fail visibly.
Exclude the explicit triton_kernels Git install, required import probe, and dependency record
on this path; record the exclusion and reason in qualification-install-args.json. This is
an exclusion of one recipe requirement, not permission to ignore a required import failure.
Use the same selected dependency names in pass 2; its fresh environment requests the measured
torch/triton versions. Equality remains strict, including for preserved packages. These measured
versions are environment-preserved runtime facts, not universal GHARIBO dependency pins.
The TypeScript paste output retains the original requested specs with unresolved versions for
preserved packages and includes the original triton_kernels entry even when this path skips it.

Both passes build their commands through one install-plan function. Each stage runs its exact
command with --dry-run immediately before the actual command. A --no-deps dry-run validates
that stage's requests, not transitive compatibility or later stages. Import and hardware gates
remain mandatory. Preserve the existing diagnostic capture and qualification safety gates.

The v2 failure remains DEPENDENCY_INSTALL_FAILED_WITH_DIAGNOSTIC_SUPPRESSED. Preservation is
an evidence-based remediation, not a measured historical root cause.


## 5. Environment record

> Every value in the block below is a **placeholder** — a description of what to capture, not a
> measurement. No value in this document is a measurement.

```jsonc
{
  "environment": {
    "python_version": "<platform.python_version() — e.g. 3.x.y>",
    "cuda_version": "<torch.version.cuda / nvcc, or null>",
    "gpu_model": "<torch.cuda.get_device_name(0), or null>",
    "compute_capability": "<sm_<major><minor> from torch.cuda.get_device_capability(0), or null>",
    "vram_bytes": "<torch.cuda.get_device_properties(0).total_memory, or null>",

    "os": "<platform.system()>",
    "platform": "<platform.platform()>",
    "torch_version": "<torch.__version__>",
    "driver_version": "<nvidia-smi driver>",
    "uv_version": "<uv --version>",
    "pip_version": "<pip --version>",
    "fp16_supported": "<torch.cuda.is_fp16_supported()>",
    "bf16_supported": "<torch.cuda.is_bf16_supported()>"
  }
}
```

| Field | Type | Nullable | Source of truth | Rule |
|---|---|---|---|---|
| `python_version` | string | **no** | `platform.python_version()` | `MAJOR.MINOR.PATCH`, exact |
| `cuda_version` | string \| null | **yes** | `torch.version.cuda` (fallback `nvidia-smi`) | Runtime CUDA version, e.g. `"<major>.<minor>"` |
| `gpu_model` | string \| null | **yes** | `torch.cuda.get_device_name(0)` | Exact device name, e.g. `"Tesla T4"` |
| `compute_capability` | string \| null | **yes** | `torch.cuda.get_device_capability(0)` | Normalized to `"sm_<major><minor>"`, e.g. `"sm_75"` |
| `vram_bytes` | integer \| null | **yes** | `torch.cuda.get_device_properties(0).total_memory` | Total VRAM in bytes; integer, no units string |
| `os` | string | no | `platform.system()` | Maps to `EnvironmentMetadata.os` |
| `platform` | string | no | `platform.platform()` | Free-form OS build string |
| `torch_version` | string \| null | yes | `torch.__version__` | Exact installed torch version |
| `driver_version` | string \| null | yes | `nvidia-smi --query-gpu=driver_version` | Exact NVIDIA driver version string |
| `uv_version` | string \| null | yes | `uv --version` | Version token only — no filesystem path (§10 rule 13) |
| `pip_version` | string \| null | yes | `pip --version` | Version token only — no filesystem path (§10 rule 13) |
| `fp16_supported` | boolean \| null | yes | `torch.cuda.is_fp16_supported()` **if the runtime exposes it**, otherwise derived from compute capability (≥ `sm_70`) | T4 (sm_75) expects `true`; a derived value MUST be disclosed in `warnings[]` |
| `bf16_supported` | boolean \| null | yes | `torch.cuda.is_bf16_supported()` | T4 (sm_75) expects `false`; the package dtype is `fp16` |

**All thirteen fields above are required keys** (a value may be `null`, but the key must exist).
Extra environment keys are permitted under the §3.1 rule — e.g. `cudnn_version`, `dtype`,
`flash_attention_2_supported`, `bf16_reported_supported` — and are ignored by the consumer.

**`fp16_supported` is a conditional field.** Its primary source of truth is
`torch.cuda.is_fp16_supported()`. If the runtime does not expose that attribute, the value MAY be
derived from the compute capability (`sm_70+` has fp16 tensor cores). A derived value is never
silent: it MUST be recorded and a `warnings[]` entry MUST state that it was derived, naming the rule
used. A derived value is not an unknown, so it does not appear in `unknowns[]`. If neither the
attribute nor a compute capability is available, the value is `null` and it IS an unknown.

`compute_capability` normalization is exact: `(major, minor) = (7, 5)` → `"sm_75"`;
`(8, 6)` → `"sm_86"`. The `sm_` prefix and zero-padded two-digit form are mandatory so the string
can be compared to `WorkerCapabilities.gpuClass` without parsing.

### 5.1 Mapping to `EnvironmentMetadata`

`EnvironmentMetadata` (`packages/shared/src/types/training-package.ts:132`) is a **subset**. The
transform is:

| `EnvironmentMetadata` field | `env-qualification.json` source |
|---|---|
| `os` | `environment.os` |
| `pythonVersion` | `environment.python_version` |
| `gpu` | `environment.gpu_model` (`null` if unknown) |
| `cuda` | `environment.cuda_version` (`null` if unknown) |
| `packages` | Built from `dependencies[]`: `{ name → resolved_version }`, **omitting** any entry whose `resolved_version` is `null` |

`compute_capability` and `vram_bytes` have no `EnvironmentMetadata` slot; they are preserved in the
qualification artifact and in the package's `provenance` JSON (M2 §5.4), not in
`environment_metadata`.

---

## 6. Reproducibility assertion

A pin is only a pin if a second, fresh environment resolves the same set.

### 6.1 Procedure (normative)

```
for pass_index in 1..P:                                  # P >= 2 required for IDENTICAL
    create a fresh, isolated environment:
        - a NEW virtualenv (no site-packages inheritance)
        - an empty installer cache (UV_CACHE_DIR / pip --no-cache-dir)
        - no pre-installed wheels of the pinned names
        - the SAME base python (python_version must be identical across passes)
    install the pinned set from §4.4 (installer: uv)
    record resolved_version / resolved_commit for every name
    dependency_set_hash[pass_index] = sha256(canonical_json(sorted(dependencies)))
```

### 6.2 Emitted block

```jsonc
{
  "reproducibility": {
    "assertion": "IDENTICAL | MISMATCH | NOT_RUN",
    "passes": [
      { "pass_index": 1, "started_at": "<ISO>", "finished_at": "<ISO>",
        "dependency_set_hash": "<sha256>", "base_python": "<platform.python_version() — identical across passes>" },
      { "pass_index": 2, "started_at": "<ISO>", "finished_at": "<ISO>",
        "dependency_set_hash": "<sha256>", "base_python": "<platform.python_version() — identical across passes>" }
    ],
    "comparison": "exact-string-equality-per-name",
    "dependency_set_hash": "<sha256 of the winning set>"
  }
}
```

| Field | Rule |
|---|---|
| `assertion` | `IDENTICAL` iff every pass produced the same sorted dependency set; `MISMATCH` iff any pass differs; `NOT_RUN` iff `P < 2` |
| `passes` | At least 1; `P ≥ 2` required for `IDENTICAL` |
| `comparison` | Always the literal `"exact-string-equality-per-name"` — no fuzzy, no range satisfaction |
| `dependency_set_hash` | `sha256(canonical_json(sorted(dependencies)))` over `dependencies[]` including the frozen `spec`, `resolved_version`, and the git extensions |

### 6.3 Comparison rule

Two passes agree iff, for every `name`:

1. the name sets are equal (no missing, no extra);
2. the frozen `spec` is string-equal;
3. `resolved_version` is string-equal (including both-`null`);
4. `resolved_commit` is string-equal for `source: "git"`.

A name present in one pass and absent in the other is a `MISMATCH`. A pass that failed to install is
recorded with `resolved_version: null` for the failed names and makes the assertion `MISMATCH`.
`additional_dependencies[]` (§4.5) is compared with the same four rules and reported separately; a
mismatch there is a `MISMATCH` for the run.

### 6.4 Consequence

| Assertion | `status` | Effect on the freeze |
|---|---|---|
| `IDENTICAL` and `unknowns` empty | `QUALIFIED` | The set may be written into the package as a frozen pin |
| `IDENTICAL` but `unknowns` non-empty | `PARTIAL` | Recorded, not frozen (§7.3) |
| `MISMATCH` | `FAILED` | **The freeze MUST NOT be applied** |
| `NOT_RUN` (`P = 1`) | `PARTIAL` | Values recorded for information only; not asserted, not frozen |

---

## 7. Unknown-value handling (binding)

**A value that cannot be determined exactly is `null` — never a guess, never a placeholder.**

### 7.1 Admissible "unknown" representations

| Target type | Admissible unknown | Forbidden |
|---|---|---|
| Nullable field (`resolved_version`, `cuda_version`, `gpu_model`, `compute_capability`, `vram_bytes`, `resolved_commit`, `resolved_url`, `wheel_sha256`, `import_name`, `package_id`) | `null` | `""`, `"unknown"`, `"latest"`, `"N/A"`, `"TBD"`, `0`, `-1` |
| String field whose target schema explicitly allows the literal (`git_commit_sha`) | the literal `"unknown"` | any other placeholder |
| Non-nullable string (`python_version`, `os`, `name`, `source`, `spec`, `engine_version`) | not applicable — must be present and exact | `null`, `""`, a guess |

Numeric fields (`vram_bytes`) are `null` or an exact integer. A rounded or "approximately" value is
forbidden — `vram_bytes` is a byte count from the driver, not an estimate.

### 7.2 The `unknowns[]` list

Every unresolved value MUST also be enumerated, so a reader never has to diff the file:

```jsonc
{
  "unknowns": [
    { "field": "dependencies[unsloth].resolved_version", "reason": "git spec tracks default branch; no tag/commit exposed" },
    { "field": "dependencies[unsloth].resolved_commit",  "reason": "commit SHA not captured by the harness" }
  ]
}
```

| Field | Rule |
|---|---|
| `field` | A JSON path into this same artifact (or `environment.*`) |
| `reason` | One line, factual, no speculation |

A `null` in a nullable field without a matching `unknowns[]` entry is a contract violation (§10):
silent nulls hide unfinished work.

### 7.3 The freeze gate

```
frozen_ok = (status == "QUALIFIED") AND (unknowns is empty)
```

- `frozen_ok = true` → the dependency set may be labelled a **frozen pin** and written into
  `PINNED_ENGINE_DEPENDENCIES` with non-null `resolvedVersion`.
- `frozen_ok = false` → the package may still be built and exported, but its engine record is
  `UNQUALIFIED`; the manifest keeps `resolved_version: null` and the run is not a reproducibility
  claim. This is the **current state**: the M2 freeze is incomplete, `resolved_version` is `null`
  for every dependency. Requested PyPI specs and constraints are not measured resolutions.

### 7.4 Forbidden

The harness must never emit, and the consumer must never accept: a version derived from a branch
name; a version from `pip index versions`; a "latest" resolution; a version copied from
documentation, a release note, or a previous artifact; or a value interpolated from the `spec`
range (`>=2.8.0` does **not** imply `2.8.0`).

---

## 8. Status vocabulary

| Status | Meaning | Preconditions |
|---|---|---|
| `QUALIFIED` | A real install resolved every dependency, two fresh environments agreed, **and** the real model-compatibility sequence completed with an unchanged parameter digest | `assertion = IDENTICAL`, `unknowns = []`, all `source: "git"` records have `resolved_commit`, and §14.6 is satisfied in full |
| `PARTIAL` | A real install produced values, but the set is not assertable, not fully resolved, or the model-compatibility sequence did not complete | `assertion ∈ {NOT_RUN, IDENTICAL}` with `unknowns ≠ []`, `P = 1`, or §14 not fully satisfied |
| `FAILED` | The environments disagreed, or installation failed | `assertion = MISMATCH`, or a required dependency could not be installed |
| `QUALIFICATION_FAILED_MEASURED` | The dependency set was resolved, but `openai/gpt-oss-20b` could not be loaded or initialised on this real GPU | a model-compatibility step failed; `model_compatibility.failed_step` and `.failed_step_error` are both populated |

`QUALIFIED` is the only status that authorises a frozen pin (§7.3).

**`QUALIFICATION_FAILED_MEASURED` is a measurement, not a gap.** It is set only when a step actually
ran on real hardware and raised. It is the honest outcome the failure policy requires: the exact GPU,
VRAM, failing step, peak memory, exception and dependency versions are all recorded (§14.5), a smaller
model is **never** substituted, and the architecture is **never** silently changed. Ordering in
`derive_status` is deliberate: a dependency-integrity failure is reported as `FAILED` (the package set
is not trustworthy), while a model-compatibility failure measured on hardware is
`QUALIFICATION_FAILED_MEASURED`.

---

## 9. Content address

```
qualification_hash = sha256( canonical_json(record with qualification_hash = "") )
```

Computed exactly as `computePackageId` computes `package_id`
(`apps/web/lib/training/package.ts:306`): the field is set to `""`, the object is canonicalized
(sorted keys, no whitespace, UTF-8), and hashed. The hash is order-independent across
`dependencies[]` because the array is sorted by `name` before serialization (§4.3 rule 5).

---

## 10. Validation rules — what makes a qualification record invalid

`validateQualification(record): ValidationIssue[]` returns `{ level, field, message }[]`. Any
`ERROR` blocks the paste (§5.1 transform) and blocks the freeze.

1. `contract_schema_version` major unsupported.
2. Any required top-level field (§3) missing or empty.
3. `dependencies[]` empty.
4. The dependency `name` set ≠ the `PINNED_ENGINE_DEPENDENCIES` name set.
5. Any record with `source` outside `{"pip","git"}`.
6. Any record with an empty `spec`.
7. Any `source: "git"` record with `resolved_commit` `null` while `status = "QUALIFIED"`.
8. Any nullable field holding `""`, `"unknown"`, `"latest"`, `"N/A"`, or a non-integer `vram_bytes`.
9. Any `null` in a nullable field with no matching `unknowns[]` entry.
10. `status = "QUALIFIED"` while `assertion ≠ "IDENTICAL"` or `unknowns ≠ []`.
11. `assertion = "IDENTICAL"` with fewer than 2 `passes`, or with differing `base_python` values.
12. `qualification_hash` ≠ the recomputed content address (§9).
13. Any secret, token, credential, or personal filesystem path appearing anywhere in the record
    (the artifact is publishable; Kaggle Secrets are referenced by name only, never by value). Extras
    (§3.1) are scanned too.
14. Any record missing `requested_spec`, or with a `requested_spec` that is not a string.
15. Any `source: "git"` record with `spec` that is not of the form
    `git+<url>@<40-hex-commit>[#subdirectory=<path>]` **while `status = "QUALIFIED"`**.
16. Any `source: "pip"` record with `spec` that is not of the form `<name>==<version>` **while
    `status = "QUALIFIED"`**.
17. Any record whose `spec` differs from `requested_spec` while `resolved_version` is `null`
    (an unfrozen spec must fall back verbatim — §4.0).
18. `additional_dependencies[]` present and non-empty without a matching `warnings[]` entry (§4.5).

Rules 19–24 apply to the **model-compatibility block** (§14.3). They are additive: a record that
violates one of them is invalid exactly as in rules 1–18. Rules 9 and 23 are the two that a
model-compatibility failure is allowed to bend, and only in the specific, declared way described in
§14.5 — never silently.

19. `model_compatibility` missing, empty, or not an object; any of the 33 §14.3 keys absent;
    `qualification_only` not `true`; `base_model` ≠ the qualified base model; any environment mirror
    key (`gpu`, `vram`, `cuda`, `driver`, `compute_capability`, `python_version`) disagreeing with the
    `environment` block; or a `dependency_versions` / `dependency_revisions` entry naming a package
    that is not in `dependencies[]`, or whose value disagrees with the `dependencies[]` record.
20. Any of `optimizer_created`, `backward_executed`, `optimizer_step_executed`,
    `training_loop_executed`, `model_parameters_updated` in the block disagreeing with the same field
    in `qualification_safety` (§13.2). The two blocks are independent evidence; they must agree.
21. `parameter_digest_before` and `parameter_digest_after` both present while
    `model_parameters_updated` ≠ `(parameter_digest_before != parameter_digest_after)`.
22. `status = "QUALIFICATION_FAILED_MEASURED"` without both `failed_step` and `failed_step_error`; or
    a populated `failed_step` while the status is **not** `QUALIFICATION_FAILED_MEASURED`.
23. `status = "QUALIFIED"` while the block is incomplete or the run was not inert. Specifically:
    any of `tokenizer_loaded`, `harmony_verified`, `real_example_tokenized`, `model_loaded`,
    `qlora_initialized`, `batch_collated`, `forward_dry_run_completed`,
    `artifact_destination_writable` is not `true`; any of `optimizer_created`, `backward_executed`,
    `optimizer_step_executed`, `training_loop_executed` is not `false`;
    `model_parameters_updated` is not `false`; the digest pair is absent or unequal; any of
    `base_model_revision`, `total_parameters`, `trainable_parameters`, `vram_before_load`,
    `vram_after_load`, `vram_after_adapter_init`, `peak_vram` is `null`; or `vram_after_load` did not
    grow above `vram_before_load` (a loaded 4-bit model must allocate memory — a non-growing reading
    means the load did not happen).
24. `trainable_percentage` ≠ `round(100.0 * trainable_parameters / total_parameters, 8)`, or
    `trainable_parameters > total_parameters`.

---

## 11. The paste transform (harness output → package)

> Historical M2 example below: its Git requests predate the Kaggle recipe correction.
> Current requested specs are in §4.4 and selection rules in §4.6.


This is the only sanctioned way to move values into `apps/web/lib/training/package.ts`.
For the Kaggle path, §4.6 takes precedence for environment-preserved and skipped entries:
the general inventory and original requests are retained, rather than promoting runtime facts.

### 11.1 `EngineConfig.dependencies[]`

| `EngineDependency` (camelCase) | `env-qualification.json` |
|---|---|
| `name` | `dependencies[i].name` |
| `source` | `dependencies[i].source` |
| `spec` | `dependencies[i].spec` — the **frozen** spec (§4.0), i.e. `name==version` / `git+<url>@<sha>` |
| `resolvedVersion` | `dependencies[i].resolved_version` (may be `null`) |
| `url` | `dependencies[i].url` |

`requested_spec` and the extensions (`resolved_commit`, …) are **not** copied into
`EngineDependency`; they are retained in the qualification artifact and, if desired, in `provenance`
(M2 §5.4). The commit survives in the package because it is part of the frozen `spec`, which is why
no sixth `EngineDependency` field is needed.

### 11.2 `EnvironmentMetadata`

| `EnvironmentMetadata` | Source |
|---|---|
| `os` | `environment.os` |
| `pythonVersion` | `environment.python_version` |
| `gpu` | `environment.gpu_model` |
| `cuda` | `environment.cuda_version` |
| `packages` | `{ name: resolved_version }` for every dependency with a non-null `resolved_version` |

### 11.3 Worked example — the **current, unqualified** state

This is the honest shape today: names and `requested_spec` are real, nothing has resolved, so every
`spec` falls back verbatim to its `requested_spec`, every resolved value is `null`, and the unknowns
are enumerated. It contains **no fabricated versions**.

```jsonc
{
  "dependencies": [
    { "name": "torch",          "source": "pip", "spec": "torch>=2.8.0", "resolved_version": null, "url": null,
      "requested_spec": "torch>=2.8.0" },
    { "name": "triton",         "source": "pip", "spec": "triton>=3.4.0", "resolved_version": null, "url": null,
      "requested_spec": "triton>=3.4.0" },
    { "name": "unsloth_zoo",    "source": "git", "spec": "@git+https://github.com/unslothai/unsloth-zoo", "resolved_version": null, "url": "https://github.com/unslothai/unsloth-zoo",
      "requested_spec": "@git+https://github.com/unslothai/unsloth-zoo",   "resolved_commit": null },
    { "name": "unsloth",        "source": "git", "spec": "@git+https://github.com/unslothai/unsloth", "resolved_version": null, "url": "https://github.com/unslothai/unsloth",
      "requested_spec": "@git+https://github.com/unslothai/unsloth",       "resolved_commit": null },
    { "name": "transformers",   "source": "git", "spec": "@git+https://github.com/huggingface/transformers", "resolved_version": null, "url": "https://github.com/huggingface/transformers",
      "requested_spec": "@git+https://github.com/huggingface/transformers", "resolved_commit": null },
    { "name": "triton_kernels", "source": "git", "spec": "@05b2c186c1b6c9a08375389d5efe9cb4c401c075#subdirectory=python/triton_kernels", "resolved_version": null, "url": "https://github.com/triton-lang/triton.git",
      "requested_spec": "@05b2c186c1b6c9a08375389d5efe9cb4c401c075#subdirectory=python/triton_kernels", "resolved_commit": null },
    { "name": "peft",            "source": "pip", "spec": "peft",            "resolved_version": null, "url": null,
      "requested_spec": "peft" },
    { "name": "trl",             "source": "pip", "spec": "trl",             "resolved_version": null, "url": null,
      "requested_spec": "trl" },
    { "name": "datasets",        "source": "pip", "spec": "datasets",        "resolved_version": null, "url": null,
      "requested_spec": "datasets" },
    { "name": "accelerate",      "source": "pip", "spec": "accelerate",     "resolved_version": null, "url": null,
      "requested_spec": "accelerate" },
    { "name": "bitsandbytes",    "source": "pip", "spec": "bitsandbytes",   "resolved_version": null, "url": null,
      "requested_spec": "bitsandbytes" },
    { "name": "openai-harmony",  "source": "pip", "spec": "openai-harmony", "resolved_version": null, "url": null,
      "requested_spec": "openai-harmony" }
  ],
  "environment": {
    "python_version": "<platform.python_version() — e.g. 3.x.y>",
    "cuda_version": null,
    "gpu_model": null,
    "compute_capability": null,
    "vram_bytes": null,
    "os": "<platform.system()>",
    "fp16_supported": null,
    "bf16_supported": null
  },
  "reproducibility": { "assertion": "NOT_RUN", "passes": [], "comparison": "exact-string-equality-per-name", "dependency_set_hash": null },
  "status": "PARTIAL",
  "unknowns": [
    { "field": "dependencies[*].resolved_version", "reason": "no real install has been performed" },
    { "field": "dependencies[*].resolved_commit", "reason": "no git install has run, so no PEP 610 vcs_info.commit_id was captured" },
    { "field": "environment.cuda_version", "reason": "no GPU-qualified run performed" },
    { "field": "environment.gpu_model", "reason": "no GPU-qualified run performed" },
    { "field": "environment.compute_capability", "reason": "no GPU-qualified run performed" },
    { "field": "environment.vram_bytes", "reason": "no GPU-qualified run performed" }
  ],
  "warnings": [
    "spec is a range, not an exact pin: torch>=2.8.0",
    "spec is a range, not an exact pin: triton>=3.4.0",
    "spec is a range, not an exact pin: @git+https://github.com/unslothai/unsloth-zoo",
    "spec is a range, not an exact pin: @git+https://github.com/unslothai/unsloth",
    "spec is a range, not an exact pin: @git+https://github.com/huggingface/transformers",
    "spec is a bare name, not an exact pin: peft",
    "spec is a bare name, not an exact pin: trl",
    "spec is a bare name, not an exact pin: datasets",
    "spec is a bare name, not an exact pin: accelerate",
    "spec is a bare name, not an exact pin: bitsandbytes",
    "spec is a bare name, not an exact pin: openai-harmony"
  ]
}
```

This artifact is valid under §10 **only if** `status = "PARTIAL"` and every `null` appears in
`unknowns[]`. It must never be rewritten with invented versions.

### 11.4 After a successful harness run

The harness replaces each `null` with the exact resolved value, **freezes `spec`** (§4.0) —
`name==version` for pip, `git+<url>@<sha>` for git — sets `resolved_commit` for every git dependency,
records two identical passes, empties `unknowns[]`, sets `status = "QUALIFIED"`, and recomputes
`qualification_hash`. Only then may `PINNED_ENGINE_DEPENDENCIES` be updated with the frozen `spec`
values and non-null `resolvedVersion` values.

---

## 12. Traceability

| This document | Traces to |
|---|---|
| §4 dependency record | `EngineDependency` (`packages/shared/src/types/training-package.ts:72`); `toManifest` (`apps/web/lib/training/package.ts:237`) |
| §5 environment record | `EnvironmentMetadata` (`packages/shared/src/types/training-package.ts:132`) |
| §5.1 mapping | M2 §3.2 `environment_metadata` |
| §6 fresh-env assertion | M2 §15 open item **O3**; ADR-0012 (canonical package) |
| §7 unknown handling | M2 §3.2 ("may be `\"unknown\"`/`null` if the upstream does not expose one, but the field must exist") |
| §9 content address | `computePackageId` (`apps/web/lib/training/package.ts:306`); M2 §5 |
| §11 paste transform | `apps/web/lib/training/package.ts` (the only writer) |
| §13 qualification safety | `scripts/qualify/qualify-kaggle-env.mjs` (§6 tripwires); `scripts/qualify/check-qualify-harness.mjs`; `verify-m3a` Gate 13 |
| §14 model compatibility | `BASE_MODEL_IDENTITY` / `BASE_MODEL_REVISION` / `LOADER_MODEL_ID` (`apps/web/lib/training/package.ts`); `unsloth.FastLanguageModel.from_pretrained` + `get_peft_model` (`apps/web/lib/workers/kaggle/notebook.template.ipynb` §8–§9); `openai_harmony` (`DEFAULT_HARMONY`, `apps/web/lib/training/package.ts`); the LoRA defaults in `apps/web/components/training/run-form.tsx`; `datasets["GHARIBO-Research-Gold-v0.1"].hashes` (`governance/GHARIBO_MASTER_STATE.json`) |
| §14.4 parameter digest | `scripts/qualify/qualify-kaggle-env.mjs` (`parameter_digest`); the `qualification_safety.model_parameters_updated` basis (§13.2) |

---

## 13. Qualification Safety (training-free guarantee)

The qualification harness installs, loads, and inspects the training stack; it must **never**
train. The zero-cost policy makes this binding: a qualification run must be structurally
incapable of constructing an optimizer, running a backward pass, taking an optimizer step,
running a training loop, or updating model parameters — even though §14 requires the harness to
load the base model and initialise QLoRA adapters.

The safety property is therefore stated as an **invariant over the whole run**, not as an
absence of capability:

```
QUALIFICATION_ONLY = True
assert QUALIFICATION_ONLY is True
```

Loading weights is permitted; changing them is not. §14.4 proves the difference.

### 13.1 Runtime tripwires (normative)

The harness arms tripwires **before any optional work** (before the import smoke test,
before the model-compatibility sequence, and before the reproducibility pass). Invoking any
of the guarded primitives records a violation and raises immediately:

| Guarded primitive | Violation flag |
|---|---|
| optimizer base-class constructor | `optimizer_created` |
| any scheduler constructor | `optimizer_created` |
| optimizer step method | `optimizer_step_executed` |
| tensor backward method | `backward_executed` |
| autograd backward function | `backward_executed` |
| accelerate `Accelerator.backward` | `backward_executed` |

The harness also asserts the module constant `QUALIFICATION_ONLY is True` on the
execution path. Because the tripwires stay armed across the model-compatibility sequence,
a training primitive invoked *after* the model is loaded is caught exactly like one invoked
before — the guard is not scoped to a phase.

### 13.2 The emitted `qualification_safety` block

The record MUST carry a `qualification_safety` top-level block (permitted by §3.1).
Every value is **evidence**, computed from the tripwire state or a parameter-digest
comparison — never hardcoded:

```jsonc
{
  "qualification_safety": {
    "qualification_only": true,
    "optimizer_created": false,
    "backward_executed": false,
    "optimizer_step_executed": false,
    "training_loop_executed": false,
    "model_parameters_updated": false,
    "basis": { "<field>": "<how it was derived>" }
  }
}
```

| Field | Basis |
|---|---|
| `qualification_only` | module constant `QUALIFICATION_ONLY`, asserted `True` on the execution path |
| `optimizer_created` | tripwire on the optimizer base-class constructor (and any scheduler constructor); `true` iff invoked |
| `backward_executed` | tripwire on the tensor backward method and the autograd backward function; `true` iff invoked |
| `optimizer_step_executed` | tripwire on the optimizer step method; `true` iff invoked |
| `training_loop_executed` | derived from the tripwire state: `true` iff any optimizer or backward tripwire fired |
| `model_parameters_updated` | sha256 digest over the trainable parameters of the loaded model (§14.4), compared before vs after the forward-only dry run; `true` iff the digests differ. When no model was loaded the digest pair is absent and the value is `null` (§14.5), never `false` by assumption |

`basis` is a `field → string` map disclosing how each value was derived. The block is
part of the hashed record (§9), so it cannot be altered after the fact. Rule 20 (§10) requires
the five safety flags in `model_compatibility` (§14.3) to agree with this block: the two are
independent recordings of the same facts, and disagreement invalidates the record.

### 13.3 Static safety gate (normative)

The **generated** notebook MUST NOT contain any training primitive. Two independent
gates enforce this on the committed `.ipynb`:

- `scripts/qualify/check-qualify-harness.mjs` (`npm run qualify:check`), and
- `verify-m3a` **Gate 13** (`npm run verify:m3a`).

Forbidden shapes: `trainer.train(`, `.train(`, `optimizer.step(`, `.step()`,
`loss.backward(`, `.backward()`, `torch.autograd.backward(`, `autograd.grad(`,
`accelerator.backward(`, `torch.optim.` (optimizer creation), `lr_scheduler` /
`get_scheduler` (scheduler creation), `torch.optim.Optimizer(`, `optim.AdamW`,
`SFTTrainer`, `SFTConfig`, `Trainer(`, `TrainingArguments(`, `requires_grad_(`,
`enable_grad`, `save_pretrained`, `push_to_hub`.

**Matching rule.** The scan is a conservative raw-substring match over the
concatenated cell sources (comments and string literals included). It is safe to be
strict because the harness authors its prose and its runtime tripwires to avoid these
literal forms: the tripwire code assembles the same names from concatenated fragments
(e.g. `'back' + 'ward'`, `'lr_' + 'scheduler'`). A match is therefore always a genuine
training primitive, never a false positive on a comment or a doc string.

**The gate is not weakened by §14.** Model loading is required by the mission, so the
model-loading tokens (`from_pretrained`, `FastLanguageModel`, `AutoTokenizer`,
`AutoModelForCausalLM`) are deliberately **not** forbidden — they appear in the harness by
design. What remains forbidden is every primitive that *writes* to a parameter, *creates* an
optimizer or scheduler, or *persists* a checkpoint. Gate 13 additionally asserts the positive
side of §14: the full 14-step model-compatibility sequence is present, all 33 mandated artifact
keys are assembled, the forward dry run is under `no_grad` with no labels, and the
no-parameter-update proof exists.

### 13.4 Constraint

The notebook is **model-free only in the sense that it never trains**. It *does* download the
base model's weights and load them (§14.1–§14.2) — that is the whole point of Milestone 3C.
What it never does is construct an optimizer, run a backward pass, take an optimizer step, run a
training loop, or update a model parameter; and it never saves an adapter or checkpoint to disk
and never pushes anything to a model hub (§13.3).

The earlier model-free constraint (v1.2.0 §13.4) is **superseded** by §14. It was the correct
reading of the zero-cost policy while the harness was dependency-only; it is no longer the
correct reading now that the mission requires *measured* proof that `openai/gpt-oss-20b` loads
and initialises on a free Kaggle T4. Loading weights costs no money; training would. The two
are separated by the invariant in §13.1 and proved apart by §14.4.

---

## 14. Model compatibility (real qualification, Milestone 3C)

§4–§13 qualify the *dependency set*. §14 qualifies the *model*. Together they are the two parts
of a single qualification run:

| Part | Question | Evidence |
|---|---|---|
| **A — dependencies** (§4–§12) | Is the engine pin-set resolvable, exact, and reproducible? | `dependencies[]`, `environment`, `reproducibility`, `qualification_hash` |
| **B — model compatibility** (§14) | Does `openai/gpt-oss-20b` actually load, initialise, and run a forward pass on *this* real GPU, without training? | `model_compatibility` |

Part A alone can be satisfied by a machine with no GPU. Part B cannot: it requires a real
accelerator, and its whole purpose is to replace "we believe this fits" with "we measured it
fitting". A record is only `QUALIFIED` (§8) when **both** parts pass.

### 14.0 The 14-step sequence (normative)

The harness performs exactly these steps, in this order, recording each one's
`ok` / `seconds` / `error` into `model_compatibility.steps[]`:

| # | Step | What it proves |
|---|---|---|
| 1 | `resolve_base_model_revision` | the exact revision of `openai/gpt-oss-20b` in use |
| 2 | `resolve_loader_model_revision` | the exact revision of the loader model (`unsloth/gpt-oss-20b`) |
| 3 | `load_tokenizer` | the tokenizer loads at the pinned revision |
| 4 | `verify_harmony_encoding` | `openai_harmony` exposes the gpt-oss encoding |
| 5 | `verify_harmony_tokenizer` | the tokenizer round-trips a Harmony-encoded conversation |
| 6 | `tokenize_real_example` | a **real GHARIBO example** tokenizes (not a synthetic string) |
| 7 | `load_base_model` | the base model loads 4-bit on this GPU |
| 8 | `init_qlora_adapters` | LoRA/QLoRA adapters attach and the trainable set exists |
| 9 | `count_parameters` | total / trainable / percentage |
| 10 | `collate_batch` | one small batch collates with the declared shape |
| 11 | `parameter_digest_before` | the pre-forward fingerprint of the trainable parameters |
| 12 | `forward_dry_run` | one forward pass under `no_grad`, forward-only |
| 13 | `parameter_digest_after` | the post-forward fingerprint — must equal step 11 |
| 14 | `verify_artifact_destination` | the checkpoint/artifact destination is writable |

Steps 11 and 13 bracket step 12 deliberately: the digest is the proof that the forward pass was
inert (§14.4). A failure at any step is recorded and the remaining steps are **skipped**, not
retried with a different configuration (§14.5).

### 14.1 Revision and tokenizer (steps 1–3)

Nothing in this section may be guessed. Every value is read at render time from the repository:

| Value | Source of truth |
|---|---|
| `base_model` | `BASE_MODEL_IDENTITY` (`apps/web/lib/training/package.ts`) |
| `base_model_revision_pin` | `BASE_MODEL_REVISION` (same file) |
| `loader_model` | `LOADER_MODEL_ID` (same file) |
| `loader_quantization` | the intended low-memory path: `4-bit` |

The harness resolves the **live** revision via `huggingface_hub.HfApi().model_info(repo_id=...)`
and records it as `base_model_revision` / `loader_model_revision`. It also records
`base_model_revision_matches_pin` — the boolean comparison against the repository pin. A
divergence is a `WARNING`-class fact, surfaced in `warnings[]`, **never** silently reconciled: if
upstream moved, the operator must decide, not the harness.

The tokenizer is loaded at the resolved revision so that the tokenizer and the weights are
guaranteed to be the same revision.

### 14.2 Harmony and the real example (steps 4–6)

gpt-oss does not use a plain chat template; it uses OpenAI **Harmony**. The harness verifies this
in two independent ways, because "the encoding imported" and "the encoding works" are different
claims:

1. `verify_harmony_encoding` — `openai_harmony.load_harmony_encoding(HarmonyEncodingName.HARMONY_GPT_OSS)`
   resolves, and the returned encoding exposes the expected control tokens
   (`<|start|>`, `<|message|>`, `<|channel|>`, `<|constrain|>`, `<|return|>`, `<|end|>`).
2. `verify_harmony_tokenizer` — `tokenizer.apply_chat_template(...)` round-trips a
   Harmony-shaped conversation, and the encoded control tokens are present in the result.

`harmony_verified` is `true` only when **both** hold; the two individual booleans and their detail
strings are retained in `model_compatibility.harmony` for audit. `reasoning_effort`,
`developer_template_id`, and `hidden_channels` come from `DEFAULT_HARMONY` in
`apps/web/lib/training/package.ts` — again read, never retyped.

**The example must be real.** Step 6 tokenizes an actual record from
`GHARIBO-Research-Gold-v0.1`, selected **deterministically** as the TRAIN record whose
`sha256(line bytes)` sorts first — so re-executing the notebook picks the same record and the same
`example_token_count`. Before any of this, and *before* the install, the harness recomputes the
dataset's content address from the raw line bytes and aborts on mismatch:

| Recomputed | Committed value |
|---|---|
| `splitHash(train)` | `84025de18403b8660d9702877b2b6fd329cedb886cad0095ab67e4daa3828ad2` |
| `splitHash(validation)` | `063fb4422aed247b3f92c0f0d5b1291af46fd4357ca48829a7e7f6ce98815787` |
| `splitHash(test)` | `55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b` |
| `datasetHash` | `84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5` |

The hashes are read from `governance/GHARIBO_MASTER_STATE.json`; the dataset itself is **not**
committed to the repository and is **not** embedded in the notebook. The operator attaches it as a
Kaggle Dataset; the harness locates it under `/kaggle/input` and verifies it. A mismatch aborts
with `Refusing to qualify against a dataset that does not match the committed hashes.` — a
qualification run against the wrong data would be worthless, so it must fail loudly and early.

### 14.3 The `model_compatibility` block (normative)

The record MUST carry a `model_compatibility` top-level block (permitted by §3.1). All 33 keys
below are **required**; rule 19 (§10) invalidates a record that omits any of them. The flat,
duplicated key names are intentional: this block is the machine-readable answer to the mission's
artifact checklist, and it must be readable without understanding the rest of the schema.

| Key | Type | Meaning |
|---|---|---|
| `qualification_only` | `true` | the invariant of §13.1, mirrored here |
| `gpu` | string | GPU model (mirrors `environment.gpu_model`) |
| `vram` | int | VRAM in bytes (mirrors `environment.vram_bytes`) |
| `cuda` | string | CUDA version (mirrors `environment.cuda_version`) |
| `driver` | string | NVIDIA driver version (mirrors `environment.driver_version`) |
| `compute_capability` | string | compute capability (mirrors `environment.compute_capability`) |
| `python_version` | string | Python version (mirrors `environment.python_version`) |
| `dependency_versions` | object | `name → resolved_version` for the model-relevant packages |
| `dependency_revisions` | object | `name → resolved_commit` for the git-sourced packages |
| `base_model` | string | `openai/gpt-oss-20b` |
| `base_model_revision` | string \| null | the **resolved** revision (step 1) |
| `tokenizer_loaded` | bool | step 3 |
| `harmony_verified` | bool | steps 4 **and** 5 |
| `real_example_tokenized` | bool | step 6 (a real GHARIBO example) |
| `model_loaded` | bool | step 7 |
| `qlora_initialized` | bool | step 8 |
| `batch_collated` | bool | step 10 |
| `forward_dry_run_completed` | bool | step 12 |
| `total_parameters` | int \| null | step 9 |
| `trainable_parameters` | int \| null | step 9 |
| `trainable_percentage` | float \| null | step 9 |
| `vram_before_load` | int \| null | `memory_allocated(0)` immediately before step 7 |
| `vram_after_load` | int \| null | `memory_allocated(0)` immediately after step 7 |
| `vram_after_adapter_init` | int \| null | `memory_allocated(0)` immediately after step 8 |
| `peak_vram` | int \| null | `max_memory_allocated(0)` after a reset immediately before step 12 |
| `artifact_destination_writable` | bool | step 14 |
| `optimizer_created` | bool | tripwire (§13.2) |
| `backward_executed` | bool | tripwire (§13.2) |
| `optimizer_step_executed` | bool | tripwire (§13.2) |
| `training_loop_executed` | bool | tripwire-derived (§13.2) |
| `model_parameters_updated` | bool \| null | digest comparison (§14.4) |
| `parameter_digest_before` | string \| null | step 11 |
| `parameter_digest_after` | string \| null | step 13 |

The block also carries **audit extensions** (permitted by §3.1, ignored by the package consumer):
`status`, `run_enabled`, `failed_step`, `failed_step_error`, `steps[]`, `loader_model`,
`loader_model_revision`, `loader_quantization`, `base_model_revision_pin`,
`base_model_revision_matches_pin`, `dtype`, `max_seq_length`, `batch_size`,
`gradient_accumulation_steps`, `seed`, `lora{...}`, `harmony{...}`, `example_token_count`,
`batch_shapes`, `forward`, `trainable_tensors`, the `*_basis` strings, and `dataset`.

The qualification **configuration** (dtype `fp16`, `max_seq_length` with its low-VRAM downgrade,
`batch_size`, `gradient_accumulation_steps`, LoRA `r`/`alpha`/`target_modules`/`dropout`/`bias`,
`seed`, `use_gradient_checkpointing`) is read from `run-form.tsx` and `package.ts` and recorded so
the qualification is reproducible. It is *not* authoritative for training: the training run takes
its recipe from the Training Package (M2). The recorded values exist so that "the configuration we
qualified" is a fact, not a memory.

`failed_step_error` is passed through the §10 rule 13 scrubber: secrets are redacted and
filesystem paths are replaced, while URLs and exception types survive. The artifact is
publishable, so it must not leak a Kaggle working directory.

### 14.4 Parameter-update proof (normative)

Step 12 is a forward pass and nothing else:

- it runs under `with torch.no_grad():`;
- it passes **only** `input_ids` and `attention_mask` — deliberately **no `labels`**, so no loss
  is computed and there is nothing to differentiate;
- it calls neither backward nor step; no optimizer exists at that point in the process.

The proof that the pass was inert is a **digest**, not an assertion:

```
parameter_digest(model) = sha256(
    "\n".join(f"{name}:{sha256(param.detach().float().cpu().numpy().tobytes())}"
              for name, param in sorted(model.named_parameters()) if param.requires_grad)
)
```

The digest is computed over the trainable parameters only — those are the ones training would
change, so they are the ones worth fingerprinting. It is taken before (step 11) and after
(step 13) the dry run, and:

```
model_parameters_updated = (parameter_digest_after != parameter_digest_before)
```

A `QUALIFIED` record requires this to be `false` **and** the two digests to be present and equal
(rule 23). This value is never fabricated: if no model was loaded there is no digest pair, and
the field is `null` with a matching `unknowns[]` entry (§7) rather than a comforting `false`.
Rule 21 additionally requires the flag to agree with the digest comparison, and rule 20 requires
it to agree with `qualification_safety.model_parameters_updated`.

### 14.5 Failure policy (normative)

If `openai/gpt-oss-20b` cannot fit or cannot initialise on the real GPU, the harness records the
**measured** failure and stops. It must not substitute a smaller model, must not fall back to a
different quantization, and must not alter the architecture to make the run pass.

On failure the record is still written — a measurement is a result, not an error — with:

- `status = "QUALIFICATION_FAILED_MEASURED"` (§8);
- `model_compatibility.failed_step` naming the first failing step;
- `model_compatibility.failed_step_error` carrying the exact exception (redacted and
  path-scrubbed);
- every subsequent step recorded as skipped;
- the VRAM readings taken so far, and the exact dependency versions and revisions resolved;
- `failed_step` **and** `failed_step_error` both populated (rule 22 requires it).

The status ordering in `derive_status` is deliberate. A **dependency-integrity** failure is
`FAILED`: the package set itself is not trustworthy, so nothing downstream can be. A
**model-compatibility** failure measured on hardware is `QUALIFICATION_FAILED_MEASURED`: the
engine pin-set is fine, and we now know something true and useful about the hardware. Collapsing
the second into the first would throw away the measurement.

### 14.6 Success criteria (normative)

Part B passes, and a record may be `QUALIFIED`, only if **all** of the following hold. These are
enforced by rule 23 (§10) and, statically, by Gate 13 (§13.3).

| # | Criterion | Field |
|---|---|---|
| 1 | the tokenizer loads | `tokenizer_loaded is true` |
| 2 | Harmony works | `harmony_verified is true` |
| 3 | a real GHARIBO example tokenizes | `real_example_tokenized is true` |
| 4 | the base model loads | `model_loaded is true` |
| 5 | QLoRA adapters initialise | `qlora_initialized is true` |
| 6 | a small batch collates | `batch_collated is true` |
| 7 | the forward-only dry run succeeds | `forward_dry_run_completed is true` |
| 8 | the parameter digest is unchanged | `parameter_digest_before == parameter_digest_after`, `model_parameters_updated is false` |
| 9 | no optimizer exists | `optimizer_created is false` |
| 10 | no backward occurs | `backward_executed is false` |
| 11 | no optimizer step occurs | `optimizer_step_executed is false` |
| 12 | no training loop runs | `training_loop_executed is false` |
| 13 | the artifact destination is writable | `artifact_destination_writable is true` |
| 14 | the exact versions and revisions are captured | `base_model_revision`, `dependency_versions`, `dependency_revisions` all populated |
| 15 | memory really moved | `vram_after_load > vram_before_load` |

Criterion 15 deserves emphasis: a 4-bit model load that allocates no additional VRAM did not
happen. Requiring the reading to grow is what makes `model_loaded: true` an observation instead
of a claim.

Only after all fifteen hold — and part A is also `QUALIFIED` — may
`PINNED_ENGINE_DEPENDENCIES` in `apps/web/lib/training/package.ts` be updated via the §11 paste
transform and the architecture §15 **O3** freeze be declared.

---

*End of `docs/ENV_QUALIFICATION_CONTRACT.md` — GHARIBO AI LAB.*
