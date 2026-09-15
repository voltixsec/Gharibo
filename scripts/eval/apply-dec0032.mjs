#!/usr/bin/env node
/**
 * apply-dec0032.mjs — ONE-SHOT, IDEMPOTENT patch of the master state for DEC-0032.
 *
 * The master state is the canonical source of truth (ADR-0017), so the authorization must be
 * recorded there, not in prose. This script performs the *authorization* half of the change
 * only: it records the decision, closes BLK-0003 through it, and moves evaluation to the
 * authorized-but-not-executed state. It deliberately does NOT record any score — nothing has
 * executed yet.
 *
 * Run once:  node scripts/eval/apply-dec0032.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const JSON_REL = "governance/GHARIBO_MASTER_STATE.json";
const path = resolve(ROOT, JSON_REL);

const state = JSON.parse(readFileSync(path, "utf8"));

// ---------------------------------------------------------------- 1. decision index
if (!state.decisions.some((d) => d.id === "DEC-0032")) {
  state.decisions.push({
    id: "DEC-0032",
    date: "2026-09-15",
    title: "Authorize exactly one governed held-out TEST benchmark for GHARIBO-exp-001",
    status: "ACCEPTED",
    decision:
      "The CEO authorized evaluation on 2026-09-15 with the decision AUTHORIZED WITH LIMITS, scoped to ONE governed held-out TEST benchmark. Permitted: BASE inference (openai/gpt-oss-20b @ 6cee5e81ee83917806bbde320786a8fb61efebee, unadapted), CANDIDATE inference (the GHARIBO-exp-001 QLoRA adapter sha256 794917f25c4aa9e77acb6a746b69a703412539e993f6bfc1e8c602d64be678f == checkpoint-160 applied to that pinned base), M1-M13 measurement exactly as defined in docs/RESEARCH_BENCHMARK.md, and the required TEST access logging. Both arms run under the same harness, the same 80 TEST records, the same inference parameters, the same frozen prompt/template rules and the same scoring logic. Forbidden: training, tuning, any selection based on TEST outcomes, model promotion, dataset mutation, second-pass optimization, re-running GHARIBO-exp-001 and creating GHARIBO-V0.1. TEST may be parsed for inference only AFTER this authorization is durably recorded AND the docs/RESEARCH_BENCHMARK.md 3.5 leakage audit has PASSED. This decision closes blocker BLK-0003 and moves evaluation from EVALUATION_READY_AWAITING_AUTHORIZATION to EVALUATION_AUTHORIZED_AWAITING_EXECUTION. It records NO score: nothing has executed, so every M1-M13 value remains null and evaluation is NOT complete. Promotion remains forbidden even if CANDIDATE scores are excellent - measuring is not promoting.",
    rationale:
      "Held-out TEST was permanently held out for exactly this purpose, and every precondition the request listed was already satisfied and independently verifiable: training completed for real (DEC-0030), TEST had never been read (testUsage HASH_INTEGRITY_ONLY, testRecordsParsed 0), the split is content-addressed and reproducible under seed 20260914 from a committed generator, and the audit cohort is quarantined out of TEST structurally. Without an explicit recorded authorization the adapter would stay permanently unmeasurable, which is its own kind of governance fiction. The limits are not decorative: the same TEST that makes a result meaningful is destroyed as a holdout the moment it is used for any kind of selection, so authorization to MEASURE is kept strictly separate from authorization to ACT on the measurement (ADR-0008). The leakage audit is sequenced before the first parse because a contaminated run would produce a number that looks authoritative and is worthless.",
    scope: ["training", "experiments", "models", "datasets"],
    references: [
      "docs/EVALUATION_AUTHORIZATION_REQUEST.md",
      "docs/EVALUATION.md",
      "docs/RESEARCH_BENCHMARK.md",
      "docs/TRAINING_STRATEGY.md",
      "governance/DEC-0032-evaluation-authorization.json",
      "governance/EVALUATION-LEAKAGE-AUDIT.json",
      "governance/DEC-0030-kaggle-execution-acceptance.json",
      "governance/GHARIBO_MASTER_STATE.json",
      "scripts/eval/build-dec0032-authorization.mjs",
      "scripts/eval/leakage-audit.py",
    ],
    supersedes: null,
    supersededBy: null,
    architectureChanging: false,
  });
}

// ---------------------------------------------------------------- 2. blocker closure
const blk = state.blockers.find((b) => b.id === "BLK-0003");
if (blk) {
  blk.status = "CLOSED";
  blk.title = "Held-out TEST evaluation authorization obtained";
  blk.detail =
    "CLOSED 2026-09-15 by DEC-0032. The CEO authorized ONE governed held-out TEST benchmark " +
    "with the decision AUTHORIZED WITH LIMITS, scoped to BASE inference, CANDIDATE inference, " +
    "M1-M13 measurement and required access logging, and explicitly forbidding training, " +
    "tuning, selection, promotion, dataset mutation and second-pass optimization. The " +
    "docs/RESEARCH_BENCHMARK.md 3.5 leakage audit subsequently PASSED (TRAIN∩TEST=0, " +
    "VALIDATION∩TEST=0, AUDIT∩TEST=0, hash reproduction exact), which is the second and final " +
    "condition for parsing TEST. This closure authorizes measurement only - it does not record " +
    "a score and does not authorize promotion; GHARIBO-V0.1 stays NOT_CREATED.";
  blk.closedByDecisionId = "DEC-0032";
  blk.references = [
    "docs/EVALUATION_AUTHORIZATION_REQUEST.md",
    "docs/EVALUATION.md",
    "docs/RESEARCH_BENCHMARK.md",
    "governance/DEC-0032-evaluation-authorization.json",
    "governance/EVALUATION-LEAKAGE-AUDIT.json",
    "governance/DEC-0030-kaggle-execution-acceptance.json",
  ];
}

// ---------------------------------------------------- 3. evaluation lifecycle (pre-execution)
state.training.authorization.status = "EVALUATION_AUTHORIZED_AWAITING_EXECUTION";
state.training.authorization.evaluationAuthorizationDecisionId = "DEC-0032";
state.training.authorization.evaluationAuthorizationHash =
  "079afeb7088d0f731cb4175986a4d2ad7f3d35346046aac24ce57f8e6d5b3a96";

// The experiment record keeps evaluationStatus NOT_RUN: nothing has executed.
const exp = state.experiments["GHARIBO-exp-001"];
if (exp) {
  exp.readinessStatus = "EVALUATION_AUTHORIZED_AWAITING_EXECUTION";
  exp.evaluationAuthorizationDecisionId = "DEC-0032";
  exp.evaluationAuthorizationStatus = "AUTHORIZED_WITH_LIMITS";
}

// ------------------------------------------------------------------ 4. current state
state.currentState.blockerSummary =
  "DEC-0032 authorized exactly one governed held-out TEST benchmark (AUTHORIZED WITH LIMITS, " +
  "CEO, 2026-09-15) and closed BLK-0003; the docs/RESEARCH_BENCHMARK.md 3.5 leakage audit " +
  "PASSED (TRAIN∩TEST=0, VALIDATION∩TEST=0, AUDIT∩TEST=0). Evaluation is " +
  "EVALUATION_AUTHORIZED_AWAITING_EXECUTION - authorized but NOT executed, so no score exists. " +
  "Training stays COMPLETED, the adapter stays EXPERIMENTAL, and GHARIBO-V0.1 stays NOT_CREATED.";

// ------------------------------------------------------------- 5. next actions
const act1 = state.nextActions.find((a) => a.id === "ACT-0001");
if (act1) {
  act1.priority = "P0";
  act1.action =
    "Execute the ONE authorized governed held-out TEST benchmark (BASE then CANDIDATE) under " +
    "the identical harness and record the real M1-M13 scores. The leakage audit has already " +
    "PASSED, so TEST may be parsed for inference. Do NOT promote on the result: a separate " +
    "promotion decision is required.";
  act1.requires = "DEC-0032";
  act1.references = [
    "docs/EVALUATION.md",
    "docs/RESEARCH_BENCHMARK.md",
    "governance/DEC-0032-evaluation-authorization.json",
    "governance/EVALUATION-LEAKAGE-AUDIT.json",
  ];
}

// ------------------------------------------------------------------ 6. provenance
state.masterStateVersion = "1.13.0";
state.updatedAt = "2026-09-15";
state.history.push({
  revision: "1.13.0",
  date: "2026-09-15",
  summary:
    "Evaluation authorization recorded. DEC-0032 captures the CEO decision AUTHORIZED WITH " +
    "LIMITS for exactly one governed held-out TEST benchmark, closes BLK-0003 through that " +
    "decision, and moves evaluation to EVALUATION_AUTHORIZED_AWAITING_EXECUTION. The " +
    "RESEARCH_BENCHMARK.md 3.5 leakage audit PASSED before any TEST parse. No score is claimed: " +
    "evaluation has not executed, the adapter stays EXPERIMENTAL and GHARIBO-V0.1 stays " +
    "NOT_CREATED.",
  commit: null,
  commitStatus: "PENDING_CHECKPOINT",
  commitNote:
    "This checkpoint authorizes measurement. It records no score and does not constitute an " +
    "evaluation result.",
  changes: [
    "added DEC-0032 evaluation authorization (authorizationHash 079afeb7088d0f731cb4175986a4d2ad7f3d35346046aac24ce57f8e6d5b3a96)",
    "added governance/DEC-0032-evaluation-authorization.json (deterministic generator + --check drift mode)",
    "added governance/EVALUATION-LEAKAGE-AUDIT.json and scripts/eval/leakage-audit.py (RESEARCH_BENCHMARK.md 3.5 audit, hash/ID-only)",
    "closed BLK-0003 through DEC-0032 only",
    "evaluation EVALUATION_READY_AWAITING_AUTHORIZATION -> EVALUATION_AUTHORIZED_AWAITING_EXECUTION",
    "completed the docs/EVALUATION_AUTHORIZATION_REQUEST.md decision block truthfully",
    "kept evaluationStatus NOT_RUN, evaluationResults 0, GHARIBO-V0.1 NOT_CREATED",
  ],
  trainingExecuted: true,
});

writeFileSync(path, JSON.stringify(state, null, 2) + "\n", "utf8");
console.log("applied DEC-0032 to governance/GHARIBO_MASTER_STATE.json");
console.log("  masterStateVersion :", state.masterStateVersion);
console.log("  decisions          :", state.decisions.length);
console.log("  BLK-0003           :", blk?.status);
console.log("  authorization      :", state.training.authorization.status);
