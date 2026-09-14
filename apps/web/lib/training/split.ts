/**
 * Deterministic seeded split algorithm (architecture M2 §5.2) — implemented EXACTLY.
 *
 *   k(r) = sha256( utf8( str(seed) + ":" + recordLineHash(r) ) )     # 256-bit
 *   sort R ascending by k(r); ties broken by recordLineHash(r) lexicographically
 *   N = |R|; nTrain = floor(N*trainRatio); nVal = floor(N*valRatio); nTest = N-nTrain-nVal
 *   assign first nTrain → train, next nVal → validation, remaining → test
 *   if any split < minPerSplit → FAIL LOUDLY (no version is created)
 *   splitHash(S) = sha256( sort(recordLineHash(r) for r in S).join("\n") )
 *
 * Because assignment is driven by the hash of each record's content, re-cutting
 * identical inputs on any machine reproduces identical splits and hashes,
 * independent of insertion order.
 */
import type { SplitHashes, SplitName, SplitPolicy } from "@gharibo/shared";
import { sha256Hex } from "./hash";
import { splitHashFromLineHashes } from "./canonical";

/** Recommended defaults (Q1/O1: configurable; each split must be non-empty). */
export const DEFAULT_SPLIT_SEED = 3407;
export const DEFAULT_MIN_RECORDS_PER_SPLIT = 10;
export const DEFAULT_SPLIT_RATIOS: { train: number; validation: number; test: number } = {
  train: 0.8,
  validation: 0.1,
  test: 0.1,
};

/** One record to be split. */
export interface SplitRecordInput {
  id: string;
  /** sha256 of the canonical line (§5.1). */
  lineHash: string;
}

/** The result of a deterministic split. */
export interface SplitResult {
  /** Record ids per split. */
  splits: Record<SplitName, string[]>;
  splitHashes: SplitHashes;
  counts: Record<SplitName, number>;
}

/** Thrown when a split would fall below `minimumRecordsPerSplit` (fail loudly). */
export class EmptySplitError extends Error {
  constructor(
    public readonly counts: Record<SplitName, number>,
    public readonly minimum: number,
  ) {
    super(
      `Split below minimum of ${minimum}: train=${counts.train}, ` +
        `validation=${counts.validation}, test=${counts.test}`,
    );
    this.name = "EmptySplitError";
  }
}

/** Builds a split policy with the recommended defaults. */
export function defaultSplitPolicy(
  seed: number = DEFAULT_SPLIT_SEED,
  minimumRecordsPerSplit: number = DEFAULT_MIN_RECORDS_PER_SPLIT,
): SplitPolicy {
  return {
    algorithm: "seeded-shuffle-sha256",
    seed,
    ratios: { ...DEFAULT_SPLIT_RATIOS },
    minimumRecordsPerSplit,
  };
}

/** Computes the deterministic split. Throws `EmptySplitError` on an undersized split. */
export function computeSplits(records: SplitRecordInput[], policy: SplitPolicy): SplitResult {
  const ratioSum = policy.ratios.train + policy.ratios.validation + policy.ratios.test;
  if (Math.abs(ratioSum - 1) > 1e-9) {
    throw new Error(`Split ratios must sum to 1.0 (got ${ratioSum})`);
  }

  // 1. Key each record by the hash of (seed : recordLineHash).
  const keyed = records.map((r) => ({
    id: r.id,
    lineHash: r.lineHash,
    k: sha256Hex(`${policy.seed}:${r.lineHash}`),
  }));

  // 2. Sort ascending by k(r); ties broken by recordLineHash lexicographically.
  keyed.sort((a, b) => {
    if (a.k < b.k) return -1;
    if (a.k > b.k) return 1;
    if (a.lineHash < b.lineHash) return -1;
    if (a.lineHash > b.lineHash) return 1;
    return 0;
  });

  // 3. Deterministic counts.
  const n = keyed.length;
  const nTrain = Math.floor(n * policy.ratios.train);
  const nVal = Math.floor(n * policy.ratios.validation);
  const nTest = n - nTrain - nVal;

  const counts: Record<SplitName, number> = { train: nTrain, validation: nVal, test: nTest };

  // 5. Fail loudly if any split is below the minimum.
  if (
    nTrain < policy.minimumRecordsPerSplit ||
    nVal < policy.minimumRecordsPerSplit ||
    nTest < policy.minimumRecordsPerSplit
  ) {
    throw new EmptySplitError(counts, policy.minimumRecordsPerSplit);
  }

  // 4. Assign in sorted order.
  const train = keyed.slice(0, nTrain);
  const validation = keyed.slice(nTrain, nTrain + nVal);
  const test = keyed.slice(nTrain + nVal);

  // 6. splitHash(S) = sha256( sort(recordLineHash(r) for r in S).join("\n") )
  const splitHashes: SplitHashes = {
    train: splitHashFromLineHashes(train.map((r) => r.lineHash)),
    validation: splitHashFromLineHashes(validation.map((r) => r.lineHash)),
    test: splitHashFromLineHashes(test.map((r) => r.lineHash)),
  };

  return {
    splits: {
      train: train.map((r) => r.id),
      validation: validation.map((r) => r.id),
      test: test.map((r) => r.id),
    },
    splitHashes,
    counts,
  };
}
