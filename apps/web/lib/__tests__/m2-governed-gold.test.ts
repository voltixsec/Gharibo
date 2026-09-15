import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  GOVERNED_GOLD_SPLIT_ALGORITHM,
  hashRawJsonlLines,
  loadGovernedGoldSource,
} from "@/lib/training/governed-gold";

const tempDirs: string[] = [];

function harmonyLine(index: number): string {
  return JSON.stringify({
    messages: [
      {
        role: "system",
        content: "system",
      },
      {
        role: "user",
        content: `question-${index}`,
      },
      {
        role: "assistant",
        content: `answer-${index}`,
      },
    ],
  });
}

function createFixture(): string {
  const dir = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "gharibo-governed-gold-",
    ),
  );

  tempDirs.push(dir);

  const train = Array.from(
    { length: 640 },
    (_, index) =>
      harmonyLine(index),
  );

  const validation = Array.from(
    { length: 80 },
    (_, index) =>
      harmonyLine(640 + index),
  );

  const test = Array.from(
    { length: 80 },
    (_, index) =>
      harmonyLine(720 + index),
  );

  const all = [
    ...train,
    ...validation,
    ...test,
  ];

  fs.writeFileSync(
    path.join(dir, "train.jsonl"),
    train.join("\n") + "\n",
    "utf8",
  );

  fs.writeFileSync(
    path.join(
      dir,
      "validation.jsonl",
    ),
    validation.join("\n") + "\n",
    "utf8",
  );

  fs.writeFileSync(
    path.join(dir, "test.jsonl"),
    test.join("\n") + "\n",
    "utf8",
  );

  const card = {
    datasetName:
      "GHARIBO-Research-Gold-v0.1",

    datasetVersion:
      "0.1.0",

    format:
      "OpenAI Harmony (system/user/assistant roles)",

    counts: {
      train: 640,
      validation: 80,
      test: 80,
    },

    hashes: {
      datasetHash:
        hashRawJsonlLines(all),

      trainSplitHash:
        hashRawJsonlLines(train),

      validationSplitHash:
        hashRawJsonlLines(
          validation,
        ),

      testSplitHash:
        hashRawJsonlLines(test),
    },

    splitPolicy: {
      seed: 20260914,

      algorithm:
        GOVERNED_GOLD_SPLIT_ALGORITHM,

      ratios: {
        train: 0.8,
        validation: 0.1,
        test: 0.1,
      },

      method:
        "synthetic test equivalent",

      lineHashAlgorithm:
        "sha256 raw line",

      splitHashAlgorithm:
        "sha256 sorted line hashes",

      auditQuarantine: {
        auditSeed: 3407,
        auditCohortSize: 100,
        quarantinedInto: ["train", "validation"],
        testAudited: 0,
      },

      testHeldOut: true,

      testPolicy:
        "TEST is permanently held out.",
    },
  };

  fs.writeFileSync(
    path.join(
      dir,
      "dataset-card.json",
    ),
    JSON.stringify(card, null, 2),
    "utf8",
  );

  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(
      dir,
      {
        recursive: true,
        force: true,
      },
    );
  }
});

describe(
  "governed physical Gold source",
  () => {
    it("keeps TEST opaque and exposes no TEST payload", () => {
      const dir = createFixture();
      const test = Array.from({ length: 80 }, (_, i) => `opaque-test-${i}`);
      fs.writeFileSync(path.join(dir, "test.jsonl"), test.join("\n") + "\n");
      const cardPath = path.join(dir, "dataset-card.json");
      const card = JSON.parse(fs.readFileSync(cardPath, "utf8"));
      const train = fs.readFileSync(path.join(dir, "train.jsonl"), "utf8").trimEnd().split("\n");
      const validation = fs.readFileSync(path.join(dir, "validation.jsonl"), "utf8").trimEnd().split("\n");
      card.hashes.testSplitHash = hashRawJsonlLines(test);
      card.hashes.datasetHash = hashRawJsonlLines([...train, ...validation, ...test]);
      fs.writeFileSync(cardPath, JSON.stringify(card));
      expect(loadGovernedGoldSource(dir).contents).not.toHaveProperty("test");
      fs.appendFileSync(path.join(dir, "test.jsonl"), "tampered\n");
      expect(() => loadGovernedGoldSource(dir)).toThrow(/count|hash/);
    });

    it(
      "loads a byte-identity Harmony source without canonical conversion",
      () => {
        const dir = createFixture();

        const source =
          loadGovernedGoldSource(dir);

        expect(source.recordFormat)
          .toBe(
            "harmony-messages-v1",
          );

        expect(source.recordCount)
          .toBe(800);

        expect(source.counts)
          .toEqual({
            train: 640,
            validation: 80,
            test: 80,
          });

        expect(
          source.splitPolicy.algorithm,
        ).toBe(
          GOVERNED_GOLD_SPLIT_ALGORITHM,
        );

        expect(
          source.splitPolicy.testHeldOut,
        ).toBe(true);

        expect(
          source.splitPolicy
            .declaredMinimumRecordsPerSplit,
        ).toBeNull();

        expect(
          JSON.parse(
            source.contents.train[0],
          ),
        ).toHaveProperty(
          "messages",
        );
      },
    );

    it(
      "fails loudly when physical JSONL bytes are changed",
      () => {
        const dir = createFixture();

        fs.appendFileSync(
          path.join(
            dir,
            "train.jsonl",
          ),
          harmonyLine(9999) + "\n",
          "utf8",
        );

        expect(
          () =>
            loadGovernedGoldSource(
              dir,
            ),
        ).toThrow(
          /count|hash/i,
        );
      },
    );

    it(
      "rejects a different split algorithm",
      () => {
        const dir = createFixture();

        const cardPath = path.join(
          dir,
          "dataset-card.json",
        );

        const card = JSON.parse(
          fs.readFileSync(
            cardPath,
            "utf8",
          ),
        );

        card.splitPolicy.algorithm =
          "seeded-shuffle-sha256";

        fs.writeFileSync(
          cardPath,
          JSON.stringify(
            card,
            null,
            2,
          ),
          "utf8",
        );

        expect(
          () =>
            loadGovernedGoldSource(
              dir,
            ),
        ).toThrow(
          /splitPolicy\.algorithm/,
        );
      },
    );

    it(
      "verifies the real GHARIBO Gold source when physically present",
      () => {
        const realDir = path.resolve(
          process.cwd(),
          "..",
          "..",
          "data",
          "processed",
          "gharibo-research-gold-v0.1",
        );

        if (
          !fs.existsSync(
            path.join(
              realDir,
              "dataset-card.json",
            ),
          )
        ) {
          return;
        }

        const source =
          loadGovernedGoldSource(
            realDir,
          );

        expect(source.datasetHash)
          .toBe(
            "84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5",
          );

        expect(
          source.splitHashes.train,
        ).toBe(
          "84025de18403b8660d9702877b2b6fd329cedb886cad0095ab67e4daa3828ad2",
        );

        expect(
          source.splitHashes.validation,
        ).toBe(
          "063fb4422aed247b3f92c0f0d5b1291af46fd4357ca48829a7e7f6ce98815787",
        );

        expect(
          source.splitHashes.test,
        ).toBe(
          "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",
        );

        expect(
          source.splitPolicy
            .auditQuarantine
            .testAudited,
        ).toBe(0);

        expect(
          source.splitPolicy
            .testHeldOut,
        ).toBe(true);
      },
    );
  },
);
