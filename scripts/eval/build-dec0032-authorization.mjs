#!/usr/bin/env node
/**
 * build-dec0032-authorization.mjs — deterministic generator for the DEC-0032 record.
 *
 * DEC-0032 is the EXPLICIT EVALUATION AUTHORIZATION for the held-out TEST benchmark of
 * GHARIBO-exp-001. It records the human (CEO) decision taken 2026-09-15:
 *
 *     Decision: AUTHORIZED WITH LIMITS
 *     Decider:  CEO
 *     Scope:    ONE governed held-out TEST benchmark
 *
 * WHAT THIS RECORD DOES
 *   - authorizes exactly one benchmark execution over the 80-record held-out TEST split,
 *     covering both arms (BASE and CANDIDATE) under one harness;
 *   - closes blocker BLK-0003 — and closes it ONLY through this decision;
 *   - moves evaluation from EVALUATION_READY_AWAITING_AUTHORIZATION to the
 *     repository-supported authorized/pre-execution state.
 *
 * WHAT THIS RECORD DOES NOT DO
 *   - it does not authorize model promotion, further training, checkpoint selection,
 *     prompt tuning, few-shot selection, threshold tuning, test-driven filtering,
 *     dataset modification, a second evaluation pass, re-running GHARIBO-exp-001, or
 *     creating GHARIBO-V0.1;
 *   - it does not mark evaluation complete. Nothing has executed yet.
 *
 * DETERMINISM
 * ----------
 * The body is a pure constant: no clock, no filesystem, no environment. `authorizedAt`
 * is a fixed literal so the authorization hash is stable across runs and machines.
 *
 * Usage:
 *   node scripts/eval/build-dec0032-authorization.mjs          # write governance/DEC-0032-*.json
 *   node scripts/eval/build-dec0032-authorization.mjs --check  # exit 1 if the file is stale
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "governance/DEC-0032-evaluation-authorization.json";

/** Canonical form: object keys sorted recursively (the repo-wide hash convention). */
export const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
      : value;

export const sha256Canonical = (value) =>
  createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

/**
 * The DEC-0032 authorization body, minus its own hash. Every identifier here is carried
 * forward from an already-accepted governed record; nothing is re-invented.
 */
export function evaluationAuthorizationBody() {
  return {
    // ---------------------------------------------------------------- identity
    status: "EVALUATION_AUTHORIZED_WITH_LIMITS",
    decisionId: "DEC-0032",
    supersedesDecisionId: null,
    scope: "ONE_GOVERNED_HELD_OUT_TEST_BENCHMARK",

    authorizedAt: "2026-09-15T00:00:00.000Z",
    deciderRole: "CEO",
    decisionDate: "2026-09-15",
    decision: "AUTHORIZED WITH LIMITS",
    decisionBasis: "docs/EVALUATION_AUTHORIZATION_REQUEST.md",

    // --------------------------------------------------- artifact under evaluation
    experimentId: "GHARIBO-exp-001",
    artifactUnderEvaluation: "GHARIBO-exp-001 QLoRA adapter",
    candidateAdapterSha256: "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f",
    candidateCheckpoint: "checkpoint-160 (final adapter; equals the trained end state)",
    baseModel: "openai/gpt-oss-20b",
    baseModelRevision: "6cee5e81ee83917806bbde320786a8fb61efebee",
    trainingRunId: "ea6e30f2-ce26-4323-b35a-3436ee867eaf",
    packageId: "78dd1bf374ed1c53785ea50bf179b1b7a4764d40c121d3d41cda4e2a2e3e68f2",
    artifactRollupHash: "788bc0a77d465bcbc997e8698177fbd90c9e8e2720e549159a27684095284885",

    // ------------------------------------------------------------- dataset / TEST
    datasetId: "GHARIBO-Research-Gold-v0.1",
    datasetHash: "84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5",
    testSplitHash: "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",
    testRecordCount: 80,
    recordFormat: "harmony-messages-v1",
    metricSpecification: "docs/RESEARCH_BENCHMARK.md",
    metricIds: [
      "M1",
      "M2",
      "M3",
      "M4",
      "M5",
      "M6",
      "M7",
      "M8",
      "M9",
      "M10",
      "M11",
      "M12",
      "M13",
    ],

    // ----------------------------------------------------------------- permitted
    permitted: [
      "exactly one governed held-out TEST benchmark execution",
      "BASE arm inference: openai/gpt-oss-20b at the pinned revision, unadapted",
      "CANDIDATE arm inference: the GHARIBO-exp-001 adapter applied to that pinned base",
      "M1-M13 measurement exactly as defined in docs/RESEARCH_BENCHMARK.md",
      "required TEST access logging (split hash, record count, timestamp, run id, artifact, base revision, records parsed, no-gradient and no-training assertions)",
      "reading and parsing TEST records for inference only, after authorization is durably recorded and the §3.5 leakage audit has passed",
    ],

    // ----------------------------------------------------------------- forbidden
    forbidden: [
      "training of any kind",
      "tuning of any kind (prompt, template, few-shot, hyperparameter, threshold)",
      "any selection based on TEST outcomes (model, checkpoint, epoch, exemplar)",
      "model promotion",
      "dataset mutation or re-cutting",
      "second-pass optimization of a reported number",
      "re-running GHARIBO-exp-001",
      "creating GHARIBO-V0.1",
      "using TEST without a PASS leakage audit",
    ],

    // ------------------------------------------------------------- hard stops
    hardStops: [
      "Promotion remains forbidden even if CANDIDATE scores are excellent: evaluation result and promotion decision are separate governance acts.",
      "If the leakage audit fails, evaluation MUST NOT run; the blocker is recorded truthfully instead.",
      "If TEST inference has materially occurred, the run MUST NOT be repeated merely because scores are disappointing.",
      "An infrastructure failure before any valid metric-producing TEST inference must be recorded separately and MUST NOT be disguised as an evaluation result.",
      "No score may be written before a real execution produces it (RESEARCH_BENCHMARK.md §9): 0, \"N/A\" and estimates are forbidden placeholders.",
      "TEST payload content must never be committed, published, or summarized.",
    ],

    // ------------------------------------------------------------- sequencing
    requiredSequence: [
      "record this authorization durably (this record + master state)",
      "update docs/EVALUATION_AUTHORIZATION_REQUEST.md §8 decision block truthfully",
      "run governance validators BEFORE accessing TEST",
      "run the §3.5 leakage audit and require PASS",
      "prepare the harness",
      "execute exactly one governed benchmark covering BASE then CANDIDATE",
      "verify real results",
      "register results and update governance",
      "run all gates, commit, push",
    ],

    // ------------------------------------------------------------- provenance
    predecessorDecisionId: "DEC-0030",
    predecessorEvidence: "governance/DEC-0030-kaggle-execution-acceptance.json",
    authorizationRequestDoc: "docs/EVALUATION_AUTHORIZATION_REQUEST.md",
    leakageAuditProcedure: "docs/RESEARCH_BENCHMARK.md §3.5",
    leakageAuditRecord: "governance/EVALUATION-LEAKAGE-AUDIT.json",
    closedBlockerId: "BLK-0003",

    // --------------------------------------------------- pre-execution lifecycle
    evaluationStatusBefore: "EVALUATION_READY_AWAITING_AUTHORIZATION",
    evaluationStatusAfter: "EVALUATION_AUTHORIZED_AWAITING_EXECUTION",
    evaluationExecuted: false,
    evaluationCompleted: false,
    note:
      "This record authorizes the benchmark and closes the authorization blocker. It does NOT " +
      "record any score: evaluation has not executed, so every M1-M13 value remains null. " +
      "Training stays COMPLETED, the candidate stays EXPERIMENTAL/unpromoted, and " +
      "GHARIBO-V0.1 stays NOT_CREATED.",
  };
}

function main() {
  const checkMode = process.argv.includes("--check");
  const body = evaluationAuthorizationBody();
  const record = { ...body, authorizationHash: sha256Canonical(body) };
  const text = JSON.stringify(record, null, 2) + "\n";
  const out = resolve(ROOT, OUT_REL);

  if (checkMode) {
    if (!existsSync(out)) {
      console.error(`build-dec0032 --check: ${OUT_REL} does not exist`);
      process.exit(1);
    }
    if (readFileSync(out, "utf8") !== text) {
      console.error(`build-dec0032 --check: ${OUT_REL} is stale — regenerate it`);
      process.exit(1);
    }
    console.log(`build-dec0032 --check: ${OUT_REL} is current (authorizationHash ${record.authorizationHash.slice(0, 12)}…)`);
    process.exit(0);
  }

  writeFileSync(out, text, "utf8");
  console.log(`wrote ${OUT_REL}`);
  console.log(`  decisionId        : ${record.decisionId}`);
  console.log(`  decision          : ${record.decision}`);
  console.log(`  decider           : ${record.deciderRole}`);
  console.log(`  scope             : ${record.scope}`);
  console.log(`  closes            : ${record.closedBlockerId}`);
  console.log(`  authorizationHash : ${record.authorizationHash}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
