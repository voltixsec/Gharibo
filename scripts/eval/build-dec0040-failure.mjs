#!/usr/bin/env node
/**
 * build-dec0040-failure.mjs — deterministic generator for the DEC-0040 attempt-#4 failure record.
 *
 * DEC-0040 records that evaluation attempt #4 FAILED PRE-INFERENCE, states the root cause that the
 * two logs actually support, and STOPS. It does not repair, it does not push a fifth time, and it
 * does not claim a partial result.
 *
 * WHAT IS ESTABLISHED, AND HOW
 * ---------------------------
 * Two facts come from the attempt-#4 log and the DEC-0037 log read side by side:
 *
 *   1. NO TEST INFERENCE OCCURRED. `verify-eval-failure-evidence.py` scans eight inference markers,
 *      finds none, and classifies the run pre-inference (4/4).
 *   2. THE FAILURE IS THE SAME DEFECT CLASS AS ATTEMPT #3 (DEF-0036-E) but with a DIFFERENT
 *      RESOLVED REVISION — and that difference is decisive:
 *        - DEC-0037 (PASS): `additional_chat_templates does not exist on "093fba69…"` — the
 *          distribution resolved to its pinned COMMIT SHA, and the load SUCCEEDED.
 *        - attempt #4 (FAIL): `additional_chat_templates does not exist on "main"` — the
 *          distribution resolved to the mutable branch name, and the SAME 404 was FATAL.
 *
 * WHY THE REVISION DIFFERED (the finding, stated with its limits)
 * ---------------------------------------------------------------
 * Attempt #4's log shows a Xet transport failure immediately before the load, and Unsloth's own
 * fallback forced a clean HTTP re-download. The resolved revision printed by the failing
 * `list_repo_templates` call is the ref NAME ("main"), not a commit SHA. The traceback is explicit:
 * `transformers/utils/hub.py::list_repo_templates` -> `HfApi.list_repo_tree(revision=...)` raises
 * `RemoteEntryNotFoundError` (404), and Unsloth's `loader_utils` / `loader.py` wrap that into a
 * fatal `RuntimeError: Unsloth: Could not load the tokenizer/processor`.
 *
 * WHAT IS *NOT* ESTABLISHED, AND IS THEREFORE NOT CLAIMED
 * ------------------------------------------------------
 * That the Xet transport error is the CAUSE of the revision falling back to "main". It precedes it
 * and is consistent with it, but causation is not proven by ordering alone: a resolve-then-404 race
 * on the hub side would produce the same two observations. The record states the correlation and
 * refuses the causal claim. What IS claimed is narrower and fully supported: at revision "main" the
 * 404 is fatal, and on the pinned SHA it is not.
 *
 * WHY THIS RECORD DOES NOT FIX IT
 * -------------------------------
 * The DEC-0038 authorization was bounded to ONE push, zero retries, and DEC-0039 recorded that zero
 * pushes remain. Supplying the pinned distribution revision to close this is a plausible one-line
 * change — and that is exactly why it must not be applied unilaterally: it is a HARNESS change made
 * in response to a FAULT, which is the repair loop DEC-0036 halted. The authorization for attempt
 * #4 is SPENT on its single push. Deciding whether to attempt a fifth time belongs to the CEO.
 *
 * Usage:
 *   node scripts/eval/build-dec0040-failure.mjs          # write the record
 *   node scripts/eval/build-dec0040-failure.mjs --check  # exit 1 if stale
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "governance/DEC-0040-evaluation-attempt-4-failure.json";

const NOTEBOOK_REL = "scripts/eval/kaggle/gharibo-eval-001.ipynb";
const BUNDLE_REL = "apps/web/data/kaggle-eval/gharibo-eval-001/launch-plan.json";
const LOG_REL =
  "apps/web/data/kaggle-eval/gharibo-eval-001/attempt4-output/gharibo-eval-001-fec22ca2.log";

export const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
      : value;

export const sha256Canonical = (value) =>
  createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

const sha256File = (rel) =>
  createHash("sha256")
    .update(readFileSync(resolve(ROOT, rel)))
    .digest("hex");

export function observedIdentities() {
  for (const rel of [NOTEBOOK_REL, BUNDLE_REL, LOG_REL]) {
    if (!existsSync(resolve(ROOT, rel))) {
      throw new Error(`build-dec0040: ${rel} is missing — the failure evidence must be present`);
    }
  }
  const notebookSha256 = sha256File(NOTEBOOK_REL);
  const plan = JSON.parse(readFileSync(resolve(ROOT, BUNDLE_REL), "utf8"));
  if (plan.notebookSha256 !== notebookSha256) {
    throw new Error("build-dec0040: notebook/bundle disagree — rebuild the bundle first");
  }
  return {
    notebookSha256,
    launchBundleHash: plan.launchBundleHash,
    logSha256: sha256File(LOG_REL),
  };
}

export function failureBody() {
  const { notebookSha256, launchBundleHash, logSha256 } = observedIdentities();
  return {
    status: "EVALUATION_ATTEMPT_4_FAILED_PRE_INFERENCE_NO_REPAIR",
    decisionId: "DEC-0040",
    supersedesDecisionId: null,
    amendsDecisionId: "DEC-0039",
    recordKind: "FAILURE_RECORD_AND_HALT_NOT_AN_EVALUATION_RESULT",
    recordRevision: 1,

    recordedAt: "2026-09-16T08:10:00.000Z",
    recorderRole: "Delivery Director",
    recordDate: "2026-09-16",
    decision:
      "RECORD THE ATTEMPT-#4 PRE-INFERENCE FAILURE, DO NOT REPAIR, DO NOT PUSH A FIFTH TIME, " +
      "AND ESCALATE THE CONTINUE/STOP QUESTION TO THE CEO",
    decisionBasis:
      "DEC-0038 authorized exactly ONE execution with no retry and DEC-0039 recorded one push with " +
      "zero remaining. The run failed before inference. Under those bounds the only permitted action " +
      "is to record the failure and stop.",
    recordBasis: "docs/EVALUATION_BENCHMARK_LAUNCH.md",

    // ---------------------------------------------------------------- the failure
    authorizationDecisionId: "DEC-0038",
    launchDecisionId: "DEC-0039",
    attemptNumber: 4,
    kernelId: "vokaigharibo/gharibo-eval-001-fec22ca2",
    kernelVersion: 3,
    kernelStatus: "KernelWorkerStatus.ERROR",
    launchOutcome: "FAILED_PRE_INFERENCE",
    failureClass: "HARNESS_DEFECT_NO_EXECUTION",
    failureDefectId: "DEF-0040-A",
    failurePhase: "MODEL_LOAD",
    failureCell: "In [6] (BASE model load)",
    failureException: "RuntimeError",
    failureMessage:
      "Unsloth: Could not load the tokenizer/processor. If you are offline, make sure the tokenizer " +
      "files exist in the checkpoint folder or were previously downloaded to the Hugging Face " +
      "cache, or set HF_HUB_OFFLINE=1 to force local loading. Otherwise please check that the model " +
      "has a tokenizer.",
    failureUnderlyingCause:
      "HTTPStatusError 404 on https://huggingface.co/api/models/unsloth/gpt-oss-20b-unsloth-bnb-4bit/" +
      "tree/main/additional_chat_templates?recursive=false&expand=false, surfacing as " +
      "RemoteEntryNotFoundError, raised from transformers/utils/hub.py::list_repo_templates -> " +
      "HfApi.list_repo_tree, then wrapped by unsloth/models/loader_utils.py and " +
      "unsloth/models/loader.py into the fatal RuntimeError.",
    failureReachedInstallStage: true,
    failureReachedModelLoad: true,
    failureModelObjectConstructed: false,
    failureProgressEvidence:
      "The run reached the furthest point of any attempt: pins loaded, both revisions asserted, " +
      "80 prompts loaded, all THREE governed install stages completed, and " +
      "FastLanguageModel.from_pretrained was entered. It died inside the BASE load, before the " +
      "tokenizer returned.",
    failureLogRecords: 259,
    failureLogOffsetWindowSeconds: { from: 5.34, to: 196.33 },
    failureLogRuntimeSecondsDerivedNote:
      "Kaggle logs carry RELATIVE offsets only. 196.33 s is the last relative log offset, not " +
      "wall-clock duration.",
    failureLogSha256: logSha256,

    // ---------------------------------------------------------------- the decisive comparison
    decisiveObservation:
      "The SAME 404 occurred in the DEC-0037 PASS, which means the 404 alone is not fatal. What " +
      "differs is the revision the distribution resolved to, and that difference is decisive.",
    decisiveComparison: {
      dec0037Pass: {
        printedBy: "additional_chat_templates does not exist on \"093fba6992ef5a7152481afec0bdfca1ac486998\"",
        resolvedRevision: "093fba6992ef5a7152481afec0bdfca1ac486998",
        resolvedRevisionKind: "IMMUTABLE_COMMIT_SHA",
        loadOutcome: "PASS",
        tokenizerClass: "PreTrainedTokenizerFast",
      },
      attempt4Fail: {
        printedBy: "additional_chat_templates does not exist on \"main\"",
        resolvedRevision: "main",
        resolvedRevisionKind: "MUTABLE_REF_NAME",
        loadOutcome: "FAIL",
        tokenizerClass: null,
      },
    },
    whatIsEstablished:
      "At the resolved revision \"main\" the additional_chat_templates 404 is FATAL; at the resolved " +
      "revision 093fba6992ef5a7152481afec0bdfca1ac486998 the identical 404 is NON-FATAL and the " +
      "tokenizer and BASE model load successfully. Both halves are observed, not inferred.",
    whatIsNotEstablished:
      "That the Xet transport error CAUSED the revision to fall back from the commit SHA to the ref " +
      "name. The transport warning immediately precedes the failure and is consistent with it, but " +
      "ordering is not proof: a hub-side resolve-then-404 race would produce the same two " +
      "observations. Transport causation is therefore recorded as UNPROVEN and must not be asserted.",
    transportEvidence:
      "[unsloth_zoo.hf_xet_fallback|WARNING] 'transient Xet transport error -- retrying with " +
      "HF_HUB_DISABLE_XET=1' followed by 'Unsafe partial ... could not be cleared; forcing a clean " +
      "HTTP re-download instead of an unsafe resume.'",

    // ---------------------------------------------------------------- pre-inference proof
    testInferenceOccurred: false,
    testInferenceEvidenceScript: "scripts/eval/verify-eval-failure-evidence.py",
    testInferenceEvidenceResult: "PASSED_4_OF_4_PRE_INFERENCE",
    testInferenceEvidenceDetail:
      "8 inference markers scanned and NONE present. Progress markers reached: pins loaded, prompts " +
      "loaded, install ran, model load attempted. No generation marker, no prediction file, no run " +
      "record.",
    predictionsProduced: {
      predictionsBase: false,
      predictionsCandidate: false,
      runRecord: false,
    },

    // ---------------------------------------------------------------- explicitly NOT done
    repairsPerformedByThisRecord: 0,
    kernelPushedByThisRecord: false,
    fifthAttemptAuthorized: false,
    furtherAttemptAuthorized: false,
    furtherAttemptRequiresNewHumanDecision: true,
    furtherAttemptRequiresNewHumanDecisionReason:
      "Supplying the pinned distribution revision to the loader is a plausible and small change — " +
      "and it is precisely a harness change made in response to a fault. DEC-0036 halted that loop " +
      "and DEC-0038 bounded this attempt to one push with zero retries. Applying the fix without an " +
      "explicit new decision would be the same self-re-authorizing behaviour the halt was written " +
      "to stop.",
    remediesIdentifiedButNotApplied: [
      "Pin the distribution revision explicitly when loading, so the resolution cannot fall back " +
        "from the commit SHA to the ref name.",
      "Force HF_HUB_DISABLE_XET=1 for the load so the transport fallback path is never taken.",
      "Pre-download the distribution into the image/working directory and load from a local path, " +
        "removing the hub round-trip from the critical path.",
      "Conclude that the free-tier T4 path cannot reproducibly load this distribution for the " +
        "governed run and re-scope the benchmark.",
    ],
    remediesNote:
      "These are observations offered for the CEO's decision. This record applies NONE of them and " +
      "does not recommend one over another.",

    // ---------------------------------------------------------------- the pattern
    attemptHistory: [
      { attempt: 1, decisionId: "DEC-0034", defectId: "DEF-0034-A", phase: "PRE_INSTALL" },
      { attempt: 2, decisionId: "DEC-0035", defectId: "DEF-0035-D", phase: "MODEL_LOAD" },
      { attempt: 3, decisionId: "DEC-0036", defectId: "DEF-0036-E", phase: "MODEL_LOAD" },
      { attempt: 4, decisionId: "DEC-0040", defectId: "DEF-0040-A", phase: "MODEL_LOAD" },
    ],
    launchAttemptsTotal: 4,
    defectClassesFound: 6,
    harnessRepairs: 2,
    metricValuesProduced: 0,
    patternFinding:
      "Attempt #4 reached the same phase as attempts #2 and #3 and failed there. Three of the four " +
      "attempts have now died at MODEL_LOAD, and the last two died on the SAME 404 with a working " +
      "counter-example (DEC-0037) already in hand. The convergent reading is that this free-tier " +
      "runtime does not reproducibly load the distribution, not that a further one-line harness fix " +
      "is waiting to be found.",

    // ---------------------------------------------------------------- authorization accounting
    authorizationSpent: true,
    authorizationSpentRule:
      "DEC-0038 states the authorization is SPENT when TEST inference begins. It did not begin, so " +
      "`spent` in its strict sense is not triggered — but the ONE-PUSH BOUND is fully consumed: " +
      "DEC-0039 recorded zero pushes remaining, and this record performed none. The attempt is " +
      "therefore EXHAUSTED rather than spent, and a fifth attempt requires a new decision either way.",
    authorizationState: "EXHAUSTED_ONE_PUSH_CONSUMED_ZERO_REMAINING",
    authorizationWasBoundedToOnePush: true,
    kernelPushesPerformedAcrossAttempt4: 1,
    kernelPushesRemaining: 0,
    retriesPerformed: 0,

    // ---------------------------------------------------------------- honesty at record time
    testRecordsParsedLocally: 0,
    predictionsDownloaded: false,
    scoringPerformed: false,
    evaluationStatus: "NOT_RUN",
    evaluationResults: 0,
    metricValuesProducedReal: 0,
    metricValuesRemainNull: true,
    metricValuesAreNotPlaceholders:
      "M1-M13 are null. Four attempts and six defect classes have produced ZERO measurements. A null " +
      "is written as null: never as 0, never as 'N/A', never as an estimate.",

    // ---------------------------------------------------------------- standing state
    trainingStatusUnchanged: "COMPLETED",
    candidateStatusUnchanged: "EXPERIMENTAL_UNPROMOTED",
    ghariboV01StatusUnchanged: "NOT_CREATED",
    promotionPerformed: false,
    tuningPerformed: false,
    selectionPerformed: false,
    datasetMutated: false,
    testDrivenCodeOptimisationPerformed: false,
    ghariboV01Created: false,

    notebookSha256AsPushed: notebookSha256,
    launchBundleHashAsPushed: launchBundleHash,

    note:
      "Attempt #4 failed pre-inference and is recorded as a failure. No TEST inference occurred " +
      "(8 markers scanned, none present), so no measurement exists and M1-M13 remain null. The " +
      "decisive finding is that the 404 which killed the run is NOT inherently fatal — DEC-0037 " +
      "survived the identical 404 at the pinned commit SHA — and that attempt #4 hit it at revision " +
      "'main'. Whether the Xet transport error caused that fallback is UNPROVEN and is not asserted. " +
      "The plausible remedies are named and NONE is applied: this attempt was bounded to one push, " +
      "zero pushes remain, and a fifth attempt requires a new explicit human decision. The harness-" +
      "repair loop stays halted.",

    references: [
      "governance/DEC-0038-evaluation-attempt-4-authorization.json",
      "governance/DEC-0039-evaluation-attempt-4-launch.json",
      "governance/DEC-0037-diagnostic-authorization.json",
      "governance/DEC-0036-evaluation-escalation.json",
      "docs/EVALUATION_BENCHMARK_LAUNCH.md",
      "docs/EVALUATION_EXECUTION_BLOCKER.md",
      "docs/RESEARCH_BENCHMARK.md",
      "scripts/eval/verify-eval-failure-evidence.py",
    ],
  };
}

export function failureRecord() {
  const body = failureBody();
  return { ...body, failureHash: sha256Canonical(body) };
}

export function render() {
  const ordered = failureBody();
  const record = failureRecord();
  return JSON.stringify({ ...ordered, failureHash: record.failureHash }, null, 2) + "\n";
}

export function failureHash() {
  return failureRecord().failureHash;
}

function main() {
  const check = process.argv.includes("--check");
  const out = resolve(ROOT, OUT_REL);
  const text = render();

  if (check) {
    if (!existsSync(out)) {
      console.error(`build-dec0040 --check: ${OUT_REL} does not exist`);
      process.exit(1);
    }
    if (readFileSync(out, "utf8") !== text) {
      console.error(`build-dec0040 --check: ${OUT_REL} is stale — regenerate it`);
      process.exit(1);
    }
    console.log(
      `build-dec0040 --check: ${OUT_REL} is current (failureHash ${failureHash().slice(0, 12)}…)`,
    );
    process.exit(0);
  }

  writeFileSync(out, text, "utf8");
  console.log(`wrote ${OUT_REL}`);
  console.log(`  decision : DEC-0040 — attempt #4 FAILED PRE-INFERENCE, no repair, STOP`);
  console.log(`  defect   : DEF-0040-A (MODEL_LOAD; 404 at resolved revision "main")`);
  console.log(`  metrics  : ZERO — M1-M13 remain null`);
  console.log(`  failureHash: ${failureHash()}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
