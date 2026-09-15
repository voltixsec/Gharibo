# ADR-0019: Governed physical Gold package preview

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-15 |
| **Deciders** | CTO (GHARIBO AI LAB) |
| **Supersedes** | — (extends ADR-0012 with a non-executable preview) |
| **Superseded by** | — |
| **Architecture Version** | 1.2.0 |

## Context

Bridge A+B2 supports physical Harmony records, but the Data Factory split type cannot express
Gold's audit quarantine or its absent minimum. An issued-package export also requires SQLite
and a real run. The CTO requested B3 preparation only, using the accepted 800 = 640/80/80 Gold
identity, qualification hash and measured engine freeze. Training remains NOT_STARTED and
GHARIBO-exp-001 remains NOT_AUTHORIZED.

## Decision

1. Extend the package writer to schema 1.1.0. `dataset.record_format` distinguishes
   `canonical-record-v1` from `harmony-messages-v1`. Preserve 1.0.0 manifest identity and infer
   canonical records only for that legacy version. Missing format in 1.1.0 is an error.
2. Keep the Data Factory split contract unchanged. The package accepts a separate Gold policy:
   `seeded-sha256-content-hash-with-audit-quarantine`, seed 20260914, ratios 0.8/0.1/0.1,
   original method/hash definitions, audit seed/cohort/quarantine destinations and TEST policy.
   `minimum_records_per_split: null` means the physical card declares no minimum. It never
   invents 1, 80, or a Data Factory default. Nonempty splits remain an integrity check.
3. Lock `gharibo-gold-b3-candidate-v1` in `apps/web/lib/training/gold-recipe.ts`: r=16,
   alpha=32, q_proj/v_proj, seed=42, sequenceLength=512, batch=1, gradAccum=4,
   learningRate=2e-4, one epoch on 640 TRAIN, maxSteps=null. These are candidate choices,
   not a training authorization. Explicit inherited policy values are adamw_8bit, warmup=5,
   linear scheduler, weightDecay=0.01, fp16, dropout=0, bias=none, checkpoint steps=50,
   retention=2, no resume, null destination, and the existing Harmony/evaluation intent.
   Tests compare these frozen values with `package.ts` policy constants. The recipe hash
   is SHA-256 of its canonical sorted-key JSON, including identity and policy references.
4. `npm run preview:gold` performs two independent physical reads/builds entirely in memory.
   Both must match the accepted dataset/split hashes. It emits metadata to stdout only;
   no SQLite access, run creation, package persistence, model loading, authorization or training.
   The in-memory ZIP contains manifest, recipe, TRAIN, VALIDATION, PREVIEW notice and checksums.
   TEST is read only for raw-line count/hash integrity, never parsed as messages, returned by
   the reader, bundled, rendered, used for training or used for selection.
5. Content-address the preview manifest with `package_id=""` using the existing algorithm.
   Include qualification hash, engine freeze/dependencies, Gold hashes, recipe hash, actual
   current `git rev-parse HEAD`, working-tree dirtiness and a content hash of the preview
   implementation files. The latter normalizes CRLF to LF before hashing and includes the
   sorted relative-path-to-file-hash map. `created_at` is the explicit recipe definition
   timestamp for this preview, not wall-clock runtime or evidence of an issued package.
6. Compare package IDs, manifest bytes, every bundle entry, checksum bytes and ZIP bytes
   across the two builds. Keep the manifest schema validator in this path. An executable
   notebook cannot be rendered for a preview, its header refuses preview manifests, and
   the repository refuses to issue/persist them before touching SQLite.
7. Governance may retain metadata evidence for the pre-commit preview, with the baseline
   commit and dirty flag stated explicitly. A clean post-commit preview is recomputed after
   checkpointing and has a new identity because its commit and dirty flag changed. It is
   reported separately; no commit claims to contain its own SHA. The experiment's real
   `packageId` and `trainingRunId` remain null and `trainingAuthorized` remains false.

## Consequences

Physical Gold becomes reviewable through the existing package identity machinery without
re-canonicalizing or re-splitting it. Legacy issued packages retain their identity. This preview
is an additional review artifact; the runnable ADR-0012 bundle contract is unchanged.
Any later execution requires a separately governed authorization and a newly issued package.
No token rendering, GPU check, training or benchmark result is claimed by the preview.

## Alternatives Considered

- Import Gold into SQLite: introduces persistence and could alter physical content identity.
- Invent a minimum or reuse the Data Factory policy: misstates the source contract.
- Use UI defaults or a synthetic TrainingRun: obscures recipe identity and authorization state.
- Bundle TEST or an executable notebook: unnecessary for this review and widens access.

## References

- `docs/ARCHITECTURE_MILESTONE_2.md` §3.0
- `docs/adr/ADR-0012-canonical-training-package.md`
- `docs/adr/ADR-0017-master-state-single-source-of-truth.md`
- `governance/GHARIBO_MASTER_STATE.json` (DEC-0024)
- `apps/web/lib/training/gold-preview.ts`
