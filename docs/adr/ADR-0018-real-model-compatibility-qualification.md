# ADR-0018: Real model-compatibility qualification before the engine freeze

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | CTO / Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | post-M3B (Milestone 3C) |

## Context

Milestone 3B delivered an environment qualification harness that resolved the training engine's
dependency pin-set on a real free Kaggle GPU. That harness was deliberately **model-free**: it
installed the stack, imported it, recorded exact versions and commits, and proved reproducibility —
but it never downloaded or loaded `openai/gpt-oss-20b`. The binding zero-cost policy was read as
"no weights on disk", and the model-free harness satisfied it.

That reading left a gap. The project's central hardware bet is that a **20-billion-parameter
MoE model with QLoRA can fit in a free Kaggle T4 (16 GB, compute capability 7.5)**. The dependency
qualification says nothing about that bet. It cannot tell us:

- whether `openai/gpt-oss-20b` actually loads in 4-bit on 16 GB;
- whether the tokenizer and the OpenAI **Harmony** encoding work with the real base model;
- whether LoRA adapters attach and how many parameters are trainable;
- whether a batch collates at the qualified sequence length;
- how much VRAM the load and the adapter init actually consume, and what the forward peak is;
- whether the checkpoint destination the worker relies on is even writable.

Every one of those is currently an **assumption**. The architecture's §15 **O3** freeze — the point
at which the engine pin-set becomes authoritative — was gated on a qualification that could not
address them. Freezing the engine on a dependency-only qualification would freeze a bet we had
never measured.

The counter-pressure is the zero-cost policy itself. "Load the model during qualification" sounds
like the first step toward training, and the CEO mandate is explicit: **do not train**. Any change
that permits a model to be loaded must therefore make training *impossible*, not merely
discouraged.

## Decision

We will extend the qualification contract to a **second part** — real model-compatibility
qualification — while keeping the run structurally incapable of training.

- **The qualification artifact gains a `model_compatibility` block** (contract §14.3) carrying 33
  mandated keys: the hardware reading, the resolved dependency versions and revisions, the base
  model and its **resolved** revision, the tokenizer / Harmony / real-example / load / QLoRA /
  batch / forward booleans, total and trainable parameter counts, the four VRAM readings, the
  artifact-destination check, the five safety flags, and the parameter digest pair.
- **A 14-step sequence is mandated** (contract §14.0), ordered, with per-step `ok` / `seconds` /
  `error` recorded. Steps 11 and 13 bracket the forward dry run with a parameter digest.
- **Training remains forbidden, and the prohibition is proven rather than asserted.** The
  `QUALIFICATION_ONLY = True` invariant and the runtime tripwires (contract §13.1) are retained and
  now stay armed *across* the model-compatibility sequence. The forward dry run is
  `torch.no_grad()`, passes **no labels**, and is bracketed by a sha256 digest over the trainable
  parameters; `model_parameters_updated` is derived from the digest comparison and is `null` — never
  a fabricated `false` — when no model loaded.
- **The static gate is strengthened, not relaxed.** The model-loading tokens
  (`from_pretrained`, `FastLanguageModel`, `AutoTokenizer`) are removed from the forbidden list
  because §14 requires them; every primitive that *writes* a parameter, *creates* an optimizer or
  scheduler, or *persists* a checkpoint is added (`optim.AdamW`, `SFTTrainer`, `SFTConfig`,
  `Trainer(`, `TrainingArguments(`, `requires_grad_(`, `enable_grad`, `.backward()`,
  `autograd.grad(`, `save_pretrained`, `push_to_hub`, …). Both gates — `qualify:check` and
  `verify:m3a` Gate 13 — enforce the strengthened list, and Gate 13 additionally asserts the
  *positive* side of §14.
- **Failure is measured, never worked around.** If the model cannot fit or initialise, the run
  records `status = "QUALIFICATION_FAILED_MEASURED"` with the failing step and its exact exception,
  and stops. No smaller model is substituted, no fallback quantization is tried, and the
  architecture is not changed to make the run pass (contract §14.5).
- **Nothing is guessed.** Every value the harness uses — base model id, revision pin, loader model
  id, dtype, sequence length and its low-VRAM downgrade, batch size, gradient accumulation, LoRA
  rank/alpha/target modules/dropout/bias, seed, gradient-checkpointing mode, Harmony defaults, and
  the dataset's split and content hashes — is read at render time from
  `apps/web/lib/training/package.ts`, `apps/web/components/training/run-form.tsx`, or
  `governance/GHARIBO_MASTER_STATE.json`. The generator refuses to render if any is unavailable.
- **The real dataset is verified, not embedded.** The notebook contains only hashes. It locates the
  operator-attached Kaggle Dataset, recomputes all three split hashes and the content address from
  the raw line bytes, and **aborts before the install** on any mismatch.

## Consequences

### Positive
- The engine freeze (architecture §15 O3) becomes a decision backed by **measurement**: the model
  either loads on a real T4 or it does not, and either way we know it.
- The 20B-on-16GB bet is tested **before** any training budget, time, or expectation is committed to
  it. A negative result costs one Kaggle session and yields a precise, publishable failure.
- The zero-cost policy is strengthened rather than bent: loading weights costs nothing, and the
  prohibition that matters — no parameter update — is now *proven* by a digest instead of assumed.
- The `model_compatibility` block is a self-contained answer to "is this base model viable on this
  hardware?", readable without the rest of the schema, and content-addressed so it cannot be edited
  after the fact.
- Because the digest pair and the tripwire flags must agree across two independent blocks
  (contract §10 rule 20), a fabricated or partially-completed result is detectable.
- The dataset gate makes "qualified against the wrong data" structurally impossible.

### Negative / Trade-offs
- Qualification now **downloads model weights**, which the previous harness explicitly did not.
  This is a real change in kind, and it is why it required an ADR rather than a patch. It is
  acceptable because it costs no money, and because the digest proves the weights are read-only.
- The harness is substantially larger and now depends on `torch`, `huggingface_hub`, `openai_harmony`
  and the dataset being present. It can no longer run anywhere; it requires a real GPU.
- A failing run leaves the artifact in `QUALIFICATION_FAILED_MEASURED`, which is a legitimate status
  the freeze gate must handle — more states, more rules (contract §10 rules 19–24).
- The `model_compatibility` block duplicates environment values already in `environment`. The
  duplication is deliberate (§14.3) and rule 19 makes disagreement an error, but it is redundancy
  that must be maintained.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Keep the harness model-free and freeze the engine on dependency qualification alone | Freezes a hardware bet that was never measured; the 20B-on-16GB assumption stays an assumption at exactly the moment it becomes authoritative |
| Verify model compatibility as part of the first training run | Conflates qualification with training; a compatibility failure would then be discovered inside a run that is already attempting to update parameters, violating the prohibition |
| Load the model in a separate, ad-hoc script outside the governed harness | Un-gated, un-versioned, unreproducible, and invisible to `qualify:check` and Gate 13 — the safety property would depend on nobody editing the script |
| Substitute a smaller model when the 20B does not fit | Silently changes the architecture, and produces a "qualified" result for a model we never intended to train — the most dangerous possible outcome |
| Record `model_parameters_updated: false` as a constant | A fabricated proof of the one property the whole safety design exists to guarantee; the value is derived from a digest or is `null` |

## References

- `docs/ENV_QUALIFICATION_CONTRACT.md` §13–§14 — the qualification-safety guarantee and the
  model-compatibility contract this decision establishes
- `docs/ARCHITECTURE.md` §15 — the **O3** freeze this decision gates
- `apps/web/lib/training/package.ts` — `BASE_MODEL_IDENTITY`, `BASE_MODEL_REVISION`,
  `LOADER_MODEL_ID`, `DEFAULT_HARMONY`, `PINNED_ENGINE_DEPENDENCIES`
- `apps/web/components/training/run-form.tsx` — the declared qualification recipe defaults
- `apps/web/lib/workers/kaggle/notebook.template.ipynb` §8–§9 — the intended 4-bit load and QLoRA
  path the harness mirrors
- `scripts/qualify/qualify-kaggle-env.mjs` — the authoritative generator
- `scripts/qualify/check-qualify-harness.mjs`, `scripts/verify-m3a/gates.ts` Gate 13 — the two static
  safety gates
- `governance/GHARIBO_MASTER_STATE.json` — the dataset hashes the harness verifies against
- ADR-0013 — content-addressed immutable dataset versions with deterministic hashed splits
- ADR-0014 — zero-cost artifact policy
