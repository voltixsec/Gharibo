#!/usr/bin/env node
/**
 * build-dec0033-blocker.mjs — deterministic generator for the DEC-0033 record.
 *
 * DEC-0033 records the TRUTHFUL OUTCOME of the session that was authorized by DEC-0032 to
 * execute one governed held-out TEST benchmark:
 *
 *     the benchmark could NOT be executed, because no GPU execution environment was available.
 *
 * WHY THIS RECORD EXISTS
 * ----------------------
 * DEC-0032 hardStops[3] is explicit:
 *
 *   "An infrastructure failure before any valid metric-producing TEST inference must be
 *    recorded separately and MUST NOT be disguised as an evaluation result."
 *
 * This generator produces that separate record. It exists so that "we did not run it" is a
 * governed, hash-pinned fact rather than an absence that a later reader could mistake for an
 * oversight — or, worse, quietly fill in.
 *
 * WHAT THIS RECORD DOES NOT DO
 *   - it does not record any score. No TEST inference occurred, so every M1-M13 value stays null;
 *   - it does not mark evaluation complete or increment evaluationResults;
 *   - it does not revoke DEC-0032. Because no TEST inference materially occurred, the single
 *     authorized benchmark execution is NOT spent and remains available to the next attempt;
 *   - it does not promote, tune, retrain, or create GHARIBO-V0.1.
 *
 * DETERMINISM
 * ----------
 * The body is a pure constant: no clock, no filesystem, no environment. `recordedAt` is a fixed
 * literal so the blocker hash is stable across runs and machines.
 *
 * Usage:
 *   node scripts/eval/build-dec0033-blocker.mjs          # write governance/DEC-0033-*.json
 *   node scripts/eval/build-dec0033-blocker.mjs --check  # exit 1 if the file is stale
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "governance/DEC-0033-evaluation-infrastructure-blocker.json";

/** Canonical form: object keys sorted recursively (the repo-wide hash convention). */
export const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
      : value;

export const sha256Canonical = (value) =>
  createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

/** The DEC-0033 blocker body, minus its own hash. */
export function evaluationBlockerBody() {
  return {
    // ---------------------------------------------------------------- identity
    status: "EVALUATION_BLOCKED_ON_INFRASTRUCTURE",
    decisionId: "DEC-0033",
    supersedesDecisionId: null,
    recordKind: "INFRASTRUCTURE_BLOCKER_NOT_AN_EVALUATION_RESULT",

    recordedAt: "2026-09-16T00:00:00.000Z",
    recorderRole: "Delivery Director",
    recordDate: "2026-09-16",
    decision: "BENCHMARK NOT EXECUTED — INFRASTRUCTURE UNAVAILABLE",
    recordBasis: "docs/EVALUATION_EXECUTION_BLOCKER.md",

    // ------------------------------------------------------------- classification
    blockerClass: "INFRASTRUCTURE_NO_EXECUTION_ENVIRONMENT",
    blockerSubClass: "NO_GPU_COMPUTE_AVAILABLE",
    blockerPhase: "PRE_INFERENCE",
    testInferenceOccurred: false,
    testRecordsParsed: 0,
    metricValuesProduced: 0,

    // ------------------------------------------------- preconditions that DID hold
    // Every gating precondition was satisfied before the blocker was reached. Recording them
    // here is what distinguishes "the environment was missing" from "the governance was missing".
    preconditionsSatisfied: {
      authorizationRecorded: true,
      authorizationDecisionId: "DEC-0032",
      authorizationHash: "079afeb7088d0f731cb4175986a4d2ad7f3d35346046aac24ce57f8e6d5b3a96",
      nextDecisionIdVerifiedNotAssumed: true,
      blockerClosedOnlyThroughDecision: "BLK-0003",
      masterStateTransitioned: true,
      governanceValidatorsPassedBeforeTestAccess: true,
      leakageAuditStatus: "PASS",
      leakageAuditRecord: "governance/EVALUATION-LEAKAGE-AUDIT.json",
      splitDisjointnessProven: true,
      auditCohortQuarantined: true,
      testRecordCountVerified: 80,
      candidateAdapterIdentityVerified: true,
      baseModelRevisionPinned: true,
      promptPayloadProjected: true,
      scoringHarnessDeterministic: true,
      notRunRuleEnforcedStructurally: true,
    },

    // ------------------------------------------------------------------- the blocker
    reasons: [
      {
        id: "NO_LOCAL_GPU",
        detail:
          "The host has no CUDA device (nvidia-smi is absent) and 36 GB of system RAM. The pinned artifact openai/gpt-oss-20b is a ~20.9B-parameter model whose accepted runtime deviation is a float32 adapter (DEC-0030, MATERIAL_RUNTIME_DEVIATION_ACCEPTED_POST_EXECUTION). A float32 load at that scale needs roughly 40 GB of accelerator memory, so local execution was not viable and was ruled out before any attempt.",
      },
      {
        id: "NO_REMOTE_GPU_SESSION_COMPLETED",
        detail:
          "The mandated execution environment is a governed Kaggle T4 run: DEC-0032 forbids paid providers, and the zero-cost mandate (2026-09-14) excludes Colab. A Kaggle benchmark executes asynchronously — the kernel is pushed, queued, then runs unattended, and its outputs are retrievable only once the remote job finishes and is downloaded. The dependency-install stage alone was measured at dozens of minutes during the accepted qualification, and two inference arms over 80 records at up to 1024 new tokens are expected to add substantially more. That window exceeded the execution time available to this session.",
      },
      {
        id: "KERNEL_GENERATOR_UNREPAIRED",
        detail:
          "scripts/eval/build-eval-kernel.mjs had not been corrected or executed. Two defects were identified against the accepted production artifacts: (a) it used an ad-hoc %pip sequence instead of the accepted three-stage uv install discipline, which would produce an environment that is not the accepted engine freeze and would therefore make the benchmark incomparable to the qualification baseline; (b) it called apply_chat_template(..., return_tensors='pt', return_dict=True) directly on message dicts, whereas the proven production path renders with tokenize=False, add_generation_prompt=False to a string and tokenizes afterwards — and rendering is a frozen prompt/template rule under the benchmark specification. Pushing the unrepaired kernel would not have produced a trustworthy measurement.",
      },
    ],

    // ------------------------------------------------- what was deliberately not done
    notDone: [
      "TEST records parsed for inference",
      "BASE arm inference",
      "CANDIDATE arm inference",
      "M1-M13 measurement",
      "evaluationStatus set to a completed state",
      "evaluationResults incremented",
      "model promotion",
      "creation of GHARIBO-V0.1",
    ],

    // -------------------------------------------------- consequence for the grant
    authorizationConsumed: false,
    authorizationStillValid: true,
    authorizationStillValidReason:
      "DEC-0032 grants exactly ONE governed held-out TEST benchmark execution. No TEST inference materially occurred, so the grant is not spent. DEC-0032 hardStops[2] ('if TEST inference has materially occurred, the run MUST NOT be repeated merely because scores are disappointing') is therefore not triggered, and the next attempt may execute the benchmark without a new authorization decision provided the harness is first repaired and both arms run in a single execution.",

    // ------------------------------------------------------------------- standing state
    trainingStatusUnchanged: "COMPLETED",
    candidateStatusUnchanged: "EXPERIMENTAL_UNPROMOTED",
    ghariboV01StatusUnchanged: "NOT_CREATED",
    evaluationStatusUnchanged: "NOT_RUN",
    evaluationResultsUnchanged: 0,
    promotionPerformed: false,

    // ------------------------------------------------------------- honest scope note
    note:
      "This record states a fact about an execution environment, not a fact about the model. It carries NO score of any kind: no metric may exist before a real execution produces it (docs/RESEARCH_BENCHMARK.md 9), and 0, \"N/A\" and estimates are forbidden placeholders. GHARIBO-exp-001 remains an unmeasured, unpromoted experimental adapter.",

    // ------------------------------------------------------------------- references
    references: [
      "docs/EVALUATION_EXECUTION_BLOCKER.md",
      "docs/EVALUATION_AUTHORIZATION_REQUEST.md",
      "docs/EVALUATION.md",
      "docs/RESEARCH_BENCHMARK.md",
      "governance/DEC-0032-evaluation-authorization.json",
      "governance/EVALUATION-LEAKAGE-AUDIT.json",
      "governance/DEC-0030-kaggle-execution-acceptance.json",
      "scripts/eval/build-eval-kernel.mjs",
      "scripts/eval/leakage-audit.py",
    ],
  };
}

/** The full body including its own hash. */
export function evaluationBlockerRecord() {
  const body = evaluationBlockerBody();
  return { ...body, blockerHash: sha256Canonical(body) };
}

export function render() {
  return JSON.stringify(evaluationBlockerRecord(), null, 2) + "\n";
}

export function blockerHash() {
  return sha256Canonical(evaluationBlockerBody());
}

function main() {
  const checkMode = process.argv.includes("--check");
  const out = resolve(ROOT, OUT_REL);
  const text = render();

  if (checkMode) {
    if (!existsSync(out)) {
      console.error(`build-dec0033-blocker --check: ${OUT_REL} does not exist`);
      process.exit(1);
    }
    if (readFileSync(out, "utf8") !== text) {
      console.error(`build-dec0033-blocker --check: ${OUT_REL} is stale — regenerate it`);
      process.exit(1);
    }
    console.log(`build-dec0033-blocker --check: ${OUT_REL} is current (blockerHash ${blockerHash().slice(0, 12)}…)`);
    process.exit(0);
  }

  writeFileSync(out, text, "utf8");
  console.log(`wrote ${OUT_REL}`);
  console.log(`  decisionId  : DEC-0033`);
  console.log(`  blockerHash : ${blockerHash()}`);
  console.log(`  class       : INFRASTRUCTURE_NO_EXECUTION_ENVIRONMENT`);
  console.log(`  consumed    : false (the single authorized execution remains available)`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
