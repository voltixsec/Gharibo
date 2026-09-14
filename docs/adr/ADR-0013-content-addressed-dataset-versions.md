# ADR-0013: Content-addressed immutable dataset versions with deterministic hashed splits

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | 1.1.0 |

## Context

M1's `datasetsRepository.create()` cuts a version with a naive monotonic counter (`v1`, `v2`, …)
and stores membership as frozen foreign keys into `data_factory_records`. But the underlying
`data_factory_records` rows remain **editable**. The consequence is that a dataset version's
*label* is frozen while its *content* is not: editing a record silently changes what a version
"means", and two runs that claim to use `v1` can train on different data. There is also no split
logic and no hashing, so provenance cannot be recomputed.

M2 needs a version whose identity **is** its content, and splits that are deterministic and hashed,
so that a Training Package can pin a dataset by hash and any operator can re-derive the exact same
training/eval/test partitions. The project rule — never assert something that cannot be recomputed —
makes content-addressing a requirement, not a nicety.

Options: (a) keep the counter and add a hash column, (b) store a full copy of every record per
version, or (c) make the version **content-addressed** — its id/hash derived from a canonical
serialization of its members — and materialise deterministic splits whose hashes travel in the
package.

## Decision

We will make dataset versions **content-addressed and immutable**, with **deterministic, hashed,
seeded splits**.

- **Canonical record serialization** (`canonicalRecord`): a fixed field order, trimmed and
  NFC-normalised strings, `null` for absent fields, lexicographically sorted `tags`, excluding
  volatile fields (`created_at`, `updated_at`, `quality_score`, DB id). The canonical line is the
  compact JSON of that object.
- **Dataset hash** = `sha256( sort(recordLineHash_i).join("\n") )`, where
  `recordLineHash_i = sha256(lineBytes_i)`. Sorting makes the hash **order-independent**: membership
  is content-addressed, so DB ids and insertion order cannot change it.
- **Split hash** for each split `S` = `sha256( sort(recordLineHash_i for r in S).join("\n") )`.
- **Deterministic seeded split**: for each record compute
  `k(r) = sha256( str(seed) + ":" + recordLineHash(r) )`, sort records ascending by `k(r)` (ties by
  `recordLineHash`), then assign the first `floor(N*train)` to train, the next `floor(N*val)` to
  validation, the remainder to test. Fully reproducible from `(records, seed, ratios)`.
- **Non-empty splits are mandatory**: if any split falls below
  `split_policy.minimum_records_per_split`, the cut **fails loudly** and no version is created.
- **Immutable**: a version is immutable once cut; re-cutting identical inputs reproduces identical
  hashes. Changes produce a new version (`parent_dataset_id` records the lineage).
- The version id (`dataset_version_id`) equals the dataset hash. Only records in `TRAINING_READY`
  may enter a version, enforced **server-side** (`dataFactoryRepository.transition`).

## Consequences

### Positive
- A dataset version's identity equals its content, so a Training Package can pin the dataset by
  hash and the pin is meaningful — editing records can never change what a version denotes.
- Determinism makes splits reproducible across machines and sessions, and re-verifiable in the
  notebook before training (mismatch → hard failure).
- Provenance becomes recomputable: the dataset hash, each split hash, and the artifact rollup are
  all derivable from bytes, satisfying the PRD's "nothing asserted that cannot be recomputed".
- Closes the M1 gap where pipeline states and membership were enforced only in the UI.

### Negative / Trade-offs
- Content-addressing requires canonical serialization to be exact; any change to the canonical form
  or the split algorithm is a **breaking** change to every stored hash and needs a schema-version
  bump.
- Excluding volatile fields from the hash means two records differing only in `quality_score` or
  timestamps hash identically — deliberate (they do not affect training content), but it must be
  documented so no one expects the hash to cover metadata.
- Deterministic splits mean a record added later can shift which split existing records fall into;
  this is inherent to a seeded global partition and is why version immutability matters.
- Storing per-record line hashes in `dataset_splits` costs a little space, accepted for verifiability.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Keep the monotonic counter and add a hash column | The label stays decoupled from content; the same `v1` could still denote different data after an edit |
| Snapshot a full copy of every record per version | Duplicates storage and still needs a canonical hash to be verifiable; the hash alone provides identity |
| Order-dependent hash (hash the records in stored order) | Makes the hash depend on DB id/insertion order; identical content could yield different hashes, defeating reproducibility |
| Random (unseeded) train/val/test split | Not reproducible; a re-cut or a re-verification could not match, breaking the provenance contract |
| Allow empty splits for tiny datasets | Produces silently meaningless training/eval; failing loudly is consistent with the project's no-silent-discard philosophy |

## References

- `docs/PRD_MILESTONE_2.md` — P0-14, P0-15, P0-16, §7 (Gold Pipeline), §8 (provenance), R3
- `docs/ARCHITECTURE_MILESTONE_2.md` §5 (hashing), §6 (data model), §7 (repositories)
- `docs/DATA_FACTORY.md` (ADR-0007 states), `docs/ARCHITECTURE.md` §3.4 (`datasets`)
- `apps/web/lib/training/{hash,canonical,split}.ts`, `apps/web/lib/db/repositories/{datasets,dataset-splits}.ts`
