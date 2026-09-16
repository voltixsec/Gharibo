#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

const MASTER =
  "governance/GHARIBO_MASTER_STATE.json";

const AUTH =
  "governance/DEC-0046-evaluation-attempt-6-authorization.json";

const CHECK =
  process.argv.includes("--check");

function requireThat(ok, message) {
  if (!ok) throw new Error(`DEC-0046 master patch: ${message}`);
}

function readJson(path) {
  requireThat(existsSync(path), `missing ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function transform(source, auth) {
  const state = structuredClone(source);

  requireThat(
    ["1.24.0", "1.25.0"].includes(state.masterStateVersion),
    `unexpected starting masterStateVersion ${state.masterStateVersion}`,
  );

  requireThat(
    auth.decisionId === "DEC-0046" &&
    auth.authorizationHash ===
      "3afac20d638e033c13d875381b97005891d3946f3ba2ac336b04093b287bca93",
    "DEC-0046 authorization identity mismatch",
  );

  state.masterStateVersion = "1.25.0";
  state.updatedAt = "2026-09-16";

  // ------------------------------ current truth
  state.currentState.blockerSummary.blockingNow =
    "Evaluation Attempt #6 is AUTHORIZED WITH LIMITS by DEC-0046 and locally prepared. Exactly ONE Kaggle kernel push is available. No push has occurred yet and TEST inference has not begun.";

  state.currentState.blockerSummary.note =
    "Attempt #5 remains a preserved FAILED_PRE_INFERENCE historical fact under DEC-0045. The HF Hub post-install refresh repair passed 9/9 local regression checks and the Attempt #6 kernel passed 64/64 safety checks. Evaluation remains NOT_RUN, M1-M13 remain null, the candidate remains EXPERIMENTAL_UNPROMOTED, and GHARIBO-V0.1 remains NOT_CREATED.";

  // ------------------------------ DEC-0046 ledger row
  state.decisions =
    (state.decisions || []).filter(
      (d) => d?.id !== "DEC-0046",
    );

  state.decisions.push({
    id: "DEC-0046",
    date: "2026-09-16",
    title:
      "Authorize exactly one governed Evaluation Attempt #6 using the locally proven HF Hub post-install refresh repair",
    status: "ACCEPTED",
    decision:
      "Authorize exactly ONE governed Evaluation Attempt #6: ONE Kaggle kernel push maximum, BASE first then CANDIDATE over the SAME 80 held-out TEST prompts, using the frozen evaluation contract and the Attempt #6 artifact bound to notebook SHA256 eebd832d771467b8e468b8dbba946b7b7ff3e202f31ae52b6d76c2f1a7b0f48e and launch-bundle hash 598ec55dff3bbffb33beb9e6c1672ca1797abb80a74cc5f34e7300b592853275. TEST access, inference and scoring are authorized for that one execution only. Automatic retry, retraining, tuning, model selection, TEST-driven optimisation, promotion and GHARIBO-V0.1 creation remain forbidden.",
    rationale:
      "DEC-0045 truthfully closed Attempt #5 as a pre-inference failure caused during snapshot_download after a mixed in-memory huggingface_hub package state. The repair candidate from commit 05d923f4ed3cada9093263839ba4f3c25717614b was adopted only into a distinct Attempt #6 artifact, leaving Attempt #5 byte-identical. The repair passed 9/9 local regression checks, the generated Attempt #6 kernel passed 64/64 safety checks, the bundle is deterministic and prompts-only, and the CEO explicitly approved one further bounded execution.",
    scope: [
      "training",
      "experiments",
      "models",
      "integrations",
    ],
    references: [
      "governance/DEC-0046-evaluation-attempt-6-authorization.json",
      "governance/DEC-0045-evaluation-attempt-5-failure.json",
      "scripts/eval/build-dec0046-authorization.mjs",
      "scripts/eval/build-eval-kernel-attempt6.mjs",
      "scripts/eval/check-eval-kernel-attempt6.mjs",
      "scripts/eval/check-hfhub-refresh-barrier-attempt6.mjs",
      "scripts/eval/kaggle/gharibo-eval-002.ipynb",
      "scripts/eval/prepare-eval-launch-attempt6.mjs",
      "docs/RESEARCH_BENCHMARK.md",
    ],
    supersedes: null,
    supersededBy: null,
    architectureChanging: false,
  });

  // ------------------------------ dedicated Attempt #6 layer
  state.training.attempt6Authorization = {
    decisionId: "DEC-0046",
    record:
      "governance/DEC-0046-evaluation-attempt-6-authorization.json",
    authorizationHash:
      auth.authorizationHash,
    status:
      "AUTHORIZED_NOT_LAUNCHED",
    attemptNumber: 6,
    maximumKernelPushes: 1,
    kernelPushesPerformed: 0,
    kernelPushesRemaining: 1,
    automaticRetryAuthorized: false,

    testAccessAuthorized: true,
    inferenceAuthorized: true,
    scoringAuthorized: true,

    retrainingAuthorized: false,
    tuningAuthorized: false,
    modelSelectionAuthorized: false,
    promotionAuthorized: false,
    ghariboV01CreationAuthorized: false,

    authorizationSpentOnInferenceStart: true,
    authorizationSpent: false,
    authorizationConsumed: false,

    arms: [
      "base",
      "candidate",
    ],
    armOrder:
      "BASE_THEN_CANDIDATE",
    sameTestRecordsForBothArms: true,

    testRecordCount: 80,
    testSplitHash:
      auth.testSplitHash,

    candidateArmId:
      auth.candidateArmId,
    candidateAdapterSha256:
      auth.candidateAdapterSha256,

    baseModel:
      auth.baseModel,
    baseModelRevision:
      auth.baseModelRevision,

    loaderArchitecture:
      "IMMUTABLE_LOCAL_SNAPSHOT_WITH_POST_INSTALL_HFHUB_REFRESH",

    distributionRepo:
      auth.immutableDistributionRepo,
    immutableDistributionRevision:
      auth.immutableDistributionRevision,

    repairSourceCommit:
      auth.repairSourceCommit,
    repairRegressionChecksPassed:
      auth.repairRegressionChecksPassed,
    staticKernelChecksPassed:
      auth.staticKernelChecksPassed,
    repairLocallyProven:
      true,
    repairRuntimeProvenOnKaggle:
      false,

    notebookSha256:
      auth.notebookSha256,
    launchBundleHash:
      auth.launchBundleHash,
    promptsSha256:
      auth.promptsSha256,

    kernelId:
      auth.kernelId,
    datasetId:
      auth.datasetId,

    launchAttempted: false,
    testInferenceOccurred: false,
    metricValuesProduced: 0,

    priorAttemptFailureDecisionId:
      "DEC-0045",

    furtherAttemptRequiresNewHumanDecision:
      true,

    next:
      "ONE_GOVERNED_KAGGLE_PUSH_FOR_ATTEMPT_6",
  };

  // ------------------------------ additive current pointers
  const ea =
    state.training.evaluationAuthorization;

  ea.attempt6AuthorizationDecisionId =
    "DEC-0046";
  ea.attempt6AuthorizationHash =
    auth.authorizationHash;
  ea.attempt6AuthorizationRecord =
    "governance/DEC-0046-evaluation-attempt-6-authorization.json";
  ea.attempt6Status =
    "AUTHORIZED_NOT_LAUNCHED";
  ea.attempt6Number = 6;
  ea.attempt6MaximumKernelPushes = 1;
  ea.attempt6KernelPushesPerformed = 0;
  ea.attempt6KernelPushesRemaining = 1;
  ea.attempt6AutomaticRetryAuthorized = false;
  ea.attempt6NotebookSha256 =
    auth.notebookSha256;
  ea.attempt6LaunchBundleHash =
    auth.launchBundleHash;
  ea.attempt6PromptsSha256 =
    auth.promptsSha256;
  ea.attempt6KernelId =
    auth.kernelId;
  ea.attempt6RepairSourceCommit =
    auth.repairSourceCommit;
  ea.attempt6RepairLocallyProven = true;
  ea.attempt6RepairRuntimeProvenOnKaggle = false;
  ea.attempt6ExecutionAuthorized = true;
  ea.attempt6LaunchAttempted = false;
  ea.attempt6TestInferenceOccurred = false;
  ea.attempt6MetricValuesProduced = 0;

  // ------------------------------ experiment current state
  const exp =
    state.experiments?.["GHARIBO-exp-001"];

  requireThat(exp, "GHARIBO-exp-001 missing");

  exp.readinessStatus =
    "ATTEMPT_6_AUTHORIZED_AWAITING_EXECUTION";

  exp.evaluationAuthorizationDecisionId =
    "DEC-0046";

  exp.evaluationAuthorizationStatus =
    "AUTHORIZED_WITH_LIMITS_ONE_PUSH_AVAILABLE";

  exp.evaluationOutcomeDecisionId =
    "DEC-0045";

  exp.evaluationAttemptNumber = 6;
  exp.evaluationKernelPushesRemaining = 1;

  // ------------------------------ next action
  const action =
    (state.nextActions || [])
      .find((x) => x?.id === "ACT-0001");

  requireThat(action, "ACT-0001 missing");

  action.priority = "P0";

  action.action =
    "Execute the single DEC-0046-authorized Evaluation Attempt #6 Kaggle benchmark: BASE then CANDIDATE over the same 80 held-out TEST prompts using the frozen Attempt #6 artifact.";

  action.requires =
    "DEC-0046";

  action.references = [
    "governance/DEC-0046-evaluation-attempt-6-authorization.json",
    "scripts/eval/build-eval-kernel-attempt6.mjs",
    "scripts/eval/check-hfhub-refresh-barrier-attempt6.mjs",
  ];

  action.status =
    "READY_FOR_EXECUTION";

  action.note =
    "Exactly one Kaggle push is authorized. No automatic retry. If the run fails pre-inference, record the exact failure and STOP. Once TEST inference materially begins, the authorization is spent.";

  // ------------------------------ history
  state.history =
    (state.history || []).filter(
      (h) => h?.revision !== "1.25.0",
    );

  state.history.push({
    revision: "1.25.0",
    date: "2026-09-16",
    summary:
      "Accepted DEC-0046: one bounded Evaluation Attempt #6 using a distinct repaired artifact. Attempt #5 remains immutable historical evidence; no Kaggle push or TEST inference has occurred at this checkpoint.",
    commit: null,
    commitStatus:
      "PENDING_CHECKPOINT",
    commitNote:
      "This revision authorizes and binds the exact Attempt #6 artifact before execution. The containing Git commit is recorded externally after checkpointing.",
    changes: [
      "added DEC-0046 Attempt #6 authorization",
      "bound notebook SHA256 eebd832d771467b8e468b8dbba946b7b7ff3e202f31ae52b6d76c2f1a7b0f48e",
      "bound launch-bundle hash 598ec55dff3bbffb33beb9e6c1672ca1797abb80a74cc5f34e7300b592853275",
      "bound prompts SHA256 dcea32df3697921322afc33eae856bf6fd4e111785f63c4d399de7077e43f333",
      "recorded HF Hub post-install refresh repair as locally proven 9/9",
      "recorded Attempt #6 kernel safety gate as 64/64 PASS",
      "preserved Attempt #5 notebook and launch-bundle identities unchanged",
      "authorized exactly one Kaggle push with zero automatic retries",
      "kept evaluation NOT_RUN and GHARIBO-V0.1 NOT_CREATED",
    ],
    trainingExecuted: true,
  });

  return state;
}

const source = readJson(MASTER);
const auth = readJson(AUTH);
const target = transform(source, auth);

const rendered =
  JSON.stringify(target, null, 2) + "\n";

if (CHECK) {
  const current =
    readFileSync(MASTER, "utf8");

  if (current !== rendered) {
    console.error(
      "DEC-0046 master state is stale",
    );
    process.exit(1);
  }

  console.log(
    "DEC-0046 MASTER STATE PASS — 1.25.0",
  );
  process.exit(0);
}

writeFileSync(
  MASTER,
  rendered,
  "utf8",
);

console.log(
  "DEC-0046 applied to master state",
);
console.log(
  "masterStateVersion = 1.25.0",
);
console.log(
  "Attempt #6 = AUTHORIZED_NOT_LAUNCHED",
);
console.log(
  "Kaggle pushes remaining = 1",
);