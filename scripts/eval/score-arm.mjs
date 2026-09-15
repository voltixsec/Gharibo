#!/usr/bin/env node
/**
 * score-arm.mjs — score ONE arm's raw predictions into a RESEARCH_BENCHMARK.md report block.
 *
 * Consumes:
 *   --gold  <path>         gold.jsonl from build-eval-items.py  (scorer-only)
 *   --pred  <path>         predictions.jsonl: {item_id, raw}
 *   --arm   base|candidate
 *   --out   <path>         report json (default stdout)
 *
 * Produces the exact `base` / `candidate` block shape from RESEARCH_BENCHMARK.md 8, with
 * `status`, `executed`, `scores`, `counts`, `gates`, `raw_predictions_hash` and `scores_hash`.
 *
 * THE NOT_RUN RULE (8.5 / 9) is enforced structurally: if the predictions file is missing or
 * contains no rows, this script writes `status: "NOT_RUN"`, `executed: false` and every score
 * `null`. It is impossible for it to emit a placeholder 0.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  HARNESS_VERSION,
  canonicalJson,
  computeMetrics,
  DEFAULT_THRESHOLDS,
  evaluateGates,
} from "./metrics.mjs";

const args = process.argv.slice(2);
const arg = (name, def = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};

const goldPath = arg("--gold");
const predPath = arg("--pred");
const arm = arg("--arm", "base");
const outPath = arg("--out");

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const GATED = Object.keys(DEFAULT_THRESHOLDS);
const NULL_SCORES = Object.fromEntries([
  ...[
    "schema_validity",
    "extraction_accuracy",
    "classification_accuracy",
    "source_fidelity",
    "source_coverage",
    "unsupported_claim_rate",
    "empty_output_rate",
    "duplicate_rate",
    "dedup_f1",
    "relation_f1",
    "instruction_following",
    "structured_output_reliability",
    "stability",
    "record_precision",
    "benchmark_score",
  ].map((k) => [k, null]),
]);

function notRunBlock(reason) {
  return {
    status: "NOT_RUN",
    executed: false,
    run_id: null,
    raw_predictions_hash: null,
    scores: { ...NULL_SCORES },
    counts: {
      items: 0,
      claims: 0,
      valid_citations: 0,
      total_citations: 0,
      empty_items: 0,
      matched_entities: 0,
      predicted_entities: 0,
      gold_entities: 0,
    },
    gates: null,
    note: reason,
  };
}

function main() {
  if (!goldPath || !existsSync(goldPath)) {
    const block = notRunBlock(`gold file not found: ${goldPath}`);
    emit(block);
    return 0;
  }
  if (!predPath || !existsSync(predPath)) {
    const block = notRunBlock(`predictions not found: ${predPath} — arm has not executed`);
    emit(block);
    return 0;
  }

  const goldRows = readFileSync(goldPath, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
  const predRows = readFileSync(predPath, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  if (predRows.length === 0) {
    emit(notRunBlock("predictions file is empty — arm has not executed"));
    return 0;
  }

  const predById = new Map(predRows.map((r) => [r.item_id, r.raw ?? ""]));
  const rows = goldRows.map((g) => ({
    item: { sources: g.sources ?? [], instructions: g.instructions ?? [] },
    gold: g.gold ?? {},
    prediction: predById.get(g.item_id) ?? "",
  }));

  const { scores, counts } = computeMetrics(rows, { thresholds: DEFAULT_THRESHOLDS });
  const gates = evaluateGates(scores);
  const rawPredictionsHash = sha256(predRows.map((r) => `${r.item_id}\t${sha256(String(r.raw ?? ""))}`).join("\n"));
  const scoresHash = sha256(canonicalJson(scores));

  emit({
    status: "RUN",
    executed: true,
    arm,
    harness_version: HARNESS_VERSION,
    run_id: null,
    raw_predictions_hash: rawPredictionsHash,
    scores,
    counts,
    gates,
    scores_hash: scoresHash,
  });
  return 0;
}

function emit(block) {
  const text = JSON.stringify(block, null, 2) + "\n";
  if (outPath) {
    writeFileSync(resolve(outPath), text, "utf8");
    console.log(`wrote ${outPath} (status ${block.status})`);
  } else {
    process.stdout.write(text);
  }
}

process.exit(main());
