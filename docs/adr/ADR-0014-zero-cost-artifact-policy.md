# ADR-0014: Zero-cost artifact policy — optional private HF, local fallback, never GitHub

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | 1.1.0 |

## Context

M2 produces real training artifacts — LoRA adapters, optimizer/trainer state, checkpoints, metrics,
logs, and a manifest. They need somewhere to live. Three constraints bound the choice:

1. **Zero monetary cost is a milestone-level hard constraint** (PRD §1.3, NG-7). No paid storage.
2. **GHARIBO must work with no external repository configured.** The PRD makes
   `artifact_destination` optional (P0-12, Q4); the tool cannot depend on a third-party account
   existing.
3. **Kaggle sessions are ephemeral.** Only `/kaggle/working` (≤ 20 GB) survives, and only when the
   notebook runs as a committed/Save-Version run. Anything else is wiped.

Additionally, HF tokens must never appear in notebook source, logs, or committed files (NG-10), and
GitHub is the source-code/documentation home — not a model-artifact store.

Options: (a) require a private HF repo, (b) local-only, (c) optional private HF **with** a complete
local fallback and no dependency on any external service.

## Decision

We will adopt a **zero-cost artifact policy**: local export is the **default and complete**
destination; a **private Hugging Face repo within the free allowance** is an **optional**
enhancement reached only via **Kaggle Secrets**; **GitHub never holds artifacts**.

- `artifact_destination` is `null` by default. When `null`, the notebook writes all artifacts under
  `/kaggle/working`, produces `CHECKSUMS.sha256`, and stops — a complete, usable result.
- When configured, `kind` must be `"hf"` with `private === true` and a `repoId`; the token is read
  from a Kaggle Secret by **name** (`token_secret_name`), never printed, never written to any file,
  never committed. Upload is wrapped so a missing secret or failed upload degrades to the local
  result rather than failing the run.
- **No paid provider or paid storage is referenced anywhere** — not as a dependency, default,
  fallback, or "alternative considered". Google Colab is likewise excluded.
- Artifacts are integrity-checked regardless of destination: per-file SHA-256 plus a rollup
  (manifest-of-hashes), recorded in `training_artifacts` and `CHECKSUMS.sha256`.

## Consequences

### Positive
- The pipeline is fully usable at **$0** and with **no third-party account**: clone, export, run on
  Kaggle, keep the output. Nothing external is required.
- A single, honest default (local) removes a setup dependency and a failure mode from the first run.
- Secret handling is structural: the token is a referenced *name* resolved at runtime from Kaggle
  Secrets, so the committed notebook and the repo are secret-free by construction.
- GitHub stays clean — no large binaries, no LFS pressure, no accidental weight publication.

### Negative / Trade-offs
- Local artifacts are only as durable as the operator's machine and the Kaggle notebook output;
  there is no automatic off-site backup unless the operator opts into HF.
- The HF path adds a private-repo and Secret-setup step for operators who want it — deliberate
  optionality, but it is extra configuration.
- HF's free allowance is a soft limit; a large enough artifact set could exceed it. This is
  acceptable because HF is optional and the local path is always available.
- Degrading an upload failure to a local success is convenient but means a silent upload problem
  must be surfaced clearly in the run log and status, not hidden.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Require a private HF repo for every run | Violates "works with no external repository"; adds a mandatory third-party dependency and a failure mode to the first run |
| Local-only, no optional destination | Loses convenient private off-site storage for operators who want it; the PRD explicitly allows an optional destination |
| Store artifacts in the GitHub repo (or Git LFS) | GitHub is source-code/documentation only; binary weights do not belong in the repo and would bloat it |
| Commit the HF token or pass it via a notebook cell | Directly violates NG-10; the token must never appear in source, logs, or committed files |
| Use any paid storage backend | Violates the absolute zero-cost constraint (NG-7) |

## References

- `docs/PRD_MILESTONE_2.md` — P0-12, P0-13, P0-20, NG-7, NG-10, §11 (free-tier resilience), Q4
- `docs/ARCHITECTURE_MILESTONE_2.md` §9.4 (secrets), §11 (free-tier storage design)
- `docs/adr/ADR-0004-credentials-by-reference.md` (the credentials-by-reference precedent)
- `.workbuddy-ai/artifacts/m2-stack-facts.md` §1, §11 (persistence + storage policy)
- `apps/web/lib/workers/kaggle/notebook.template.ipynb`, `apps/web/lib/db/repositories/training-artifacts.ts`
