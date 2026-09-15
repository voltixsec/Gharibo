/**
 * Governed physical source for GHARIBO-Research-Gold-v0.1.
 *
 * This module deliberately bypasses SQLite/Data Factory canonicalisation.
 * The governed Gold identity is defined by the physical Harmony JSONL line
 * bytes and the committed/private dataset-card metadata.
 *
 * Reading this source never creates a run, package, experiment or model.
 */
import fs from "node:fs";
import path from "node:path";
import { isSha256Hex, sha256Hex } from "./hash";

export const GOVERNED_GOLD_DATASET_ID =
  "GHARIBO-Research-Gold-v0.1";

export const GOVERNED_GOLD_DATASET_VERSION =
  "0.1.0";

export const GOVERNED_GOLD_RECORD_FORMAT =
  "harmony-messages-v1" as const;

export const GOVERNED_GOLD_SPLIT_ALGORITHM =
  "seeded-sha256-content-hash-with-audit-quarantine" as const;

export const GOVERNED_GOLD_SPLIT_SEED = 20260914;

export type GovernedGoldSplitName =
  | "train"
  | "validation"
  | "test";

export interface GovernedGoldSource {
  datasetId: typeof GOVERNED_GOLD_DATASET_ID;
  datasetVersion: typeof GOVERNED_GOLD_DATASET_VERSION;
  recordFormat: typeof GOVERNED_GOLD_RECORD_FORMAT;

  recordCount: number;

  counts: Record<GovernedGoldSplitName, number>;

  datasetHash: string;

  splitHashes: Record<GovernedGoldSplitName, string>;

  splitPolicy: {
    algorithm: typeof GOVERNED_GOLD_SPLIT_ALGORITHM;
    seed: number;

    ratios: {
      train: number;
      validation: number;
      test: number;
    };

    method: string | null;

    lineHashAlgorithm: string | null;
    splitHashAlgorithm: string | null;

    /** The physical card does not currently declare this field. */
    declaredMinimumRecordsPerSplit: number | null;

    auditQuarantine: {
      auditSeed: number | null;
      auditCohortSize: number | null;
      quarantinedInto: Array<"train" | "validation">;
      testAudited: number | null;
    };

    testHeldOut: true;
    testPolicy: string;
  };

  /**
   * Physical JSONL line content with only a trailing CR normalised away.
   * No record -> canonical-record transformation is performed.
   */
  contents: Record<"train" | "validation", string[]>;
}

interface DatasetCard {
  datasetName?: unknown;
  datasetVersion?: unknown;
  format?: unknown;

  counts?: {
    train?: unknown;
    validation?: unknown;
    test?: unknown;
  };

  hashes?: {
    datasetHash?: unknown;
    trainSplitHash?: unknown;
    validationSplitHash?: unknown;
    testSplitHash?: unknown;
  };

  splitPolicy?: {
    seed?: unknown;
    algorithm?: unknown;

    ratios?: {
      train?: unknown;
      validation?: unknown;
      test?: unknown;
    };

    method?: unknown;
    lineHashAlgorithm?: unknown;
    splitHashAlgorithm?: unknown;
    minimumRecordsPerSplit?: unknown;

    auditQuarantine?: {
      auditSeed?: unknown;
      auditCohortSize?: unknown;
      quarantinedInto?: unknown;
      testAudited?: unknown;
    };

    testHeldOut?: unknown;
    testPolicy?: unknown;
  };
}

function fail(message: string): never {
  throw new Error(
    `Governed Gold source invalid: ${message}`,
  );
}

/**
 * Dataset-card convention:
 * sha256(utf-8(raw line bytes, trailing CR stripped)).
 */
export function rawJsonlLinesFromText(
  text: string,
): string[] {
  return text
    .split("\n")
    .map((line) =>
      line.endsWith("\r")
        ? line.slice(0, -1)
        : line,
    )
    .filter((line) => line.trim().length > 0);
}

/**
 * Order-independent split/dataset content hash:
 *
 * sha256(
 *   sorted(sha256(rawLine) for rawLine in lines).join("\n")
 * )
 */
export function hashRawJsonlLines(
  lines: readonly string[],
): string {
  const hashes = lines
    .map((line) => sha256Hex(line))
    .sort();

  return sha256Hex(hashes.join("\n"));
}

function asFiniteNumber(
  value: unknown,
  field: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    fail(`${field} must be a finite number`);
  }

  return value;
}

function asString(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0
  ) {
    fail(`${field} must be a non-empty string`);
  }

  return value;
}

function validateHarmonyLine(
  line: string,
  split: GovernedGoldSplitName,
  index: number,
): void {
  let parsed: unknown;

  try {
    parsed = JSON.parse(line);
  } catch {
    fail(
      `${split}[${index}] is not valid JSON`,
    );
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    fail(
      `${split}[${index}] must be a JSON object`,
    );
  }

  const obj = parsed as Record<string, unknown>;

  const keys = Object.keys(obj);

  if (
    keys.length !== 1 ||
    keys[0] !== "messages"
  ) {
    fail(
      `${split}[${index}] must contain only top-level messages[]`,
    );
  }

  const messages = obj.messages;

  if (
    !Array.isArray(messages) ||
    messages.length === 0
  ) {
    fail(
      `${split}[${index}].messages must be a non-empty array`,
    );
  }

  for (
    let messageIndex = 0;
    messageIndex < messages.length;
    messageIndex += 1
  ) {
    const message = messages[messageIndex];

    if (
      message === null ||
      typeof message !== "object" ||
      Array.isArray(message)
    ) {
      fail(
        `${split}[${index}].messages[${messageIndex}] must be an object`,
      );
    }

    const msg = message as Record<string, unknown>;

    if (
      typeof msg.role !== "string" ||
      msg.role.length === 0
    ) {
      fail(
        `${split}[${index}].messages[${messageIndex}].role must be non-empty`,
      );
    }

    if (typeof msg.content !== "string") {
      fail(
        `${split}[${index}].messages[${messageIndex}].content must be a string`,
      );
    }
  }
}

function resolveRepoRoot(
  start: string = process.cwd(),
): string {
  const candidates = [
    start,
    path.resolve(start, ".."),
    path.resolve(start, "..", ".."),
    path.resolve(start, "..", "..", ".."),
  ];

  for (const candidate of candidates) {
    if (
      fs.existsSync(
        path.join(
          candidate,
          "governance",
          "GHARIBO_MASTER_STATE.json",
        ),
      )
    ) {
      return candidate;
    }
  }

  fail(
    `could not resolve repository root from ${start}`,
  );
}

export function defaultGovernedGoldDataDir(): string {
  return path.join(
    resolveRepoRoot(),
    "data",
    "processed",
    "gharibo-research-gold-v0.1",
  );
}

function loadSplit(
  dataDir: string,
  split: GovernedGoldSplitName,
): string[] {
  const filePath = path.join(
    dataDir,
    `${split}.jsonl`,
  );

  if (!fs.existsSync(filePath)) {
    fail(`missing ${split}.jsonl`);
  }

  const lines = rawJsonlLinesFromText(
    fs.readFileSync(filePath, "utf8"),
  );

  // TEST is opaque: hash/count integrity only, never parse its messages.
  if (split !== "test") lines.forEach((line, index) =>
    validateHarmonyLine(
      line,
      split,
      index,
    ),
  );

  return lines;
}

/**
 * Loads and independently verifies the physical governed Gold source.
 *
 * Hard failures:
 * - dataset-card absent/malformed
 * - wrong dataset/version/format
 * - wrong split algorithm/seed/ratios
 * - TEST not permanently held out
 * - any count/hash mismatch
 * - any malformed Harmony messages[] record
 *
 * No database or repository mutation occurs.
 */
export function loadGovernedGoldSource(
  dataDir: string = defaultGovernedGoldDataDir(),
): GovernedGoldSource {
  const cardPath = path.join(
    dataDir,
    "dataset-card.json",
  );

  if (!fs.existsSync(cardPath)) {
    fail("dataset-card.json is missing");
  }

  let card: DatasetCard;

  try {
    card = JSON.parse(
      fs.readFileSync(
        cardPath,
        "utf8",
      ),
    ) as DatasetCard;
  } catch {
    fail("dataset-card.json is not valid JSON");
  }

  const datasetVersion = asString(
    card.datasetVersion,
    "datasetVersion",
  );

  if (card.datasetName !== GOVERNED_GOLD_DATASET_ID) {
    fail("datasetName does not match governed Gold");
  }

  if (
    datasetVersion !==
    GOVERNED_GOLD_DATASET_VERSION
  ) {
    fail(
      `datasetVersion=${datasetVersion}; expected ${GOVERNED_GOLD_DATASET_VERSION}`,
    );
  }

  const format = asString(
    card.format,
    "format",
  );

  if (!format.includes("Harmony")) {
    fail(
      `format=${format}; expected Harmony`,
    );
  }

  const policy = card.splitPolicy;

  if (!policy) {
    fail("splitPolicy is missing");
  }

  if (
    policy.algorithm !==
    GOVERNED_GOLD_SPLIT_ALGORITHM
  ) {
    fail(
      `splitPolicy.algorithm=${String(
        policy.algorithm,
      )}`,
    );
  }

  const seed = asFiniteNumber(
    policy.seed,
    "splitPolicy.seed",
  );

  if (
    seed !==
    GOVERNED_GOLD_SPLIT_SEED
  ) {
    fail(
      `splitPolicy.seed=${seed}; expected ${GOVERNED_GOLD_SPLIT_SEED}`,
    );
  }

  const ratios = {
    train: asFiniteNumber(
      policy.ratios?.train,
      "splitPolicy.ratios.train",
    ),

    validation: asFiniteNumber(
      policy.ratios?.validation,
      "splitPolicy.ratios.validation",
    ),

    test: asFiniteNumber(
      policy.ratios?.test,
      "splitPolicy.ratios.test",
    ),
  };

  if (
    ratios.train !== 0.8 ||
    ratios.validation !== 0.1 ||
    ratios.test !== 0.1
  ) {
    fail(
      `unexpected split ratios: ${JSON.stringify(
        ratios,
      )}`,
    );
  }

  if (policy.testHeldOut !== true) {
    fail(
      "splitPolicy.testHeldOut must be true",
    );
  }

  const testPolicy = asString(
    policy.testPolicy,
    "splitPolicy.testPolicy",
  );

  const contents = {
    train: loadSplit(
      dataDir,
      "train",
    ),

    validation: loadSplit(
      dataDir,
      "validation",
    ),

    test: loadSplit(
      dataDir,
      "test",
    ),
  };

  const counts = {
    train: contents.train.length,
    validation: contents.validation.length,
    test: contents.test.length,
  };

  const expectedCounts = {
    train: asFiniteNumber(
      card.counts?.train,
      "counts.train",
    ),

    validation: asFiniteNumber(
      card.counts?.validation,
      "counts.validation",
    ),

    test: asFiniteNumber(
      card.counts?.test,
      "counts.test",
    ),
  };

  for (
    const split of [
      "train",
      "validation",
      "test",
    ] as const
  ) {
    if (
      counts[split] !==
      expectedCounts[split]
    ) {
      fail(
        `${split} count=${counts[split]} ` +
          `!= declared ${expectedCounts[split]}`,
      );
    }
  }

  if (
    counts.train !== 640 ||
    counts.validation !== 80 ||
    counts.test !== 80
  ) {
    fail(
      `physical split counts are not governed 640/80/80: ${JSON.stringify(
        counts,
      )}`,
    );
  }

  const splitHashes = {
    train: hashRawJsonlLines(
      contents.train,
    ),

    validation: hashRawJsonlLines(
      contents.validation,
    ),

    test: hashRawJsonlLines(
      contents.test,
    ),
  };

  const declaredSplitHashes = {
    train: asString(
      card.hashes?.trainSplitHash,
      "hashes.trainSplitHash",
    ),

    validation: asString(
      card.hashes?.validationSplitHash,
      "hashes.validationSplitHash",
    ),

    test: asString(
      card.hashes?.testSplitHash,
      "hashes.testSplitHash",
    ),
  };

  for (
    const split of [
      "train",
      "validation",
      "test",
    ] as const
  ) {
    if (
      !isSha256Hex(
        declaredSplitHashes[split],
      )
    ) {
      fail(
        `declared ${split} split hash is not sha256`,
      );
    }

    if (
      splitHashes[split] !==
      declaredSplitHashes[split]
    ) {
      fail(
        `${split} split hash mismatch`,
      );
    }
  }

  const allLines = [
    ...contents.train,
    ...contents.validation,
    ...contents.test,
  ];

  const datasetHash =
    hashRawJsonlLines(
      allLines,
    );

  const declaredDatasetHash = asString(
    card.hashes?.datasetHash,
    "hashes.datasetHash",
  );

  if (
    !isSha256Hex(
      declaredDatasetHash,
    )
  ) {
    fail(
      "declared dataset hash is not sha256",
    );
  }

  if (
    datasetHash !==
    declaredDatasetHash
  ) {
    fail(
      "dataset hash mismatch",
    );
  }

  if (allLines.length !== 800) {
    fail(
      `recordCount=${allLines.length}; expected 800`,
    );
  }

  const declaredMinimum =
    typeof policy.minimumRecordsPerSplit ===
      "number" &&
    Number.isFinite(
      policy.minimumRecordsPerSplit,
    )
      ? policy.minimumRecordsPerSplit
      : null;

  if (policy.minimumRecordsPerSplit !== undefined &&
      (declaredMinimum === null || !Number.isInteger(declaredMinimum) || declaredMinimum < 1)) {
    fail("minimumRecordsPerSplit must be a positive integer when declared");
  }

  const audit = policy.auditQuarantine;
  if (JSON.stringify(audit?.quarantinedInto) !== '["train","validation"]' ||
      audit?.testAudited !== 0) {
    fail("auditQuarantine must keep audited examples out of TEST");
  }

  return {
    datasetId:
      GOVERNED_GOLD_DATASET_ID,

    datasetVersion:
      GOVERNED_GOLD_DATASET_VERSION,

    recordFormat:
      GOVERNED_GOLD_RECORD_FORMAT,

    recordCount:
      allLines.length,

    counts,

    datasetHash,

    splitHashes,

    splitPolicy: {
      algorithm:
        GOVERNED_GOLD_SPLIT_ALGORITHM,

      seed,

      ratios,

      method:
        typeof policy.method === "string"
          ? policy.method
          : null,

      lineHashAlgorithm:
        typeof policy.lineHashAlgorithm ===
        "string"
          ? policy.lineHashAlgorithm
          : null,

      splitHashAlgorithm:
        typeof policy.splitHashAlgorithm ===
        "string"
          ? policy.splitHashAlgorithm
          : null,

      declaredMinimumRecordsPerSplit:
        declaredMinimum,

      auditQuarantine: {
        quarantinedInto: ["train", "validation"],
        auditSeed:
          typeof audit?.auditSeed ===
            "number"
            ? audit.auditSeed
            : null,

        auditCohortSize:
          typeof audit?.auditCohortSize ===
            "number"
            ? audit.auditCohortSize
            : null,

        testAudited:
          typeof audit?.testAudited ===
            "number"
            ? audit.testAudited
            : null,
      },

      testHeldOut: true,

      testPolicy,
    },

    contents: { train: contents.train, validation: contents.validation },
  };
}
