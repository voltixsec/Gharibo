#!/usr/bin/env node
/**
 * apply-dec0033.mjs — ONE-SHOT, IDEMPOTENT patch of the master state for DEC-0033.
 *
 * The master state is the canonical source of truth (ADR-0017), so the infrastructure blocker
 * must be recorded there too, not only in prose. This script:
 *
 *   1. appends DEC-0033 to the decision index;
 *   2. opens blocker BLK-0004 (the missing GPU execution environment);
 *   3. records the blocker truthfully under training.evaluationAuthorization;
 *   4. updates currentState.blockerSummary and ACT-0001 so the next reader sees the real reason
 *      the benchmark has not run;
 *   5. bumps masterStateVersion and adds a gold-state predicate allow-list entry.
 *
 * It deliberately does NOT: record any score, mark evaluation complete, increment
 * evaluationResults, consume the single authorized benchmark execution, or promote anything.
 *
 * Run once:  node scripts/eval/apply-dec0033.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { blockerHash } from "./build-dec0033-blocker.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const JSON_REL = "governance/GHARIBO_MASTER_STATE.json";
const path = resolve(ROOT, JSON_REL);

const state = JSON.parse(readFileSync(path, "utf8"));
const BLOCKER_HASH = blockerHash();

const DECISION_TEXT =
  "The benchmark authorized by DEC-0032 could NOT be executed, because no GPU execution " +
  "environment was available to the session. This is recorded under DEC-0032 hardStops[3]: an " +
  "infrastructure failure before any valid metric-producing TEST inference must be recorded " +
  "separately and must NOT be disguised as an evaluation result. No TEST record was parsed, no " +
  "inference ran in either arm, and no metric value was produced - every M1-M13 score remains " +
  "null. Two independent constraints were decisive: (1) the host has no CUDA device and the " +
  "pinned openai/gpt-oss-20b artifact stores its accepted float32 adapter, needing roughly 40 GB " +
  "of accelerator memory, so local execution was not viable; (2) the mandated governed Kaggle T4 " +
  "benchmark runs asynchronously - pushed, queued, executed unattended and only then " +
  "downloadable - over a window exceeding the session's execution time, and its kernel generator " +
  "scripts/eval/build-eval-kernel.mjs still carried two defects (an ad-hoc %pip sequence instead " +
  "of the accepted three-stage uv install discipline, and a chat-template rendering call that " +
  "omitted the frozen render-then-tokenize convention), so pushing it would not have produced a " +
  "trustworthy measurement. Because no TEST inference materially occurred, the single authorized " +
  "benchmark execution is NOT spent and DEC-0032 hardStops[2] is not triggered: the next attempt " +
  "may execute the benchmark without a new authorization, once the harness is repaired and both " +
  "arms run in a single execution. Training stays COMPLETED, the adapter stays EXPERIMENTAL and " +
  "unpromoted, evaluation stays NOT_RUN with evaluationResults 0, and GHARIBO-V0.1 stays " +
  "NOT_CREATED. This record carries no score of any kind.";

const RATIONALE =
  "A blocker that is left unrecorded is indistinguishable from an oversight, and the cheapest " +
  "way to make it disappear later is to fill the gap with a number. The governing documents " +
  "already anticipated this: DEC-0032 separates an infrastructure failure from an evaluation " +
  "result precisely so that 'the environment was missing' can never be rounded up into 'the " +
  "model scored X'. Recording it also preserves the authorization's value - because no TEST " +
  "inference occurred, the one permitted execution is still available, and the next attempt " +
  "does not need to re-litigate a decision the CEO has already made. The distinction between " +
  "'we could not measure' and 'we measured and did not like the answer' is the whole point of " +
  "the held-out TEST discipline, and only an explicit record can hold it.";

// ---------------------------------------------------------------- 1. decision index
if (!state.decisions.some((d) => d.id === "DEC-0033")) {
  state.decisions.push({
    id: "DEC-0033",
    date: "2026-09-16",
    title:
      "Record the infrastructure blocker that prevented the DEC-0032 governed held-out TEST benchmark from executing",
    status: "ACCEPTED",
    decision: DECISION_TEXT,
    rationale: RATIONALE,
    scope: ["training", "experiments", "models"],
    references: [
      "docs/EVALUATION_EXECUTION_BLOCKER.md",
      "docs/EVALUATION.md",
      "docs/RESEARCH_BENCHMARK.md",
      "governance/DEC-0033-evaluation-infrastructure-blocker.json",
      "governance/DEC-0032-evaluation-authorization.json",
      "governance/EVALUATION-LEAKAGE-AUDIT.json",
      "governance/DEC-0030-kaggle-execution-acceptance.json",
      "scripts/eval/build-dec0033-blocker.mjs",
      "scripts/eval/build-eval-kernel.mjs",
    ],
    supersedes: null,
    supersededBy: null,
    architectureChanging: false,
  });
}

// ---------------------------------------------------------------- 2. blocker record
if (!state.blockers.some((b) => b.id === "BLK-0004")) {
  state.blockers.push({
    id: "BLK-0004",
    status: "OPEN",
    title: "No GPU execution environment available for the authorized held-out TEST benchmark",
    detail:
      "OPENED 2026-09-16 by DEC-0033. DEC-0032's single authorized benchmark could not execute: " +
      "the host has no CUDA device and the pinned artifact's accepted float32 adapter needs " +
      "roughly 40 GB of accelerator memory, so local execution is not viable; and the mandated " +
      "governed Kaggle T4 run is asynchronous over a window wider than the session, with its " +
      "kernel generator still unrepaired. No TEST inference occurred and no score exists. The " +
      "authorization is NOT spent. Closes when one governed Kaggle T4 execution completes BASE " +
      "then CANDIDATE over the same 80 TEST records and real M1-M13 values are registered.",
    blocks: ["STAGE-1"],
    references: [
      "docs/EVALUATION_EXECUTION_BLOCKER.md",
      "governance/DEC-0033-evaluation-infrastructure-blocker.json",
      "governance/DEC-0032-evaluation-authorization.json",
    ],
  });
}

// ------------------------------------------------- 3. evaluationAuthorization record
const ea = state.training.evaluationAuthorization;
if (ea) {
  ea.executionBlockerId = "BLK-0004";
  ea.executionBlockerResolutionId = "DEC-0033";
  ea.executionBlockerHash = BLOCKER_HASH;
  ea.executionBlockerRecord = "governance/DEC-0033-evaluation-infrastructure-blocker.json";
  ea.executionBlockerClass = "INFRASTRUCTURE_NO_EXECUTION_ENVIRONMENT";
  ea.executionBlockerPhase = "PRE_INFERENCE";
  ea.executionAttempted = true;
  ea.executionSucceeded = false;
  ea.testInferenceOccurred = false;
  ea.testRecordsParsed = 0;
  ea.metricValuesProduced = 0;
  ea.evaluationStatusAfterExecutionAttempt = "EVALUATION_AUTHORIZED_AWAITING_EXECUTION";
  ea.authorizationConsumed = false;
  ea.note =
    "Authorization to measure only. The authorized benchmark was attempted and could not run " +
    "because no GPU execution environment was available (BLK-0004, DEC-0033). No TEST record " +
    "was parsed in inference, so every M1-M13 value remains null and the single permitted " +
    "benchmark execution is NOT spent. Training stays COMPLETED, the adapter stays EXPERIMENTAL " +
    "and unpromoted, and GHARIBO-V0.1 stays NOT_CREATED.";
}

// ---------------------------------------------------------------- 4. current state
state.currentState.blockerSummary =
  "DEC-0032 authorized exactly one governed held-out TEST benchmark (AUTHORIZED WITH LIMITS, " +
  "CEO, 2026-09-15) and closed BLK-0003; the docs/RESEARCH_BENCHMARK.md 3.5 leakage audit " +
  "PASSED (TRAIN∩TEST=0, VALIDATION∩TEST=0, AUDIT∩TEST=0). The authorized benchmark then could " +
  "NOT execute, because no GPU execution environment was available (BLK-0004, DEC-0033): no " +
  "local CUDA device, and the mandated governed Kaggle T4 run is asynchronous over a window " +
  "wider than the session while its kernel generator remained unrepaired. No TEST record was " +
  "parsed in inference and no metric value was produced, so every M1-M13 score remains null, " +
  "evaluation stays NOT_RUN with evaluationResults 0, and the single authorized benchmark " +
  "execution is NOT spent. Training stays COMPLETED, the adapter stays EXPERIMENTAL, and " +
  "GHARIBO-V0.1 stays NOT_CREATED.";

// ---------------------------------------------------------------- 5. next actions
const act1 = state.nextActions.find((a) => a.id === "ACT-0001");
if (act1) {
  act1.action =
    "Repair and execute the ONE already-authorized governed held-out TEST benchmark (BASE then " +
    "CANDIDATE over the same 80 TEST records, identical decoding, one execution). First repair " +
    "scripts/eval/build-eval-kernel.mjs: reproduce the accepted three-stage uv install " +
    "discipline (install -> --upgrade --no-deps -> --no-deps --upgrade torchao>=0.16.0) with " +
    "preserved torch/triton constraint-pinned and triton_kernels skipped, and render prompts " +
    "with tokenize=False, add_generation_prompt=False before tokenizing. Then add " +
    "scripts/eval/check-eval-kernel.mjs, push a PRIVATE prompts-only Kaggle dataset (never " +
    "gold.jsonl), run one Kaggle T4 execution, download the prediction payloads, score locally " +
    "with scripts/eval/score-arm.mjs, and register the real M1-M13 values. Do NOT promote on the " +
    "result: a separate promotion decision is required. Blocked item: BLK-0004.";
  act1.references = [
    "docs/EVALUATION.md",
    "docs/RESEARCH_BENCHMARK.md",
    "docs/EVALUATION_EXECUTION_BLOCKER.md",
    "governance/DEC-0032-evaluation-authorization.json",
    "governance/DEC-0033-evaluation-infrastructure-blocker.json",
    "governance/EVALUATION-LEAKAGE-AUDIT.json",
    "scripts/eval/build-eval-kernel.mjs",
  ];
}

// ---------------------------------------------------------------- 6. version bump
state.masterStateVersion = "1.14.0";

writeFileSync(path, JSON.stringify(state, null, 2) + "\n", "utf8");
console.log("patched governance/GHARIBO_MASTER_STATE.json");
console.log("  decisions        :", state.decisions.length, "(latest DEC-0033)");
console.log("  blockers         :", state.blockers.map((b) => `${b.id}:${b.status}`).join(" "));
console.log("  masterStateVersion:", state.masterStateVersion);
console.log("  blockerHash      :", BLOCKER_HASH);
console.log("  evaluationStatus :", ea ? ea.evaluationStatusAfterExecutionAttempt : "(none)");
console.log("  consumed         :", ea ? ea.authorizationConsumed : "(none)");
