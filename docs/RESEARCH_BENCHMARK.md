# GHARIBO Research Benchmark — Metric Definitions

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Domain spec |
| **Status** | Draft |
| **Version** | 1.1.0 |
| **Last Updated** | 2026-09-14 |

> **Scope.** This document *defines* the machine-verifiable benchmark metrics for the Research Gym
> held-out TEST split. It defines **no scores**. Every score in this system is `null` until a real
> execution produces it (§9). It is a companion to `docs/EVALUATION.md` (categories + promotion
> gating), `docs/RESEARCH_GYM.md` (task workflow + entity schema), `docs/DATA_FACTORY.md` (record
> schema), and `docs/ARCHITECTURE_MILESTONE_2.md` §5 (hashing + deterministic split algorithm).
>
> Change control: `docs/DOCUMENTATION_GOVERNANCE.md` §5.
>
> **v1.1.0 — Milestone 3A autonomous work session (2026-09-13).** The M3A session constructed the
> dataset that this benchmark consumes: `GHARIBO-Research-Gold-v0.1` (800 examples, 640/80/80
> split, seed=3407). The TEST split contains 80 items. The verify-m3a gate runner independently
> verifies (Gate 7) that split hashes match `dataset-card.json`, that splits are pairwise disjoint,
> and that hashes can be reproduced from raw file line bytes. All 13 metrics (M1–M13) remain
> NOT_RUN — no fabricated scores. The `record_count` and `item_count` fields in the manifest
> (§3.3) are now known to be 80 (the TEST split size), but are filled by the harness at execution
> time, never estimated.

---

## 1. Purpose & non-goals

The benchmark answers one question: **did `GHARIBO-exp-001` (CANDIDATE) beat its base model (BASE)
on work it has never seen?**

| In scope | Out of scope |
|---|---|
| Deterministic metric definitions over the TEST split | Producing any score (execution is a separate milestone) |
| Contamination rules that keep TEST held out | Model training, tuning, or inference |
| The machine-readable report schema | Promotion decisions (see `docs/MODEL_REGISTRY.md`) |
| Pass/fail semantics per metric | Choosing the base model |

**Design constraint.** Every gated metric in §5 is computed by pure string/number comparison with no
network, no wall-clock, no randomness, and no model-as-judge. A run that uses an LLM judge records
those numbers **outside** the gate (§7.4). Two runs over the same inputs must produce byte-identical
scores.

---

## 2. Definitions and notation

| Symbol | Meaning |
|---|---|
| `N` | Number of benchmark items in the TEST split (`N = \|I\|`) |
| `I` | The benchmark item set, derived 1:1 from TEST records (§3) |
| `G_i` | The **gold annotation** for item `i` (frozen, derived from the record; §3.2) |
| `P_i` | The **parsed model output** for item `i` (§4.2) |
| `claims_i` | Atomic assertions emitted by the model for item `i` (§4.3) |
| `gold_claims_i` | Atomic assertions in `G_i` |
| `norm(s)` | `NFC(trim(collapse_ws(s))).casefold()` — the single normalization used everywhere |
| `canonical_json(o)` | Sorted keys, no insignificant whitespace, UTF-8 (M2 §5) |
| `sha256(x)` | SHA-256 over UTF-8 bytes, lowercase hex (M2 §5) |

**`norm` is normative.** `collapse_ws` replaces every run of Unicode whitespace with a single
`U+0020`. `casefold` is Unicode full case folding, not ASCII `lower()`. All metric comparisons use
`norm`; no metric defines its own normalization.

**Set comparisons are multiset intersections.** When a metric matches predicted items against gold
items, it computes a *key* for each side, sorts both key lists, and takes the multiset intersection
size. This is order-independent and therefore deterministic.

---

## 3. Deriving the benchmark from TEST without contaminating it

### 3.1 Provenance

The benchmark does not re-cut the data. It consumes the split that M2 already produced with the
frozen algorithm (`docs/ARCHITECTURE_MILESTONE_2.md` §5.2):

```
k(r) = sha256(utf8(str(seed) + ":" + recordLineHash(r)))
sort R ascending by k(r); ties broken by recordLineHash(r) lexicographically
first nTrain -> train, next nVal -> validation, remainder -> test
```

The benchmark pins, and a run is valid only if it reproduces, these three values:

| Pinned value | Source |
|---|---|
| `dataset_hash` | `DatasetRef.datasetHash` (order-independent, M2 §5.1) |
| `test_split_hash` | `DatasetRef.splitHashes.test` |
| `benchmark_manifest_hash` | `sha256(canonical_json(item set))` — §3.3 |

If a recomputed hash differs from the pinned value, the run is `INVALID` and no score is recorded.

### 3.2 Item construction (read-only)

Each TEST record maps to exactly one benchmark item. Construction is a pure projection; it never
writes back to the dataset, the Data Factory, or the repository layer.

| Item field | Derivation |
|---|---|
| `item_id` | `sha256(recordLineHash)` — content address, stable across machines |
| `source_record_id` | The record's DB id (lineage only; never used in scoring) |
| `prompt` | Rendered from `input` + `context` via the frozen Harmony mapping (M2 §4.1) |
| `gold` | The gold annotation (§3.2.1) |
| `sources` | `[{ source_id, url, text }]` — the evidence available to the model |
| `instructions` | The item's declared constraint list (§5.8) |

#### 3.2.1 Gold annotation

| Field | Type | Used by |
|---|---|---|
| `entities[]` | `{ entity_id, type, name, attributes, evidence_ids[] }` | extraction, classification, fidelity, coverage |
| `relations[]` | `{ subject_id, predicate, object_id, evidence_ids[] }` | relation accuracy |
| `taxonomy_path[]` | `string[]` | classification accuracy |
| `duplicate_pairs[]` | `[entity_id, entity_id][]` | dedup F1 |
| `instructions[]` | `{ constraint_id, kind, params }` | instruction following |

`type` and `predicate` MUST be members of the frozen Research Gym entity vocabulary
(`docs/RESEARCH_GYM.md` §"Entity Schema"). A gold value outside the vocabulary is a benchmark
authoring error and fails the build.

#### 3.2.2 Source text is the only admissible evidence

`sources[].text` is captured at item-freeze time and stored with the item. Evidence validation
(§5.4) reads only this text. A citation to a URL that is not in `sources[]` is invalid, even if the
URL is real — the benchmark scores *fidelity to provided evidence*, not web truth.

### 3.3 Benchmark manifest

```jsonc
{
  "benchmark_schema_version": "1.0.0",
  "harness_version": "1.0.0",
  "dataset_hash": "<sha256 hex>",
  "test_split_hash": "<sha256 hex>",
  "record_count": 0,                  // = N; filled by the harness, never estimated
  "item_count": 0,                    // = N
  "benchmark_manifest_hash": "<sha256 of canonical_json(items)>",
  "developer_template_id": "<frozen before the run>",
  "reasoning_effort": "low | medium | high",
  "metric_definitions_hash": "<sha256 of the §5 definitions block>",
  "created_at": "<ISO 8601 UTC>"
}
```

`metric_definitions_hash` is the guard against silent metric drift: if §5 changes, the hash changes,
and reports produced under the old hash are not comparable.

### 3.4 Contamination rules (binding)

TEST is **read-only** and must never be used for any of the following. This list is exhaustive for
the M3A scope and is enforced by the leakage audit (§3.5).

1. **Training.** No TEST record may appear in `train.jsonl` or `validation.jsonl`, or in any
   fine-tuning, continued-pretraining, or DPO/ORPO dataset.
2. **Hyperparameter search.** No TEST metric may select a learning rate, LoRA rank/alpha, batch
   size, sequence length, epoch/step count, warmup, weight decay, or scheduler.
3. **Checkpoint selection.** No TEST metric may choose which checkpoint, adapter, or epoch is kept.
4. **Prompt / template selection.** `developer_template_id` and `reasoning_effort` are frozen
   **before** the first benchmark run and recorded in the manifest. Changing them creates a new
   benchmark manifest and invalidates comparability with prior reports.
5. **Few-shot / exemplar selection.** No TEST item, or fragment of one, may be inserted into a
   prompt, a system/developer message, or a retrieval index used at inference.
6. **Threshold tuning.** Gate thresholds (§6) are policy, fixed in `config.thresholds` and recorded
   in the report; they are not fitted to TEST outcomes.
7. **Deduplication / filtering.** Any near-duplicate filtering, quality filtering, or dedup policy
   that shapes the training set is derived from TRAIN + VALIDATION only.

Selection and early-stopping decisions use **VALIDATION**. TEST is touched exactly once per report.

### 3.5 Leakage audit (mandatory, recorded)

Before any score is computed, the harness runs and records this audit. A run whose audit is not
`PASS` is `INVALID`.

| Check | Rule | Result |
|---|---|---|
| Split disjointness | `splitHashes.test` is disjoint from `splitHashes.train` and `splitHashes.validation`; no TEST `recordLineHash` occurs in either | PASS/FAIL |
| Training-set containment | No TEST `recordLineHash` occurs in any training artifact's canonical lines | PASS/FAIL |
| Prompt containment | No TEST item text appears in the frozen developer template or any few-shot block | PASS/FAIL |
| Hash reproduction | Recomputed `dataset_hash` / `test_split_hash` equal the pinned manifest values | PASS/FAIL |

If any check fails, the benchmark is **`INVALID`**: the report is still written (with the audit
detail), but every score is `null` and `status = "INVALID"`. A fresh holdout must be cut before a
valid report can exist.

---

## 4. Output parsing

### 4.1 What is scored

Only the Harmony **`final`** channel is scored. The `analysis` channel is never parsed, never
scored, and never written to a report (M2 §4.2; `HARMONY_HIDDEN_CHANNELS`).

### 4.2 Parse pipeline

```
raw            = model output for item i (final channel only)
stripped       = trim(raw)
parsed_i       = JSON.parse(stripped)                    # must be one JSON object, no trailing text
schema_ok_i    = validate(parsed_i, ENTITY_SCHEMA)       # §5.1
P_i            = parsed_i if schema_ok_i else EMPTY
```

A parse error or schema failure yields `P_i = EMPTY`. Downstream metrics that need `P_i` count the
item as a total miss; they never throw and never skip the item.

### 4.3 Claim decomposition

A **claim** is one atomic assertion. Decomposition is deterministic and defined by the output shape:

| Output construct | Claims produced |
|---|---|
| `entities[].attributes` | One claim per attribute: `(entity_ref, attribute_key, attribute_value)` |
| `entities[]` existence | One claim per entity: `(entity_ref, "type", type)` |
| `relations[]` | One claim per relation: `(subject_ref, predicate, object_ref)` |

`claims_i` is the count after decomposition. An item with zero claims has `claims_i = 0`; this is
recorded by `empty_output_rate` (§5.5) rather than silently ignored.

---

## 5. Metric definitions

Every metric below is reported with its **numerator and denominator**, so any reader can recompute
it. `mean` means the arithmetic mean over items for which the metric is defined; items where the
denominator is zero are excluded and counted separately.

### 5.0 Metric set at a glance

| # | Canonical id | Name | Category | Direction | Gated |
|---|---|---|---|---|---|
| M1 | `schema_validity` | Schema validity | Structured Output | higher | yes |
| M2 | `extraction_accuracy` | Extraction accuracy (entity micro-F1) | Data Extraction | higher | yes |
| M3 | `classification_accuracy` | Classification / taxonomy accuracy | Classification | higher | yes |
| M4 | `source_fidelity` | Evidence / source fidelity | Source Fidelity | higher | yes |
| M5 | `source_coverage` | Source coverage | Source Fidelity | higher | yes |
| M6 | `unsupported_claim_rate` | Unsupported claim rate | Hallucination Resistance | lower | yes |
| M7 | `empty_output_rate` | Empty output rate | Structured Output | lower | yes |
| M8 | `duplicate_rate` | Duplicate rate | Deduplication | lower | yes |
| M9 | `dedup_f1` | Duplicate detection F1 | Deduplication | higher | yes |
| M10 | `relation_f1` | Relation accuracy (micro-F1) | Research | higher | yes |
| M11 | `instruction_following` | Instruction following | Instruction Following | higher | yes |
| M12 | `structured_output_reliability` | Structured output reliability | Structured Output | higher | yes |
| M13 | `record_precision` | Record precision | Research | higher | yes |

`taxonomy_accuracy` (the name used in `ResearchMetric`, `packages/shared/src/types/evaluation.ts`)
is an alias of `classification_accuracy` (M3) and denotes the same computation.

### M1 — `schema_validity`

| | |
|---|---|
| **Measures** | Fraction of items whose output is a single JSON object conforming to the entity schema |
| **Range** | `[0, 1]` |
| **Direction** | Higher is better |

```
schema_validity = ( Σ_i schema_ok_i ) / N
```

`schema_ok_i` is 1 iff `trim(raw_i)` parses as exactly one JSON object **and** passes the schema
validator: every required field present and non-null, every value of the declared type, every
`type`/`predicate`/`taxonomy` segment inside the frozen vocabulary.

**Determinism.** Pure parser + validator. The validator version is pinned in `harness_version`.

### M2 — `extraction_accuracy`

| | |
|---|---|
| **Measures** | Whether the model extracted the right entities |
| **Range** | `[0, 1]` (reports precision, recall, F1) |
| **Direction** | Higher is better |

Entity match key:

```
key(e) = ( norm(e.type), norm(e.name) )
matched = | multiset( key(e) for e in P_i.entities )
          ∩ multiset( key(g) for g in G_i.entities ) |
precision_i = matched / |P_i.entities|        (0 if |P_i.entities| = 0)
recall_i    = matched / |G_i.entities|        (1 if |G_i.entities| = 0 and |P_i.entities| = 0, else 0)
f1_i        = 2·P·R / (P + R)                 (0 if P + R = 0)
```

Micro-F1 is computed from the summed counts (`Σmatched`, `Σ|P|`, `Σ|G|`), not by averaging
per-item F1. Both are reported; the gate uses micro-F1.

**Determinism.** Multiset intersection of sorted key lists — independent of emission order.

### M3 — `classification_accuracy`

| | |
|---|---|
| **Measures** | Correct placement in the taxonomy hierarchy |
| **Range** | `[0, 1]` |
| **Direction** | Higher is better |

```
norm_path(p)   = [ norm(segment) for segment in p ]
exact_i        = 1 if norm_path(P_i.taxonomy_path) == norm_path(G_i.taxonomy_path) else 0
prefix_i       = 1 if norm_path(G_i.taxonomy_path) is a prefix of norm_path(P_i.taxonomy_path) else 0

classification_accuracy = ( Σ_i exact_i ) / N          # gated
taxonomy_prefix_accuracy = ( Σ_i prefix_i ) / N        # reported, not gated
```

Exact match is the gate: partial credit is a separate, clearly-labelled secondary number. A missing
or non-list `taxonomy_path` counts as `exact_i = 0`.

### M4 — `source_fidelity`

| | |
|---|---|
| **Measures** | Whether every citation points at evidence actually present in `sources[]` |
| **Range** | `[0, 1]` |
| **Direction** | Higher is better |

```
citation_valid(c, i) =
      c.source_id ∈ { s.source_id for s in i.sources }
  AND ( c.quote is absent
        OR norm(c.quote) is a substring of norm(text_of(c.source_id)) )

source_fidelity = ( Σ_i valid_citations_i ) / ( Σ_i total_citations_i )
```

Items with `total_citations_i = 0` are excluded from the denominator and counted in
`items_without_citations`. A citation with an unknown `source_id` is invalid; it is not an error
that aborts the run.

**Determinism.** Set membership + substring containment on `norm`-ed strings.

### M5 — `source_coverage`

| | |
|---|---|
| **Measures** | Whether gold assertions are backed by at least one valid citation in the output |
| **Range** | `[0, 1]` |
| **Direction** | Higher is better |

```
covered_i = | { g ∈ G_i.entities : ∃ output claim asserting g with ≥1 valid citation } |
source_coverage = ( Σ_i covered_i ) / ( Σ_i |G_i.entities| )
```

This is the recall counterpart of M4 (which is citation precision).

### M6 — `unsupported_claim_rate`

| | |
|---|---|
| **Measures** | Fraction of emitted claims carrying no valid supporting evidence |
| **Range** | `[0, 1]` |
| **Direction** | Lower is better |

```
supported_i = | { c ∈ claims_i : c has ≥1 valid citation per citation_valid } |
unsupported_i = claims_i − supported_i
unsupported_claim_rate = ( Σ_i unsupported_i ) / ( Σ_i claims_i )
```

**Anti-gaming.** A model that emits nothing has `claims_i = 0` and is excluded here — which is why
this metric is **never gated alone**. Its gate is a conjunction with `empty_output_rate == 0` and
`extraction_accuracy` recall ≥ its threshold (§6). Emitting nothing cannot pass.

### M7 — `empty_output_rate`

| | |
|---|---|
| **Measures** | Fraction of items that produced zero parsed claims |
| **Range** | `[0, 1]` |
| **Direction** | Lower is better |

```
empty_output_rate = | { i : claims_i = 0 } | / N
```

### M8 — `duplicate_rate`

| | |
|---|---|
| **Measures** | Fraction of emitted entities that repeat an entity already emitted for the same item |
| **Range** | `[0, 1]` |
| **Direction** | Lower is better |

```
exact_key(e)  = ( norm(e.type), norm(e.name) )
near_key(e)   = ( norm(e.type), token_set_jaccard_group(e) )

token_set(name) = set of norm(name).split(" ") minus stopword set S_frozen
jaccard(a, b)   = |a ∩ b| / |a ∪ b|
near(a, b)      = same type AND jaccard(token_set(a.name), token_set(b.name)) ≥ τ_near

group = connected components of the "duplicate" relation (exact OR near) over P_i.entities
representative(group) = lexicographically smallest exact_key in the group
duplicate_i = |P_i.entities| − |groups_i|
duplicate_rate = ( Σ_i duplicate_i ) / ( Σ_i |P_i.entities| )
```

`τ_near` (default `0.90`) and the frozen stopword set `S_frozen` are recorded in
`config.dedup` and hashed into `metric_definitions_hash`. Both are fixed **before** the run.

**Determinism.** Connected components are order-independent; the representative rule is total and
lexicographic, so group membership does not depend on iteration order.

### M9 — `dedup_f1`

| | |
|---|---|
| **Measures** | Whether the model correctly identifies known duplicate pairs |
| **Range** | `[0, 1]` (reports precision, recall, F1) |
| **Direction** | Higher is better |

```
map(entity) = the gold entity_id it matched (M2 match key), else UNMAPPED
predicted_pairs_i = unordered { (map(a), map(b)) : a,b ∈ P_i.entities, duplicate(a,b), both mapped }
gold_pairs_i      = unordered set from G_i.duplicate_pairs

precision_i = |predicted_pairs_i ∩ gold_pairs_i| / |predicted_pairs_i|   (0 if empty)
recall_i    = |predicted_pairs_i ∩ gold_pairs_i| / |gold_pairs_i|        (1 if both empty)
dedup_f1    = micro-F1 over Σ counts
```

### M10 — `relation_f1`

| | |
|---|---|
| **Measures** | Correctness of relations between entities |
| **Range** | `[0, 1]` (reports precision, recall, F1) |
| **Direction** | Higher is better |

Relation match key — endpoints are resolved through the M2 entity match key, so a relation is only
credited if both endpoints were extracted correctly:

```
key(r) = ( norm(r.subject.type), norm(r.subject.name),
           norm(r.predicate),
           norm(r.object.type),    norm(r.object.name) )

matched = | multiset( key(r) for r in P_i.relations )
          ∩ multiset( key(r) for r in G_i.relations ) |
```

Micro-F1 over summed counts. Relations whose endpoints do not resolve to gold entities are
`UNMAPPED` and count against precision.

### M11 — `instruction_following`

| | |
|---|---|
| **Measures** | Whether every declared constraint for the item was satisfied |
| **Range** | `[0, 1]` |
| **Direction** | Higher is better |

```
item_pass_i = 1 iff every c ∈ G_i.instructions evaluates TRUE
instruction_following = ( Σ_i item_pass_i ) / N
```

Constraint predicates (each deterministic; `params` supplied per item):

| `kind` | Predicate |
|---|---|
| `max_entities` | `\|P_i.entities\| ≤ params.max` |
| `required_fields` | every field in `params.fields` present and non-null on every emitted entity |
| `allowed_types` | every emitted `type` ∈ `params.types` |
| `max_output_chars` | `len(stripped_i) ≤ params.max` |
| `no_analysis_in_final` | the final channel contains no `analysis`-channel marker or `\|channel\|>analysis` token |
| `cite_all_claims` | `supported_i == claims_i` |
| `language` | the detected language of `stripped_i` equals `params.language` (detector pinned in `harness_version`) |

Per-constraint pass rates are reported alongside the aggregate so a failure is attributable.

### M12 — `structured_output_reliability`

| | |
|---|---|
| **Measures** | How reliably the model produces complete, correctly-typed, stable structured output |
| **Range** | `[0, 1]` per sub-metric |
| **Direction** | Higher is better |

```
json_parse_rate    = ( Σ_i parse_ok_i ) / N
field_completeness = ( Σ_i present_required_fields_i ) / ( Σ_i required_fields_i )
type_correctness   = ( Σ_i correct_type_fields_i )  / ( Σ_i present_fields_i )

structured_output_reliability = mean( json_parse_rate, field_completeness, type_correctness )
```

**Stability** is a fourth sub-metric requiring `R ≥ 2` repeats of the same item with identical
decoding config:

```
stability = | { i : canonical_json(P_i^(1)) == canonical_json(P_i^(k)) for all k ≤ R } | / N
```

With `R = 1`, `stability` is `NOT_RUN` (§9) and is not part of the composite. With `R ≥ 2` it is
reported and gated separately at `1.0`. `R`, the decoding config, and the seed are recorded in the
report; two runs are comparable only at identical `R` and decoding config.

### M13 — `record_precision`

| | |
|---|---|
| **Measures** | Fraction of emitted records that are usable without human repair |
| **Range** | `[0, 1]` |
| **Direction** | Higher is better |

A record is **valid** iff it is schema-valid (M1) **and** non-duplicate (M8) **and** every one of
its claims is supported (M6).

```
valid_records_i = | { e ∈ P_i.entities : schema_ok(e) ∧ ¬duplicate(e) ∧ all_claims_supported(e) } |
record_precision = ( Σ_i valid_records_i ) / ( Σ_i |P_i.entities| )
```

---

## 6. Pass/fail semantics

Thresholds are **policy**, not measurements. They live in the report's `config.thresholds`, are
fixed before the run, and are hashed into `metric_definitions_hash`. They are never fitted to TEST
outcomes (§3.4 rule 6).

| Metric | Gate | Default threshold | Rationale |
|---|---|---|---|
| `schema_validity` | `≥` | 0.98 | structured output is the product |
| `extraction_accuracy` (micro-F1) | `≥` | 0.85 | core Research Gym capability |
| `extraction_accuracy` (recall) | `≥` | 0.80 | anti-gaming companion to M6 |
| `classification_accuracy` | `≥` | 0.85 | taxonomy correctness |
| `source_fidelity` | `≥` | 0.95 | fabricated citations are the worst failure |
| `source_coverage` | `≥` | 0.80 | evidence must actually be attached |
| `unsupported_claim_rate` | `≤` | 0.02 | ADR-0005 / `docs/EVALUATION.md` strict hallucination posture |
| `empty_output_rate` | `==` | 0.00 | an empty answer is never a pass |
| `duplicate_rate` | `≤` | 0.03 | dedup is a Research Gym goal |
| `dedup_f1` | `≥` | 0.80 | duplicate detection must work |
| `relation_f1` | `≥` | 0.75 | relations are harder; threshold is lower by design |
| `instruction_following` | `≥` | 0.90 | adherence is non-negotiable |
| `structured_output_reliability` | `≥` | 0.95 | completeness + types |
| `stability` (when `R ≥ 2`) | `==` | 1.00 | determinism is a requirement, not a score |
| `record_precision` | `≥` | 0.85 | records must be usable |

**Aggregate.** `benchmark_score` is the declared-weight mean of the gated metrics:

```
benchmark_score = Σ_m w_m · metric_m        ,  Σ_m w_m = 1.0
```

The weight vector `w` is recorded in `config.weights`. Category rollups (per
`BenchmarkCategory`) use the same weights restricted to the category's metrics.

**Regression gate** (from `docs/EVALUATION.md` §"Promotion Gating", applied only when both BASE and
CANDIDATE are `RUN`):

```
overall_regression     = (base.benchmark_score − candidate.benchmark_score) / base.benchmark_score
per_category_regression = (base.category_score − candidate.category_score) / base.category_score

BLOCK promotion if  overall_regression     > 0.05
                 OR per_category_regression > 0.10
                 OR candidate.unsupported_claim_rate > base.unsupported_claim_rate   # 0% regression
```

---

## 7. Determinism requirements

### 7.1 Fixed decoding

| Parameter | Requirement |
|---|---|
| `temperature` | `0.0` |
| `do_sample` | `false` (greedy) |
| `top_p`, `top_k` | unset (`1.0`, `0`) |
| `max_new_tokens` | fixed integer, recorded |
| `seed` | recorded integer |
| `repeats R` | recorded integer ≥ 1 |

If any sampling is used, the full parameter set plus seed is recorded, and `R ≥ 3` is required so
`stability` is meaningful. Two runs are comparable only at identical decoding config.

### 7.2 No hidden nondeterminism

The scoring code must not use: network calls, the system clock, `random` without a fixed seed,
filesystem iteration order, locale-dependent case operations, or hash-order iteration. All ordering
is explicit (`sorted` on a defined key).

### 7.3 Reproducibility assertion

```
scores_hash = sha256(canonical_json(report.scores))
```

Two runs agree iff `benchmark_manifest_hash`, `harness_version`, `metric_definitions_hash`,
`config` (thresholds + weights + dedup), and `decoding` are equal, and the recomputed `scores_hash`
is equal. `scores_hash` is written into every report.

### 7.4 LLM-as-judge (optional, never gated)

A judge-based quality score may be reported for human context only. It MUST be:

- recorded under `report.judge`, never under `report.scores`;
- accompanied by `judge_model`, `judge_model_revision`, `judge_seed`, and `judge_prompt_hash`;
- excluded from `benchmark_score`, from every threshold, and from the regression gate.

A judge score is never `NOT_RUN`-suppressed but is never authoritative.

---

## 8. Report schema (machine-readable)

One JSON document per benchmark run. `base` and `candidate` are scored by the same harness, same
manifest, same config, same decoding.

```jsonc
{
  "report_schema_version": "1.0.0",
  "harness_version": "1.0.0",
  "experiment_id": "GHARIBO-exp-001",
  "git_commit_sha": "<40-hex or \"unknown\">",
  "package_id": "<sha256 or null>",
  "benchmark_manifest": { /* §3.3 */ },

  "leakage_audit": {
    "status": "PASS | FAIL",
    "checks": [ { "name": "split_disjointness", "result": "PASS | FAIL", "detail": "<string>" } ]
  },

  "config": {
    "thresholds": { "schema_validity": 0.98, "unsupported_claim_rate": 0.02, "...": 0.0 },
    "weights":    { "schema_validity": 0.10, "...": 0.0 },
    "dedup":      { "tau_near": 0.90, "stopwords_hash": "<sha256>" }
  },

  "decoding": {
    "temperature": 0.0, "do_sample": false, "max_new_tokens": 0,
    "seed": 0, "repeats": 1
  },

  "base": {
    "model_id": "openai/gpt-oss-20b",
    "model_revision": "<pinned revision>",
    "status": "NOT_RUN",
    "executed": false,
    "run_id": null,
    "raw_predictions_hash": null,
    "scores": {
      "schema_validity": null,
      "extraction_accuracy": null,
      "classification_accuracy": null,
      "source_fidelity": null,
      "source_coverage": null,
      "unsupported_claim_rate": null,
      "empty_output_rate": null,
      "duplicate_rate": null,
      "dedup_f1": null,
      "relation_f1": null,
      "instruction_following": null,
      "structured_output_reliability": null,
      "stability": null,
      "record_precision": null,
      "benchmark_score": null
    },
    "counts": {
      "items": 0, "claims": 0, "valid_citations": 0, "total_citations": 0,
      "empty_items": 0, "matched_entities": 0, "predicted_entities": 0, "gold_entities": 0
    },
    "gates": null
  },

  "candidate": { /* identical shape; model_id = "GHARIBO-exp-001" */ },

  "delta": null,
  "scores_hash": null,
  "created_at": "<ISO 8601 UTC>"
}
```

**Field semantics.**

| Field | Rule |
|---|---|
| `status` | `NOT_RUN` \| `RUN` \| `INVALID` |
| `executed` | `true` iff a real execution produced the scores |
| `scores.*` | `null` when `executed = false`; a number in `[0,1]` when `executed = true` |
| `counts.*` | Raw integers backing every ratio; always present |
| `gates` | `null` until `executed = true`; then per-metric `PASS`/`FAIL` + the aggregate verdict |
| `delta` | `null` unless **both** `base.executed` and `candidate.executed` are `true` |
| `scores_hash` | `null` until `executed = true` |

---

## 9. The `NOT_RUN` rule (binding)

**No score may exist before a real execution produces it.**

1. A report that has not executed a model MUST have `status = "NOT_RUN"`, `executed = false`, every
   `scores.* = null`, and `delta = null`.
2. `0`, `"N/A"`, `"-"`, `"TBD"`, a placeholder, or an estimated value are **all forbidden** in any
   score field. The only admissible non-number is `null`.
3. `NOT_RUN` is the declared state in the Training Package itself: `evaluation_config.executed` is
   the literal `false` and `evaluation_config.status` is the literal `"NOT_RUN"`
   (`packages/shared/src/types/training-package.ts`; validation rule 13 in
   `docs/ARCHITECTURE_MILESTONE_2.md` §3.5 rejects any other value).
4. `base` and `candidate` are independent: one may be `RUN` while the other is `NOT_RUN`. The
   `delta` block and the regression gate require **both**.
5. A report with `leakage_audit.status = "FAIL"` is `INVALID`: scores are `null` even if inference
   ran, and the raw predictions are quarantined (hashed and kept, not scored).
6. Reporting a number that no execution produced is a violation of ADR-0005 and of
   `docs/DOCUMENTATION_GOVERNANCE.md` §1 — the same class of failure as a fabricated loss curve.

**Validator.** `validateBenchmarkReport(report)` returns `{ level, field, message }[]` and MUST
reject: any non-null score when `executed = false`; `status = "RUN"` with a null score or a null
`scores_hash`; `delta` non-null when either side is not executed; a `benchmark_manifest_hash` or
`metric_definitions_hash` that does not match the recomputed value; and any missing `counts` field.

---

## 10. Traceability

| This document | Traces to |
|---|---|
| §3 split provenance + contamination | `docs/ARCHITECTURE_MILESTONE_2.md` §5.1–5.2; ADR-0013 |
| §5 metric ids | `packages/shared/src/types/evaluation.ts` (`ResearchMetric`, `BenchmarkCategory`) |
| §5.6 unsupported claims | `docs/RESEARCH_GYM.md` Hard Rule 1; `docs/DATA_FACTORY.md` validator |
| §6 regression gate | `docs/EVALUATION.md` §"Promotion Gating" |
| §9 `NOT_RUN` rule | ADR-0005; `docs/ARCHITECTURE_MILESTONE_2.md` §3.5 rule 13 |
| §7.1 decoding | `docs/TRAINING_STRATEGY.md` (dtype/seed policy) |

*End of `docs/RESEARCH_BENCHMARK.md` — GHARIBO AI LAB.*
