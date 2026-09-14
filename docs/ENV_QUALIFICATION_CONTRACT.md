# GHARIBO Environment Qualification Contract

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Domain spec |
| **Status** | Draft |
| **Version** | 1.2.0 |
| **Last Updated** | 2026-09-14 |

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
entry, and the `unsloth` / `unsloth_zoo` / `transformers` git specs track upstream default branches
with no commit SHA. **Exact versions cannot be known without performing a real install.**

This contract closes that gap honestly:

1. the harness runs on the real worker (Kaggle, NVIDIA T4) and records what it actually installed;
2. it runs the resolution in **two fresh environments** and asserts the sets are identical;
3. it emits `env-qualification.json` in the shape defined here;
4. that file is transformed (§5) into the package's engine + environment records with **no manual
   editing and no guessing**.

A dependency set that has not been through this harness is `UNQUALIFIED`, and the package that
carries it is not a frozen pin (§7).

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
  "status": "QUALIFIED | PARTIAL | FAILED",

  "dependencies": [ /* §4 — one record per pinned dependency */ ],
  "additional_dependencies": [ /* §4.5 — recipe-required, not pinned in package.ts */ ],
  "environment":  { /* §5 */ },
  "reproducibility": { /* §6 */ },
  "unknowns": [ /* §7 — explicit list of every unresolved value */ ],
  "warnings": [ /* optional: non-fatal notes, e.g. "spec is a range, not an exact pin" */ ],

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
a contract change.

| Rule | Value |
|---|---|
| Extras allowed? | **Yes**, at any level |
| May an extra shadow a required key? | **No** — a name collision with a required key is a violation |
| Must the five required blocks still be present? | **Yes** — an extra is never a substitute. In particular a bespoke `verification{}` block does **not** replace `reproducibility{}` |
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
   set of `name` values in `PINNED_ENGINE_DEPENDENCIES`, with no additions and no omissions. A
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
| `unsloth_zoo` | git | `@git+https://github.com/unslothai/unsloth-zoo` | `git+https://github.com/unslothai/unsloth-zoo@<40-hex commit>` |
| `unsloth` | git | `@git+https://github.com/unslothai/unsloth` | `git+https://github.com/unslothai/unsloth@<40-hex commit>` |
| `transformers` | git | `@git+https://github.com/huggingface/transformers` | `git+https://github.com/huggingface/transformers@<40-hex commit>` |
| `triton_kernels` | git | `@05b2c186c1b6c9a08375389d5efe9cb4c401c075#subdirectory=python/triton_kernels` | `git+https://github.com/triton-lang/triton.git@<40-hex commit>#subdirectory=python/triton_kernels` |
| `peft` | pip | `peft` | `peft==<resolved version>` |
| `trl` | pip | `trl` | `trl==<resolved version>` |
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
`UNPINNED_QUALIFICATION_ENTRIES` in the harness is now empty (all 6 promoted).

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
  for every dependency, and the `unsloth` / `unsloth_zoo` / `transformers` git specs track upstream
  default branches with no commit SHA. That is recorded as an open item, not papered over.

### 7.4 Forbidden

The harness must never emit, and the consumer must never accept: a version derived from a branch
name; a version from `pip index versions`; a "latest" resolution; a version copied from
documentation, a release note, or a previous artifact; or a value interpolated from the `spec`
range (`>=2.8.0` does **not** imply `2.8.0`).

---

## 8. Status vocabulary

| Status | Meaning | Preconditions |
|---|---|---|
| `QUALIFIED` | A real install resolved every dependency and two fresh environments agreed | `assertion = IDENTICAL`, `unknowns = []`, all `source: "git"` records have `resolved_commit` |
| `PARTIAL` | A real install produced values, but the set is not assertable or not fully resolved | `assertion ∈ {NOT_RUN, IDENTICAL}` with `unknowns ≠ []`, or `P = 1` |
| `FAILED` | The environments disagreed, or installation failed | `assertion = MISMATCH`, or a required dependency could not be installed |

`QUALIFIED` is the only status that authorises a frozen pin (§7.3).

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

---

## 11. The paste transform (harness output → package)

This is the only sanctioned way to move values into `apps/web/lib/training/package.ts`.

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
| §13 qualification safety | `scripts/qualify/qualify-kaggle-env.mjs` (§5b tripwires); `scripts/qualify/check-qualify-harness.mjs`; `verify-m3a` Gate 13 |

---

## 13. Qualification Safety (training-free guarantee)

The qualification harness installs and inspects the training stack; it must **never**
train. The zero-cost / no-weight-download policy makes this binding: a qualification
run must be structurally incapable of constructing an optimizer, running a backward
pass, taking an optimizer step, running a training loop, or updating model parameters.

### 13.1 Runtime tripwires (normative)

The harness arms tripwires **before any optional work** (before the import smoke test
and before the reproducibility pass). Invoking any of the guarded primitives records a
violation and raises immediately:

| Guarded primitive | Violation flag |
|---|---|
| optimizer base-class constructor | `optimizer_created` |
| any scheduler constructor | `optimizer_created` |
| optimizer step method | `optimizer_step_executed` |
| tensor backward method | `backward_executed` |
| autograd backward function | `backward_executed` |
| accelerate `Accelerator.backward` | `backward_executed` |

The harness also asserts the module constant `QUALIFICATION_ONLY is True` on the
execution path.

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
| `model_parameters_updated` | sha256 digest over every live tensor that requires grad, compared before vs after the run; no model is loaded, so the set is empty and equality is expected |

`basis` is a `field → string` map disclosing how each value was derived. The block is
part of the hashed record (§9), so it cannot be altered after the fact.

### 13.3 Static safety gate (normative)

The **generated** notebook MUST NOT contain any training primitive. Two independent
gates enforce this on the committed `.ipynb`:

- `scripts/qualify/check-qualify-harness.mjs` (`npm run qualify:check`), and
- `verify-m3a` **Gate 13** (`npm run verify:m3a`).

Forbidden shapes: `trainer.train(`, `.train(`, `optimizer.step(`, `.step()`,
`loss.backward(`, `torch.autograd.backward(`, `accelerator.backward(`, `torch.optim.`
(optimizer creation), `lr_scheduler` / `get_scheduler` (scheduler creation),
`torch.optim.Optimizer(`.

**Matching rule.** The scan is a conservative raw-substring match over the
concatenated cell sources (comments and string literals included). It is safe to be
strict because the harness authors its prose and its runtime tripwires to avoid these
literal forms: the tripwire code assembles the same names from concatenated fragments
(e.g. `'back' + 'ward'`, `'lr_' + 'scheduler'`). A match is therefore always a genuine
training primitive, never a false positive on a comment or a doc string.

### 13.4 Constraint

The notebook remains **model-free**: no model weight download, no model load. The
mission's "allowed" list (base-model loading, tokenization, QLoRA init, forward dry
run) is permissive, not mandatory; the binding zero-cost / no-weight-download policy
is honoured by keeping the harness model-free.

---

*End of `docs/ENV_QUALIFICATION_CONTRACT.md` — GHARIBO AI LAB.*
