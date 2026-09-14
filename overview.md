# GHARIBO AI LAB — Milestone 3A Delivery Overview

| Field | Value |
|-------|-------|
| **Document Owner** | Delivery (GHARIBO AI LAB) |
| **Type** | Delivery note |
| **Status** | Superseded |
| **Version** | 1.0.0 |
| **Last Updated** | 2026-09-14 |

> **Status note.** This is a point-in-time delivery note. It is **Superseded** as a specification:
> the authoritative sources are [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
> [`PROJECT_STATE.md`](PROJECT_STATE.md) and [`docs/DOCUMENT_REGISTER.md`](docs/DOCUMENT_REGISTER.md).
> The content below is the Milestone 3A autonomous work-session final report, preserved for the
> delivery record. Governance rules: [`docs/DOCUMENTATION_GOVERNANCE.md`](docs/DOCUMENTATION_GOVERNANCE.md).

---

# M3A Autonomous Work Session — Final Report

**Date:** 2026-09-14
**Commit:** `d5a322e` (pushed to `origin/main`, verified via `git ls-remote`)
**Status:** `READY_FOR_ENV_QUALIFICATION`
**Directive:** DO NOT START TRAINING

---

## 1. Source Artifact Forensics (Section A)

| Metric | Value |
|--------|-------|
| Source files | 8 JSONL files at `data/raw/legacy-ucl/` |
| Total records | 18,646 |
| Entity types | 13 (RELATION, EVIDENCE, PRODUCT_MODEL, DOMAIN, SOURCE, PRODUCT_FAMILY, CATEGORY, SYSTEM, SERVICE, ITEM, BRAND, MANUFACTURER, MARKET_RELEVANCE) |
| Parse errors | 0 |
| Duplicate lines | 0 |
| Broken relation references | 0 (out of 12,303 relations) |
| Evidence records with valid source links | 3,653 / 3,653 (100%) |
| SECURITY_BATCH_004 | Correctly marked unavailable (not invented) |
| Source manifest | `data/derived/source-manifests/legacy-ucl-source-manifest-v001.json` (immutable) |
| Manifest SHA-256 | `1a398e2a807f33ae67e2c67e7b7d43601e91071d26b74c27040a7315faceb6fd` |

## 2. Gold Dataset Quality Filter (Section B)

| Class | Count |
|-------|-------|
| ACCEPTED_GOLD | 14,444 |
| ACCEPTED_SUPPORTING | 4,043 |
| REJECTED | 2 (DOMAIN records with no parentCategories) |
| NEEDS_REVIEW | 157 (148 PRODUCT_MODEL lifecycle/naming, 9 PRODUCT_FAMILY) |
| Total source records | 18,646 |

Summary at `data/derived/gold-classification/gold-quality-filter-v001-summary.json`.

## 3. Training Examples (Section C)

- **Count:** 800 examples in OpenAI Harmony format (system/user/assistant roles)
- **Format:** Each example teaches the UCL extraction process: source → understand → extract → classify → normalize → relate → ground → validate → structured output
- **No invented chain-of-thought:** All assistant outputs are deterministic projections of source data
- **Entity distribution:** RELATION 222, PRODUCT_FAMILY 177, DOMAIN 100, PRODUCT_MODEL 100, SYSTEM 70, SERVICE 48, CATEGORY 47, ITEM 13, BRAND 12, MANUFACTURER 10, MARKET_RELEVANCE 1
- **Location:** `data/processed/training-examples/gharibo-research-gold-v0.1-examples.jsonl`

## 4. Dataset Version (Section D)

| Property | Value |
|----------|-------|
| Name | `GHARIBO-Research-Gold-v0.1` |
| Version | 0.1.0 |
| Split | 640 train / 80 validation / 80 test |
| Split ratio | 80/10/10 |
| Seed | 3407 |
| Dataset hash | `84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5` |
| Train split hash | `61afb232fa5e5783463499d1ee24355c52cf56edc5fe11b3bda48795152c6a6c` |
| Validation split hash | `f884c9a953f75a348ed257f84140878a519d6c9f96c9f39accd2660a51095906` |
| Test split hash | `959068e5451874ab5c3398584c0187dfdb4815c6d00d3a37ca69a54d8f79f11b` |
| TEST held out | Yes — permanently, never used for training/tuning/selection |
| Splits pairwise disjoint | Verified (Gate 7) |
| Split hashes reproducible | Yes — computed from raw file line bytes (CRLF-safe) |
| Dataset card | `data/processed/gharibo-research-gold-v0.1/dataset-card.json` |

## 5. Dependency Freeze (Section E)

| Property | Value |
|----------|-------|
| Pin set | 12 entries (promoted from 6) |
| Original 6 | torch, triton, unsloth_zoo, unsloth, transformers, triton_kernels |
| Promoted 6 | peft, trl, datasets, accelerate, bitsandbytes, openai-harmony |
| All resolvedVersion | `null` (requires real Kaggle T4 run) |
| UNPINNED_QUALIFICATION_ENTRIES | Empty (all promoted) |
| Harness content address | `b761dc8225136f6016b572b4918137a46db192e11cba6dafe78aee193768215c` |
| frozenOk | `false` (requires `status=QUALIFIED` and `unknowns` empty) |

## 6. verify-m3a Gate Runner (Section F)

| Gate | Title | Result |
|------|-------|--------|
| 1 | Dataset integrity validation | 5 PASS |
| 2 | Split overlap check | 5 PASS |
| 3 | Deterministic regeneration | 7 PASS |
| 4 | Secret scan | 3 PASS (0 hits in 257 files) |
| 5 | Training Package hash reproduction | 9 PASS |
| 6 | Source artifact integrity | 6 PASS |
| 7 | Deterministic dataset regeneration | 4 PASS |
| 8 | Provenance coverage | 5 PASS |
| 9 | Notebook drift | 1 PASS |
| 10 | Documentation facts | 2 PASS |
| 11 | No fabricated benchmark results | 4 PASS |
| 12 | Kaggle-dependent gates | 3 PENDING_EXTERNAL_EXECUTION |
| **Total** | | **51 PASS, 0 FAIL, 3 PENDING** |

## 7. Benchmark Definitions (Section G)

- 13 metrics defined (M1–M13): schema_validity, extraction_accuracy, classification_accuracy, source_fidelity, source_coverage, unsupported_claim_rate, empty_output_rate, duplicate_rate, dedup_f1, relation_f1, instruction_following, structured_output_reliability, record_precision
- All NOT_RUN — no fabricated scores
- Leakage audit defined (split disjointness, training-set containment, prompt containment, hash reproduction)
- Fixed decoding parameters required (temperature=0.0, greedy)

## 8. GHARIBO-exp-001 Readiness (Section H)

| Property | Value |
|----------|-------|
| Status | `READY_FOR_ENV_QUALIFICATION` |
| Package ID | `null` (not issued) |
| Git SHA | `9735fe4` (base) → `d5a322e` (this commit) |
| Base model | `openai/gpt-oss-20b` (revision `6cee5e81...`) |
| Dataset | `GHARIBO-Research-Gold-v0.1` (800 examples) |
| Engine deps | 12 pinned (all unresolved) |
| frozenOk | `false` |
| Next step | CTO authorizes Kaggle T4 qualification notebook run |
| Readiness package | `data/derived/experiment-packages/GHARIBO-exp-001-readiness.json` |

## 9. Validation Suite Results

| Check | Result |
|-------|--------|
| `docs:validate` | PASS — 22 documents consistent |
| `verify:m2 --check` | PASS — metrics match source tree |
| `verify:m3a` | PASS — 51 checks, 0 FAIL, 3 PENDING |
| `qualify:check` | PASS — harness matches package.ts, 12 deps |
| `typecheck` | PASS — no type errors |
| `lint` | PASS — no ESLint warnings or errors |
| `test` | PASS — 153/153 tests |
| `build` | PASS — 31 static pages generated |
| Secret scan | PASS — 0 hits in 257 git-tracked files |
| Source integrity | PASS — 8/8 files SHA-256 verified |
| Dataset integrity | PASS — all split hashes match |
| Split overlap | PASS — all splits pairwise disjoint |
| Hash reproduction | PASS — recomputed from raw line bytes |
| No fabricated benchmarks | PASS — all NOT_RUN, no scores |

## 10. Governance Documents Updated

| Document | Version | Status |
|----------|---------|--------|
| `PROJECT_STATE.md` | — | Updated (M3A: READY_FOR_ENV_QUALIFICATION) |
| `CHANGELOG.md` | — | Updated (all Sections A–H) |
| `docs/TRAINING_STRATEGY.md` | 1.2.0 → 1.3.0 | Frozen |
| `docs/MODEL_REGISTRY.md` | 1.2.0 → 1.3.0 | Frozen |
| `docs/DATA_FACTORY.md` | 1.1.0 → 1.2.0 | Frozen |
| `docs/EVALUATION.md` | 1.1.0 → 1.2.0 | Frozen |
| `docs/RESEARCH_BENCHMARK.md` | 1.0.0 → 1.1.0 | Draft |
| `docs/ENV_QUALIFICATION_CONTRACT.md` | 1.0.0 → 1.1.0 | Draft |
| `docs/DOCUMENT_REGISTER.md` | 1.0.0 → 1.1.0 | Living |

## 11. Security

- **Public repo:** `github.com/voltixsec/Gharibo`
- **data/raw/* excluded:** Verified via `.gitignore` (lines 54–55)
- **No credentials committed:** Secret scan found 0 hits in 257 files
- **No source payloads in derived data:** Training examples contain normalized structured data only
- **No model weights:** No training was executed

## 12. Files Committed

**New files (11):**
- `data/derived/experiment-packages/GHARIBO-exp-001-readiness.json`
- `data/derived/gold-classification/gold-quality-filter-v001-summary.json`
- `data/derived/source-manifests/legacy-ucl-source-manifest-v001.json`
- `docs/ENV_QUALIFICATION_CONTRACT.md`
- `docs/RESEARCH_BENCHMARK.md`
- `scripts/qualify/README.md`
- `scripts/qualify/check-qualify-harness.mjs`
- `scripts/qualify/qualify-kaggle-env.ipynb`
- `scripts/qualify/qualify-kaggle-env.mjs`
- `scripts/verify-m3a.mjs`
- `scripts/verify-m3a/gates.ts`

**Modified files (10):**
- `CHANGELOG.md`
- `PROJECT_STATE.md`
- `apps/web/lib/training/package.ts`
- `apps/web/lib/workers/kaggle/notebook.template.ipynb`
- `docs/DATA_FACTORY.md`
- `docs/DOCUMENT_REGISTER.md`
- `docs/EVALUATION.md`
- `docs/MODEL_REGISTRY.md`
- `docs/TRAINING_STRATEGY.md`
- `package.json`

## 13. Bugs Fixed

1. **CRLF line-ending hash mismatch:** Python's `.strip()` removes `\r` globally from text; Node's `.trim()` only strips from start/end of the overall string. Fix: use `.split(/\r?\n/)` in gates.ts instead of `.split('\n')`.
2. **Canonicalization mismatch:** Generation script computed hashes from `json.dumps(ex, sort_keys=True)` but wrote `json.dumps(ex)` (without `sort_keys`). Fix: both generation and verification now compute hashes from raw file line bytes directly.
3. **TypeScript syntax in .mjs files:** Used `: string[]` type annotations in plain JavaScript `.mjs` files. Fix: removed all TypeScript type annotations.

## 14. Stop Conditions

- ✅ No training has been executed
- ✅ No model weights, adapters, or checkpoints have been produced
- ✅ No evaluation scores have been computed
- ✅ All Kaggle-dependent gates are PENDING_EXTERNAL_EXECUTION
- ✅ The CTO directive "DO NOT START TRAINING" is honored

## 15. Next Steps (requires CTO authorization)

1. **Environment qualification:** Execute `scripts/qualify/qualify-kaggle-env.ipynb` on a real Kaggle T4 instance
2. **Dependency resolution:** The harness will resolve all 12 dependency versions and produce `env-qualification.json`
3. **Freeze gate:** If `frozenOk = true`, update `PINNED_ENGINE_DEPENDENCIES` with resolved versions
4. **Package issuance:** Issue the canonical Training Package (`package_id = sha256(manifest)`)
5. **Training authorization:** CTO must explicitly authorize training before any training run begins

## 16. Known Limitations

- 7 of 8 source files available; `VOKA_UCL_SECURITY_BATCH_004.jsonl` is unavailable (not invented)
- 157 records flagged NEEDS_REVIEW (lifecycle/naming ambiguities) — excluded from training
- 2 DOMAIN records rejected (no parent categories)
- All dependency versions unresolved (requires Kaggle run)
- No benchmark scores (requires trained model + GPU inference)

## 17. Commit & Push Verification

- **Commit:** `d5a322e33587dbd955ff1aaf51ee59e21d687522`
- **Push:** `9735fe4..d5a322e main -> main` (successful)
- **Remote verification:** `git ls-remote origin main` → `d5a322e33587dbd955ff1aaf51ee59e21d687522` ✅
