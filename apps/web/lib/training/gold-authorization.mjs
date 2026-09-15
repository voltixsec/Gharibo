import { createHash } from "node:crypto";
/** Pure governance checks shared by preview, master validation and M3A. No I/O. */
export const ACCEPTED_GOLD_HASHES = Object.freeze({
  dataset: "84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5",
  train: "84025de18403b8660d9702877b2b6fd329cedb886cad0095ab67e4daa3828ad2",
  validation: "063fb4422aed247b3f92c0f0d5b1291af46fd4357ca48829a7e7f6ce98815787",
  test: "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",
});
export const ACCEPTED_QUALIFICATION_HASH =
  "6d15bcf5ff7b120f34c7cb968eab196be285ad92b4ad2e76c44412360113dcc0";
const SNAPSHOT = "ad1e011c55729f5447b324d35b4ad88d0a47d10f";
const PREVIEW = "f11e9c8eeac34888b3ca6679348093cd3a96a46fb95fd42ef3dd36cf8b18709c";
const RECIPE = "c2360979bf3de8d91a01ec1c9fe792acc7207ba25a20a94c610fa7084c7fdcdd";
const FREEZE = "unsloth-freeze-2026.09.15";
const READINESS = "AUTHORIZED_AWAITING_PACKAGE_ISSUANCE";

/** @param {any} state */
export function isAcceptedGoldPreviewState(state) {
  const training = state?.training;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];
  const qualification = training?.qualification;
  const preview = training?.packagePreview;
  if (training?.hasStarted !== false || training?.status !== "NOT_STARTED" ||
      state?.currentState?.trainingHasStarted !== false ||
      state?.currentState?.trainingStatus !== "NOT_STARTED" ||
      experiment?.trainingRunId !== null || experiment?.packageId !== null ||
      qualification?.status !== "QUALIFIED" || qualification?.ctoAccepted !== true ||
      qualification?.qualificationHash !== ACCEPTED_QUALIFICATION_HASH ||
      qualification?.reproducibility !== "IDENTICAL" ||
      qualification?.activeRuntimeAlignment !== "IDENTICAL" ||
      qualification?.modelCompatibilityStatus !== "QUALIFICATION_PASSED" ||
      ["optimizerCreated", "backwardExecuted", "optimizerStepExecuted", "trainingLoopExecuted",
        "modelParametersUpdated", "testDataAccessed", "autoFreezeApplied"]
        .some((key) => qualification?.[key] !== false) ||
      qualification?.outputHygieneVerified !== true || qualification?.manualFreezeApplied !== true ||
      training?.engine?.freezeApplied !== true ||
      training?.engine?.freezeSourceQualificationHash !== ACCEPTED_QUALIFICATION_HASH ||
      training?.engine?.freezeLabel !== FREEZE ||
      qualification?.freezeApplied !== true || qualification?.freezeLabel !== FREEZE ||
      preview?.status !== "PREVIEW_ONLY" || preview?.persisted !== false ||
      preview?.trainingAuthorized !== false || preview?.testUsage !== "HASH_INTEGRITY_ONLY" ||
      preview?.recordFormat !== "harmony-messages-v1" ||
      preview?.recipeHash !== RECIPE || preview?.qualificationHash !== ACCEPTED_QUALIFICATION_HASH ||
      preview?.engineFreeze !== FREEZE || preview?.declaredMinimumRecordsPerSplit !== null ||
      experiment?.environmentQualified !== true ||
      experiment?.qualificationHash !== ACCEPTED_QUALIFICATION_HASH ||
      experiment?.engineFreezeLabel !== FREEZE) return false;

  const decisions = Array.isArray(state?.decisions) ? state.decisions : [];
  const checkpoints = decisions.filter((decision) => decision?.id === "DEC-0025");
  const authorization = training.authorization;
  // Legacy state must have no checkpoint or partial authorization fields.
  if (experiment.trainingAuthorized === false) {
    return authorization === undefined && checkpoints.length === 0 &&
      qualification.experimentAuthorized === false &&
      experiment.readinessStatus === "ENV_QUALIFIED_AWAITING_EXPLICIT_AUTHORIZATION" &&
      ["authorizationDecisionId", "authorizedCodeSnapshot", "authorizedPreviewPackageId",
        "recipeHash", "authorizationQualificationHash", "authorizationEngineFreeze"]
        .every((key) => experiment[key] === undefined);
  }
  if (experiment.trainingAuthorized !== true || !authorization) return false;
  return state.masterStateVersion === "1.5.0" &&
    checkpoints.length === 1 && checkpoints[0].status === "ACCEPTED" &&
    checkpoints[0].date === "2026-09-15" && checkpoints[0].supersededBy === null &&
    authorization.status === READINESS && authorization.decisionId === "DEC-0025" &&
    authorization.authorizedAt === "2026-09-15" &&
    authorization.scope === "PACKAGE_AND_RUN_ISSUANCE_ONLY" &&
    authorization.authorizedCodeSnapshot === SNAPSHOT &&
    authorization.authorizedPreviewPackageId === PREVIEW && authorization.recipeHash === RECIPE &&
    authorization.qualificationHash === ACCEPTED_QUALIFICATION_HASH &&
    authorization.engineFreeze === FREEZE && authorization.datasetHash === ACCEPTED_GOLD_HASHES.dataset &&
    ["train", "validation", "test"].every((split) =>
      authorization.splitHashes?.[split] === ACCEPTED_GOLD_HASHES[split]) &&
    authorization.recordFormat === "harmony-messages-v1" &&
    authorization.testUsage === "HASH_INTEGRITY_ONLY" &&
    authorization.packageIssued === false && authorization.runIssued === false &&
    authorization.executionStarted === false && qualification.experimentAuthorized === true &&
    experiment.readinessStatus === READINESS && experiment.authorizationDecisionId === "DEC-0025" &&
    experiment.authorizedCodeSnapshot === SNAPSHOT && experiment.authorizedPreviewPackageId === PREVIEW &&
    experiment.recipeHash === RECIPE &&
    experiment.authorizationQualificationHash === ACCEPTED_QUALIFICATION_HASH &&
    experiment.authorizationEngineFreeze === FREEZE;
}

/** Issued state is a second exact checkpoint, never a generic authorization boolean. */
export function isIssuedGoldState(state) {
  const receipt = state?.training?.issuance;
  const authorization = state?.training?.authorization;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];
  const readiness = "ISSUED_AWAITING_EXPLICIT_EXECUTION_AUTHORIZATION";
  if (!receipt || !authorization || state.masterStateVersion !== "1.6.0" ||
      authorization.status !== readiness || authorization.packageIssued !== true ||
      authorization.runIssued !== true || authorization.executionStarted !== false ||
      experiment?.readinessStatus !== readiness || experiment?.runStatus !== "DRAFT" ||
      receipt.status !== "ISSUED_DRAFT" || receipt.decisionId !== "DEC-0025" ||
      receipt.runStatus !== "DRAFT" || receipt.packageCount !== 1 || receipt.runCount !== 1 ||
      receipt.executionAuthorized !== false || receipt.executionStarted !== false ||
      !/^[0-9a-f]{64}$/.test(receipt.packageId ?? "") || receipt.packageId === PREVIEW ||
      !/^[0-9a-f-]{36}$/.test(receipt.runId ?? "") ||
      receipt.packageId !== experiment.packageId || receipt.runId !== experiment.trainingRunId ||
      !/^[0-9a-f]{64}$/.test(receipt.manifestSha256 ?? "") ||
      !/^[0-9a-f]{64}$/.test(receipt.bundleSha256 ?? "") ||
      !/^[0-9a-f]{64}$/.test(receipt.checksumsSha256 ?? "")) return false;
  const binding = receipt.binding;
  if (!binding || binding.decisionId !== "DEC-0025" || binding.authorizedCodeSnapshot !== SNAPSHOT ||
      binding.authorizedPreviewPackageId !== PREVIEW || binding.recipeHash !== RECIPE ||
      binding.qualificationHash !== ACCEPTED_QUALIFICATION_HASH || binding.engineFreeze !== FREEZE ||
      binding.datasetHash !== ACCEPTED_GOLD_HASHES.dataset ||
      ["train", "validation", "test"].some((split) => binding.splitHashes?.[split] !== ACCEPTED_GOLD_HASHES[split]) ||
      binding.recordFormat !== "harmony-messages-v1" || binding.testUsage !== "HASH_INTEGRITY_ONLY" ||
      binding.executionAuthorized !== false || binding.executionStarted !== false ||
      !/^[0-9a-f]{64}$/.test(binding.sourceFilesHash ?? "")) return false;
  const sorted = (value) => Array.isArray(value) ? value.map(sorted) :
    value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])])) : value;
  const { receiptHash, ...body } = receipt;
  if (createHash("sha256").update(JSON.stringify(sorted(body))).digest("hex") !== receiptHash) return false;
  const before = structuredClone(state);
  before.masterStateVersion = "1.5.0";
  before.training.authorization.status = READINESS;
  before.training.authorization.packageIssued = false;
  before.training.authorization.runIssued = false;
  before.experiments["GHARIBO-exp-001"].readinessStatus = READINESS;
  before.experiments["GHARIBO-exp-001"].packageId = null;
  before.experiments["GHARIBO-exp-001"].trainingRunId = null;
  return isAcceptedGoldPreviewState(before);
}

const ISSUED_PACKAGE =
  "78dd1bf374ed1c53785ea50bf179b1b7a4764d40c121d3d41cda4e2a2e3e68f2";
const ISSUED_RUN = "ea6e30f2-ce26-4323-b35a-3436ee867eaf";
const ISSUANCE_RECEIPT =
  "878b961f03ba069b82b4eb82530e7ebdfa4f8644ab159beff0a9adc7935f99bd";
const EXECUTION_READINESS =
  "EXECUTION_AUTHORIZED_QUEUED_AWAITING_KAGGLE_START";

/** Exact DEC-0026 checkpoint: QUEUED is authorized, RUNNING is not. */
export function isExecutionAuthorizedGoldState(state) {
  const training = state?.training;
  const authorization = training?.authorization;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];
  const issuance = training?.issuance;
  const execution = training?.executionAuthorization;

  if (!execution || !issuance || !authorization ||
      state?.masterStateVersion !== "1.7.0" ||
      training?.status !== "NOT_STARTED" ||
      training?.hasStarted !== false ||
      state?.currentState?.trainingStatus !== "NOT_STARTED" ||
      state?.currentState?.trainingHasStarted !== false ||
      authorization?.status !== EXECUTION_READINESS ||
      authorization?.packageIssued !== true ||
      authorization?.runIssued !== true ||
      authorization?.executionAuthorized !== true ||
      authorization?.executionStarted !== false ||
      experiment?.readinessStatus !== EXECUTION_READINESS ||
      experiment?.runStatus !== "QUEUED" ||
      experiment?.packageId !== ISSUED_PACKAGE ||
      experiment?.trainingRunId !== ISSUED_RUN ||
      issuance?.packageId !== ISSUED_PACKAGE ||
      issuance?.runId !== ISSUED_RUN ||
      issuance?.receiptHash !== ISSUANCE_RECEIPT ||
      issuance?.executionAuthorized !== false ||
      issuance?.executionStarted !== false ||
      execution?.status !== "EXECUTION_AUTHORIZED_QUEUED" ||
      execution?.decisionId !== "DEC-0026" ||
      execution?.packageId !== ISSUED_PACKAGE ||
      execution?.runId !== ISSUED_RUN ||
      execution?.issuanceReceiptHash !== ISSUANCE_RECEIPT ||
      execution?.authorizedCodeSnapshot !== SNAPSHOT ||
      execution?.authorizedPreviewPackageId !== PREVIEW ||
      execution?.recipeHash !== RECIPE ||
      execution?.qualificationHash !== ACCEPTED_QUALIFICATION_HASH ||
      execution?.engineFreeze !== FREEZE ||
      execution?.datasetHash !== ACCEPTED_GOLD_HASHES.dataset ||
      ["train", "validation", "test"].some(
        (split) =>
          execution?.splitHashes?.[split] !== ACCEPTED_GOLD_HASHES[split],
      ) ||
      execution?.recordFormat !== "harmony-messages-v1" ||
      execution?.testUsage !== "HASH_INTEGRITY_ONLY" ||
      execution?.worker !== "kaggle" ||
      execution?.fromStatus !== "DRAFT" ||
      execution?.toStatus !== "QUEUED" ||
      execution?.executionAuthorized !== true ||
      execution?.kaggleStartAuthorized !== false ||
      execution?.executionStarted !== false ||
      execution?.trainingHasStarted !== false ||
      !/^[0-9a-f]{64}$/.test(execution?.authorizationHash ?? "")) {
    return false;
  }

  const decisions = Array.isArray(state?.decisions) ? state.decisions : [];
  const checkpoints = decisions.filter((decision) => decision?.id === "DEC-0026");

  if (checkpoints.length !== 1 ||
      checkpoints[0].status !== "ACCEPTED" ||
      checkpoints[0].supersededBy !== null) {
    return false;
  }

  const sorted = (value) =>
    Array.isArray(value)
      ? value.map(sorted)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value).sort().map((key) => [key, sorted(value[key])]),
          )
        : value;

  const { authorizationHash, ...body } = execution;
  const computed = createHash("sha256")
    .update(JSON.stringify(sorted(body)))
    .digest("hex");

  if (computed !== authorizationHash) return false;

  // Reconstruct the immediately previous issued-but-sealed checkpoint.
  const before = structuredClone(state);
  before.masterStateVersion = "1.6.0";
  before.training.authorization.status =
    "ISSUED_AWAITING_EXPLICIT_EXECUTION_AUTHORIZATION";
  before.training.authorization.executionAuthorized = false;
  before.training.authorization.executionStarted = false;
  before.experiments["GHARIBO-exp-001"].readinessStatus =
    "ISSUED_AWAITING_EXPLICIT_EXECUTION_AUTHORIZATION";
  before.experiments["GHARIBO-exp-001"].runStatus = "DRAFT";
  delete before.training.executionAuthorization;

  return isIssuedGoldState(before);
}

const KAGGLE_START_READINESS =
  "KAGGLE_START_AUTHORIZED_AWAITING_LAUNCH";
const START_LAUNCH_BUNDLE =
  "fec22ca290645035fc807f3cc6dec40c5f26389b18f490e932c4bd05e31cb4c0";
const START_NOTEBOOK =
  "f849aa41a8c4affbaae9b4e0d5cf049d14c818df3289619eba8b0a1471e33ddf";

/** The DEC-0026 execution authorization hash (referenced by later checkpoints). */
const EXECUTION_AUTHORIZATION_HASH =
  "8c089dd9c6967dd33c32f64128bc7e939e8019a27c2428897c23156a075d07bf";
/** The DEC-0027 start authorization hash (referenced by later checkpoints). */
const DEC0027_START_AUTHORIZATION_HASH =
  "4bb2d0b2d38ddd39ce85277c5806838a162620970adf07a6d52844ccf7b2734f";
/** The DEC-0027 artifact identity, preserved as historical evidence by DEC-0028. */
const DEC0027_NOTEBOOK_SHA256 = START_NOTEBOOK;
const DEC0027_LAUNCH_BUNDLE_HASH = START_LAUNCH_BUNDLE;

/**
 * DEC-0027 authorizes the exact QUEUED run to be submitted to Kaggle.
 * It does NOT claim launch acceptance or training start.
 */
export function isKaggleStartAuthorizedGoldState(state) {
  const training = state?.training;
  const authorization = training?.authorization;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];
  const start = training?.kaggleStartAuthorization;

  if (!start ||
      state?.masterStateVersion !== "1.8.0" ||
      training?.status !== "NOT_STARTED" ||
      training?.hasStarted !== false ||
      state?.currentState?.trainingStatus !== "NOT_STARTED" ||
      state?.currentState?.trainingHasStarted !== false ||
      authorization?.status !== KAGGLE_START_READINESS ||
      authorization?.kaggleStartAuthorized !== true ||
      authorization?.executionStarted !== false ||
      experiment?.readinessStatus !== KAGGLE_START_READINESS ||
      experiment?.runStatus !== "QUEUED" ||
      start?.status !== "KAGGLE_START_AUTHORIZED" ||
      start?.decisionId !== "DEC-0027" ||
      start?.packageId !== ISSUED_PACKAGE ||
      start?.runId !== ISSUED_RUN ||
      start?.issuanceReceiptHash !== ISSUANCE_RECEIPT ||
      start?.executionAuthorizationHash !==
        state?.training?.executionAuthorization?.authorizationHash ||
      start?.launchBundleHash !== START_LAUNCH_BUNDLE ||
      start?.notebookSha256 !== START_NOTEBOOK ||
      start?.authorizedCodeSnapshot !== SNAPSHOT ||
      start?.recipeHash !== RECIPE ||
      start?.qualificationHash !== ACCEPTED_QUALIFICATION_HASH ||
      start?.engineFreeze !== FREEZE ||
      start?.datasetHash !== ACCEPTED_GOLD_HASHES.dataset ||
      ["train", "validation", "test"].some(
        (split) =>
          start?.splitHashes?.[split] !==
          ACCEPTED_GOLD_HASHES[split],
      ) ||
      start?.recordFormat !== "harmony-messages-v1" ||
      start?.testUsage !== "HASH_INTEGRITY_ONLY" ||
      start?.testPayloadIncluded !== false ||
      start?.testPayloadAccessed !== false ||
      start?.worker !== "kaggle" ||
      start?.accelerator !== "NvidiaTeslaT4" ||
      start?.expectedRunStatus !== "QUEUED" ||
      start?.startAuthorized !== true ||
      start?.launchAttempted !== false ||
      start?.launchAccepted !== false ||
      start?.executionStarted !== false ||
      start?.trainingHasStarted !== false ||
      !/^[0-9a-f]{64}$/.test(
        start?.startAuthorizationHash ?? "",
      )) {
    return false;
  }

  const decisions = Array.isArray(state?.decisions)
    ? state.decisions
    : [];

  const checkpoint = decisions.filter(
    (decision) => decision?.id === "DEC-0027",
  );

  if (checkpoint.length !== 1 ||
      checkpoint[0].status !== "ACCEPTED" ||
      checkpoint[0].supersededBy !== null) {
    return false;
  }

  const sorted = (value) =>
    Array.isArray(value)
      ? value.map(sorted)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map(
                (key) => [key, sorted(value[key])],
              ),
          )
        : value;

  const {
    startAuthorizationHash,
    ...body
  } = start;

  const computed = createHash("sha256")
    .update(JSON.stringify(sorted(body)))
    .digest("hex");

  if (computed !== startAuthorizationHash) {
    return false;
  }

  const before = structuredClone(state);

  before.masterStateVersion = "1.7.0";

  before.training.authorization.status =
    "EXECUTION_AUTHORIZED_QUEUED_AWAITING_KAGGLE_START";

  delete before.training.authorization.kaggleStartAuthorized;

  before.experiments["GHARIBO-exp-001"].readinessStatus =
    "EXECUTION_AUTHORIZED_QUEUED_AWAITING_KAGGLE_START";

  delete before.training.kaggleStartAuthorization;

  return isExecutionAuthorizedGoldState(before);
}

const REPAIRED_READINESS =
  "KAGGLE_LAUNCH_REPAIRED_AUTHORIZED_AWAITING_RETRY";
const REPAIRED_NOTEBOOK =
  "be4af0d4f9a492e7c6b5a2b713b205e17adf7d34d0d0f62aaf1589977cec54ba";
const REPAIRED_LAUNCH_BUNDLE =
  "4380da6382a1484ed41388661057c4a9c1c60f7ae34d612380a4b6f36da21230";
const REPAIR_CODE_SNAPSHOT = "200c1b7b2da65922489b88f4d180499d0afdd2dd";

/**
 * DEC-0028 repairs the launch artifact after the first DEC-0027 launch failed at
 * KernelWorkerStatus.ERROR inside the notebook's pinned-engine install cell.
 *
 * The governed recipe / model / dataset / splits / dependency set / TEST policy are
 * unchanged: only the notebook implementation and the launch-bundle generator moved.
 * DEC-0027 remains the historical record for the artifact it anchored and is
 * superseded for launch purposes only.
 */
export function isKaggleLaunchRepairedGoldState(state) {
  const training = state?.training;
  const authorization = training?.authorization;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];
  const launch = training?.kaggleLaunchAuthorization;

  if (!launch ||
      state?.masterStateVersion !== "1.9.0" ||
      training?.status !== "NOT_STARTED" ||
      training?.hasStarted !== false ||
      state?.currentState?.trainingStatus !== "NOT_STARTED" ||
      state?.currentState?.trainingHasStarted !== false ||
      authorization?.status !== REPAIRED_READINESS ||
      authorization?.kaggleStartAuthorized !== true ||
      authorization?.executionStarted !== false ||
      experiment?.readinessStatus !== REPAIRED_READINESS ||
      experiment?.runStatus !== "QUEUED" ||
      launch?.status !== "KAGGLE_LAUNCH_REPAIRED_AUTHORIZED" ||
      launch?.decisionId !== "DEC-0028" ||
      launch?.packageId !== ISSUED_PACKAGE ||
      launch?.runId !== ISSUED_RUN ||
      launch?.issuanceReceiptHash !== ISSUANCE_RECEIPT ||
      launch?.executionAuthorizationHash !== EXECUTION_AUTHORIZATION_HASH ||
      launch?.startAuthorizationHash !== DEC0027_START_AUTHORIZATION_HASH ||
      launch?.supersededNotebookSha256 !== DEC0027_NOTEBOOK_SHA256 ||
      launch?.supersededLaunchBundleHash !== DEC0027_LAUNCH_BUNDLE_HASH ||
      launch?.notebookSha256 !== REPAIRED_NOTEBOOK ||
      launch?.launchBundleHash !== REPAIRED_LAUNCH_BUNDLE ||
      launch?.authorizedCodeSnapshot !== REPAIR_CODE_SNAPSHOT ||
      launch?.recipeHash !== RECIPE ||
      launch?.qualificationHash !== ACCEPTED_QUALIFICATION_HASH ||
      launch?.engineFreeze !== FREEZE ||
      launch?.datasetHash !== ACCEPTED_GOLD_HASHES.dataset ||
      ["train", "validation", "test"].some(
        (split) => launch?.splitHashes?.[split] !== ACCEPTED_GOLD_HASHES[split],
      ) ||
      launch?.recordFormat !== "harmony-messages-v1" ||
      launch?.testUsage !== "HASH_INTEGRITY_ONLY" ||
      launch?.testPayloadIncluded !== false ||
      launch?.testPayloadAccessed !== false ||
      launch?.worker !== "kaggle" ||
      launch?.accelerator !== "NvidiaTeslaT4" ||
      launch?.expectedRunStatus !== "QUEUED" ||
      launch?.startAuthorized !== true ||
      launch?.launchAttempted !== false ||
      launch?.launchAccepted !== false ||
      launch?.executionStarted !== false ||
      launch?.trainingHasStarted !== false ||
      !/^[0-9a-f]{64}$/.test(launch?.launchAuthorizationHash ?? "")) {
    return false;
  }

  // The repair must not have moved the governed recipe or the physical data contract.
  const repair = launch?.repair;
  if (!repair ||
      !Array.isArray(repair.scope) || repair.scope.length === 0 ||
      ["recipeChanged", "modelChanged", "datasetChanged", "splitsChanged",
        "testPolicyChanged", "dependencySetChanged"].some((key) => repair[key] !== false)) {
    return false;
  }

  // Attempt 1 must be recorded truthfully: attempted, accepted, ERROR, no training.
  const attempts = launch?.launchAttemptHistory;
  if (!Array.isArray(attempts) || attempts.length !== 1) return false;
  const attempt = attempts[0];
  if (attempt?.attemptNumber !== 1 || attempt?.decisionId !== "DEC-0027" ||
      attempt?.artifactNotebookSha256 !== DEC0027_NOTEBOOK_SHA256 ||
      attempt?.artifactLaunchBundleHash !== DEC0027_LAUNCH_BUNDLE_HASH ||
      attempt?.externalStatus !== "KernelWorkerStatus.ERROR" ||
      attempt?.rootCauseClass !== "DEPENDENCY_INSTALL_FAILURE_WITH_DIAGNOSTIC_SUPPRESSED" ||
      attempt?.trainingStarted !== false ||
      attempt?.testPayloadUploaded !== false ||
      attempt?.testPayloadAccessed !== false) {
    return false;
  }

  // The governed recipe must be byte-identical to the DEC-0027 recipe.
  if (!state?.training?.kaggleStartAuthorization) return false;
  const sortedRecipe = (value) =>
    Array.isArray(value)
      ? value.map(sortedRecipe)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value).sort().map((key) => [key, sortedRecipe(value[key])]),
          )
        : value;
  if (
    JSON.stringify(sortedRecipe(launch.recipe)) !==
    JSON.stringify(sortedRecipe(state.training.kaggleStartAuthorization.recipe))
  ) {
    return false;
  }

  const decisions = Array.isArray(state?.decisions) ? state.decisions : [];
  const checkpoint = decisions.filter((decision) => decision?.id === "DEC-0028");
  const previous = decisions.filter((decision) => decision?.id === "DEC-0027");

  if (checkpoint.length !== 1 ||
      checkpoint[0].status !== "ACCEPTED" ||
      checkpoint[0].supersededBy !== null ||
      checkpoint[0].supersedes !== "DEC-0027" ||
      previous.length !== 1 ||
      previous[0].status !== "SUPERSEDED" ||
      previous[0].supersededBy !== "DEC-0028") {
    return false;
  }

  const sorted = (value) =>
    Array.isArray(value)
      ? value.map(sorted)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value).sort().map((key) => [key, sorted(value[key])]),
          )
        : value;

  const { launchAuthorizationHash, ...rest } = launch;
  if (
    createHash("sha256").update(JSON.stringify(sorted(rest))).digest("hex") !==
    launchAuthorizationHash
  ) {
    return false;
  }

  // Reconstruct the immediately previous DEC-0027 launch-start checkpoint.
  const before = structuredClone(state);
  before.masterStateVersion = "1.8.0";
  before.training.authorization.status = KAGGLE_START_READINESS;
  before.experiments["GHARIBO-exp-001"].readinessStatus = KAGGLE_START_READINESS;
  delete before.training.kaggleLaunchAuthorization;
  const previous0027 = before.decisions.find((decision) => decision?.id === "DEC-0027");
  previous0027.status = "ACCEPTED";
  previous0027.supersededBy = null;
  before.decisions = before.decisions.filter((decision) => decision?.id !== "DEC-0028");

  return isKaggleStartAuthorizedGoldState(before);
}

export function isAcceptedGoldGovernanceState(state) {
  return (
    isAcceptedGoldPreviewState(state) ||
    isIssuedGoldState(state) ||
    isExecutionAuthorizedGoldState(state) ||
    isKaggleStartAuthorizedGoldState(state) ||
    isKaggleLaunchRepairedGoldState(state)
  );
}
