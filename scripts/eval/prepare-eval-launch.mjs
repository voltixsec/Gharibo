#!/usr/bin/env node
/**
 * prepare-eval-launch.mjs — build (or verify) the governed Kaggle launch bundle for the ONE
 * authorized held-out TEST benchmark (DEC-0032).
 *
 * Mirrors scripts/training/prepare-kaggle-start.ts exactly, with one deliberate INVERSION:
 *
 *   the training bundle shipped TRAIN + VALIDATION and held TEST out;
 *   the evaluation bundle ships the MODEL-VISIBLE PROMPTS ONLY and holds GOLD out.
 *
 * That inversion is the whole point. During training the secret was TEST; during evaluation the
 * secret is the ANSWER. The model must be structurally incapable of seeing `gold.jsonl`, which is
 * exactly what the kernel asserts at runtime (`assert len(golds) == 0`). This builder enforces the
 * same rule on the other side of the wire: gold.jsonl must never physically enter the dataset
 * directory that gets uploaded.
 *
 * BUNDLE
 *   dataset/dataset-metadata.json
 *   dataset/prompts.jsonl        <- model-visible: system + user turns, no answers
 *   kernel/gharibo-eval-001.ipynb
 *   kernel/kernel-metadata.json
 *   launch-plan.json             <- carries the hash, so excluded from it
 *
 * `launchBundleHash` = sha256( "\n".join( sorted( `${sha256(file)}  ${relativePath}` ) ) + "\n" )
 * over the payload files only — the same committed algorithm DEC-0028 established.
 *
 * Usage:
 *   node scripts/eval/prepare-eval-launch.mjs          # write the bundle
 *   node scripts/eval/prepare-eval-launch.mjs --check  # drift check, writes nothing
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EVAL_PINS, notebookSha256, render } from "./build-eval-kernel.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECK = process.argv.includes("--check");

const BUNDLE_REL = "apps/web/data/kaggle-eval/gharibo-eval-001";
const BUNDLE_ROOT = join(ROOT, BUNDLE_REL);
const NOTEBOOK_REL = "scripts/eval/kaggle/gharibo-eval-001.ipynb";
const ITEMS_DIR = join(ROOT, ".workbuddy-ai", "eval-items");

/** Where the model-visible prompts live. `gold.jsonl` sits beside it and must NOT travel. */
const PROMPTS_SRC = join(ITEMS_DIR, "prompts.jsonl");
const GOLD_SRC = join(ITEMS_DIR, "gold.jsonl");

const sha256 = (v) => createHash("sha256").update(v).digest("hex");

/** sha256 over the sorted `sha256  relativePath` manifest of the bundle payload. */
export function launchBundleHash(pairs) {
  const lines = pairs.map((p) => `${p.sha256}  ${p.relativePath}`).sort();
  return sha256(lines.join("\n") + "\n");
}

function requireThat(ok, message) {
  if (!ok) throw new Error(`evaluation launch bundle: ${message}`);
}

/**
 * Strip the gold answers out of a prompt record before it is allowed to travel.
 *
 * The kernel only reads `item_id` and `prompt.{system,user}`. Anything else — `gold`,
 * `expected_output`, `chosen_output`, `instructions`, `sources`, `reasoning` — is scorer-side
 * material and is removed here rather than trusted to stay unread.
 */
function projectItem(row) {
  const item = {
    item_id: row.item_id,
    prompt: { system: row.prompt?.system ?? "", user: row.prompt?.user ?? "" },
  };
  return item;
}

/** Field names that would indicate an answer leaked into a projected item. */
const ANSWER_FIELDS = [
  "gold",
  "expected_output",
  "chosen_output",
  "answer",
  "instructions",
  "sources",
  "reasoning",
  "label",
  "target",
];

function main() {
  // ---------------------------------------------------------------- preconditions
  requireThat(existsSync(PROMPTS_SRC), `missing model-visible prompts: ${PROMPTS_SRC}`);
  requireThat(
    existsSync(GOLD_SRC),
    `missing scorer-only gold: ${GOLD_SRC} (the harness needs it locally to score)`
  );

  const promptsRaw = readFileSync(PROMPTS_SRC, "utf8");
  const rows = promptsRaw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  requireThat(
    rows.length === EVAL_PINS.testRecordCount,
    `expected ${EVAL_PINS.testRecordCount} prompts, found ${rows.length}`
  );

  // The source prompts file must itself be answer-free. If it is not, the harness has a bug that
  // would silently leak the answers into the inference environment.
  const leaked = rows.flatMap((r) =>
    Object.keys(r).filter((k) => ANSWER_FIELDS.includes(k))
  );
  requireThat(
    leaked.length === 0,
    `the model-visible prompt bundle already contains answer-bearing field(s): ${[...new Set(leaked)].join(", ")}`
  );

  for (const row of rows) {
    requireThat(row.item_id, "every prompt row needs an item_id");
    requireThat(
      typeof row.prompt?.user === "string" && row.prompt.user.trim(),
      `item ${row.item_id} has no user turn`
    );
  }

  // ---------------------------------------------------------------- determinism
  // Re-project through the whitelist so the shipped bytes are a pure function of the governed
  // input, not of whatever extra keys happened to be present.
  const projected = rows.map(projectItem);
  const promptsContent = projected.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const promptsSha256 = sha256(promptsContent);

  // ---------------------------------------------------------------- notebook
  const notebookPath = join(ROOT, NOTEBOOK_REL);
  requireThat(
    existsSync(notebookPath),
    `missing generated notebook: ${NOTEBOOK_REL} — run build-eval-kernel.mjs`
  );
  const notebookContent = readFileSync(notebookPath, "utf8");
  requireThat(
    notebookContent === render(),
    "the notebook on disk is stale — regenerate with build-eval-kernel.mjs"
  );
  const notebookSha = notebookSha256();

  // ---------------------------------------------------------------- metadata
  const datasetId = "vokaigharibo/gharibo-eval-prompts-fec22ca2";
  const kernelId = "vokaigharibo/gharibo-eval-001-fec22ca2";

  const datasetMetadata = {
    title: "gharibo eval prompts fec22ca2",
    id: datasetId,
    licenses: [{ name: "other" }],
    description:
      "PRIVATE proprietary GHARIBO evaluation input. MODEL-VISIBLE PROMPTS ONLY (system + user " +
      "turns). The gold answers are deliberately excluded and never leave the scoring host. " +
      "Held-out TEST payload; not licensed for public redistribution.",
  };

  const kernelMetadata = {
    id: kernelId,
    // The title must slugify to the id's final segment. Kaggle refuses a push whose title does
    // not resolve to the id ("409 Conflict ... surprising behavior"), so the two are kept
    // mechanically aligned here rather than hand-matched.
    title: "gharibo eval 001 fec22ca2",
    code_file: "gharibo-eval-001.ipynb",
    language: "python",
    kernel_type: "notebook",
    is_private: true,
    enable_gpu: true,
    enable_internet: true,
    machine_shape: "NvidiaTeslaT4",
    dataset_sources: [datasetId],
    competition_sources: [],
    kernel_sources: [],
    model_sources: [],
  };

  const payloadFiles = [
    { relativePath: "dataset/dataset-metadata.json", content: JSON.stringify(datasetMetadata, null, 2) + "\n" },
    { relativePath: "dataset/prompts.jsonl", content: promptsContent },
    { relativePath: `kernel/${kernelMetadata.code_file}`, content: notebookContent },
    { relativePath: "kernel/kernel-metadata.json", content: JSON.stringify(kernelMetadata, null, 2) + "\n" },
  ];

  const pairs = payloadFiles.map((f) => ({ relativePath: f.relativePath, sha256: sha256(f.content) }));
  const bundleHash = launchBundleHash(pairs);

  const launchPlan = {
    status: "PREPARED_NOT_LAUNCHED",
    authorizationDecisionId: EVAL_PINS.authorizationDecisionId,
    decision: EVAL_PINS.decision,
    harnessVersion: EVAL_PINS.harnessVersion,
    kernelId,
    datasetId,
    notebookSha256: notebookSha,
    launchBundleHash: bundleHash,
    launchBundleHashAlgorithm:
      'sha256 over "\\n".join(sorted(`${sha256(file)}  ${relativePath}`)) + "\\n", payload files only',
    promptsSha256,
    testSplitHash: EVAL_PINS.testSplitHash,
    testRecordCount: EVAL_PINS.testRecordCount,
    candidateAdapterSha256: EVAL_PINS.candidateAdapterSha256,
    baseModelRevision: EVAL_PINS.baseModelRevision,
    payloadBasis: "PROMPTS_ONLY",
    goldPayloadIncluded: false,
    goldPayloadAccessed: false,
    trainSplitIncluded: false,
    validationSplitIncluded: false,
    testPayloadIncluded: false,
    worker: "kaggle",
    accelerator: "NvidiaTeslaT4",
    arms: ["base", "candidate"],
    armOrder: "BASE_THEN_CANDIDATE",
    launchAttempted: false,
    testInferenceOccurred: false,
    metricValuesProduced: 0,
  };

  // ---------------------------------------------------------------- check mode
  if (CHECK) {
    const problems = [];
    for (const f of payloadFiles) {
      const onDisk = join(BUNDLE_ROOT, f.relativePath);
      if (!existsSync(onDisk)) {
        problems.push(`missing on disk: ${f.relativePath}`);
        continue;
      }
      if (readFileSync(onDisk, "utf8") !== f.content) problems.push(`drift on disk: ${f.relativePath}`);
    }
    const planPath = join(BUNDLE_ROOT, "launch-plan.json");
    if (!existsSync(planPath)) {
      problems.push("missing launch-plan.json");
    } else {
      const onDiskPlan = JSON.parse(readFileSync(planPath, "utf8"));
      if (onDiskPlan.launchBundleHash !== bundleHash) {
        problems.push(`recorded launchBundleHash ${onDiskPlan.launchBundleHash} != computed ${bundleHash}`);
      }
    }
    // THE INVARIANT: no answer-bearing file may exist anywhere in the bundle.
    for (const forbidden of ["gold.jsonl", "test.jsonl", "train.jsonl", "validation.jsonl"]) {
      if (existsSync(join(BUNDLE_ROOT, "dataset", forbidden))) {
        problems.push(`PRIVACY VIOLATION: dataset/${forbidden} exists in the evaluation bundle`);
      }
    }
    if (problems.length > 0) {
      for (const p of problems) console.error("  - " + p);
      throw new Error(`evaluation launch bundle drift (${problems.length} problem(s))`);
    }
    console.log(
      JSON.stringify(
        {
          status: "IN_SYNC",
          bundleRoot: BUNDLE_REL,
          notebookSha256: notebookSha,
          launchBundleHash: bundleHash,
          promptsSha256,
          payloadFiles: pairs.length,
          goldPayloadIncluded: false,
          testPayloadIncluded: false,
        },
        null,
        2
      )
    );
    return;
  }

  // ---------------------------------------------------------------- write mode
  for (const f of payloadFiles) {
    const target = join(BUNDLE_ROOT, f.relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.content, "utf8");
  }
  writeFileSync(join(BUNDLE_ROOT, "launch-plan.json"), JSON.stringify(launchPlan, null, 2) + "\n", "utf8");

  // Belt and braces: remove any stray answer-bearing file that a previous run may have left.
  let removed = 0;
  for (const stray of ["gold.jsonl", "test.jsonl", "train.jsonl", "validation.jsonl"]) {
    const p = join(BUNDLE_ROOT, "dataset", stray);
    if (existsSync(p)) {
      rmSync(p);
      removed += 1;
      console.log(`removed stray dataset/${stray} (answers and TRAIN/VALIDATION are held out)`);
    }
  }

  console.log(
    JSON.stringify(
      {
        status: "PREPARED_NOT_LAUNCHED",
        bundleRoot: BUNDLE_REL,
        kernelId,
        datasetId,
        notebookSha256: notebookSha,
        launchBundleHash: bundleHash,
        promptsSha256,
        payloadFiles: pairs.length,
        prompts: projected.length,
        goldPayloadIncluded: false,
        testPayloadIncluded: false,
        strayRemoved: removed,
      },
      null,
      2
    )
  );
  void relative;
}

main();
