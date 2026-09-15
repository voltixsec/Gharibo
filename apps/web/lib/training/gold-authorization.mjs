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

const REAUTHORIZED_READINESS = "KAGGLE_LAUNCH_REAUTHORIZED_AWAITING_RETRY";
const REAUTHORIZED_NOTEBOOK =
  "dda3b050034afa0922bda573565ff8f678767e62a944a01d597761aec254b4b1";
const REAUTHORIZED_LAUNCH_BUNDLE =
  "b3b4efc8f4b4c04eedd8610b6b4cdb479817d638e971ce8e8c9b67079d587efb";
const REAUTHORIZED_CODE_SNAPSHOT = "107cb4be7ae3d1f61c2d6852e432308342bc14e4";
const STAGED_INSTALL_PHASES = ["install", "frozen-no-deps", "support-no-deps"];

const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
      : value;

/**
 * DEC-0029 re-authorizes the launch artifact after attempt 2 failed at
 * KernelWorkerStatus.ERROR inside the pinned-engine install cell.
 *
 * The failure was a resolution-strategy defect, not a dependency-set defect: the whole
 * frozen set was submitted to ONE resolver transaction, and unsloth/unsloth_zoo cap
 * datasets below 4.4.0 while the frozen set pins datasets==5.0.1. Section 4 now
 * reproduces the accepted M3C qualification's staging (resolver stage + `--no-deps`
 * stage for the over-constrained pair + `--no-deps` torchao support stage).
 *
 * Every governed dependency is still installed at its declared spec. The recipe, model,
 * dataset, splits, engine freeze and TEST policy are unchanged, and DEC-0028 keeps every
 * evidence field it recorded - it is superseded for launch purposes only.
 */
export function isKaggleLaunchReauthorizedGoldState(state) {
  const training = state?.training;
  const authorization = training?.authorization;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];
  const launch = training?.kaggleLaunchReauthorization;

  if (!launch ||
      state?.masterStateVersion !== "1.10.0" ||
      training?.status !== "NOT_STARTED" ||
      training?.hasStarted !== false ||
      state?.currentState?.trainingStatus !== "NOT_STARTED" ||
      state?.currentState?.trainingHasStarted !== false ||
      authorization?.status !== REAUTHORIZED_READINESS ||
      authorization?.kaggleStartAuthorized !== true ||
      authorization?.executionStarted !== false ||
      experiment?.readinessStatus !== REAUTHORIZED_READINESS ||
      experiment?.runStatus !== "QUEUED" ||
      launch?.status !== "KAGGLE_LAUNCH_REAUTHORIZED" ||
      launch?.decisionId !== "DEC-0029" ||
      launch?.supersedesDecisionId !== "DEC-0028" ||
      launch?.packageId !== ISSUED_PACKAGE ||
      launch?.runId !== ISSUED_RUN ||
      launch?.issuanceReceiptHash !== ISSUANCE_RECEIPT ||
      launch?.executionAuthorizationHash !== EXECUTION_AUTHORIZATION_HASH ||
      launch?.startAuthorizationHash !== DEC0027_START_AUTHORIZATION_HASH ||
      launch?.supersededNotebookSha256 !== REPAIRED_NOTEBOOK ||
      launch?.supersededLaunchBundleHash !== REPAIRED_LAUNCH_BUNDLE ||
      launch?.notebookSha256 !== REAUTHORIZED_NOTEBOOK ||
      launch?.launchBundleHash !== REAUTHORIZED_LAUNCH_BUNDLE ||
      launch?.authorizedCodeSnapshot !== REAUTHORIZED_CODE_SNAPSHOT ||
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

  // The staged-install repair must be recorded, must be scoped to the resolution
  // strategy only, and must not have changed a single declared dependency.
  const staged = launch?.stagedInstallRepair;
  if (!staged ||
      staged.dependencySetChanged !== false ||
      staged.declaredSpecsUnchanged !== true ||
      !Array.isArray(staged.conflictingPair) || staged.conflictingPair.length !== 2 ||
      !staged.conflictingPair.includes("unsloth==2026.9.4") ||
      !staged.conflictingPair.includes("unsloth_zoo==2026.9.3") ||
      !Array.isArray(staged.stages) ||
      staged.stages.length !== STAGED_INSTALL_PHASES.length ||
      staged.stages.some((stage, index) => stage?.phase !== STAGED_INSTALL_PHASES[index]) ||
      !Array.isArray(staged.stages?.[0]?.specs) ||
      !staged.stages[0].specs.includes("datasets==5.0.1") ||
      staged.stages[0].specs.some((spec) => spec.startsWith("unsloth")) ||
      !Array.isArray(staged.stages?.[1]?.specs) ||
      !staged.stages[1].specs.includes("unsloth==2026.9.4") ||
      !staged.stages[1].specs.includes("unsloth_zoo==2026.9.3") ||
      !staged.stages?.[1]?.flags?.includes("--no-deps") ||
      !staged.stages?.[2]?.flags?.includes("--no-deps") ||
      staged?.preservedDependencies?.torch !== "2.10.0+cu128" ||
      staged?.preservedDependencies?.triton !== "3.6.0" ||
      !Array.isArray(staged?.qualificationPrecedent?.installPlan) ||
      staged.qualificationPrecedent.installPlan.length !== 3 ||
      staged?.qualificationPrecedent?.qualificationHash !== ACCEPTED_QUALIFICATION_HASH ||
      staged?.qualificationPrecedent?.activeRuntimeAlignment !== "IDENTICAL" ||
      staged?.resolverProof?.oldSingleTransactionResolved !== false ||
      staged?.resolverProof?.stage1ResolvedVersions?.datasets !== "5.0.1" ||
      staged?.resolverProof?.stage1ResolvedVersions?.tokenizers !== "0.22.2" ||
      staged?.resolverProof?.stage1ResolvedVersions?.["huggingface-hub"] !== "0.36.2") {
    return false;
  }

  // Both attempts must be recorded truthfully: accepted, ERROR, and no training.
  const attempts = launch?.launchAttemptHistory;
  if (!Array.isArray(attempts) || attempts.length !== 2) return false;
  const [first, second] = attempts;
  if (first?.attemptNumber !== 1 || first?.decisionId !== "DEC-0027" ||
      first?.artifactNotebookSha256 !== DEC0027_NOTEBOOK_SHA256 ||
      first?.artifactLaunchBundleHash !== DEC0027_LAUNCH_BUNDLE_HASH ||
      first?.externalStatus !== "KernelWorkerStatus.ERROR" ||
      first?.rootCauseClass !== "DEPENDENCY_INSTALL_FAILURE_WITH_DIAGNOSTIC_SUPPRESSED" ||
      first?.trainingStarted !== false ||
      first?.testPayloadUploaded !== false ||
      first?.testPayloadAccessed !== false) {
    return false;
  }
  if (second?.attemptNumber !== 2 || second?.decisionId !== "DEC-0028" ||
      second?.artifactNotebookSha256 !== REPAIRED_NOTEBOOK ||
      second?.artifactLaunchBundleHash !== REPAIRED_LAUNCH_BUNDLE ||
      second?.externalStatus !== "KernelWorkerStatus.ERROR" ||
      second?.rootCauseClass !== "FROZEN_SET_RESOLVER_UNSATISFIABLE_IN_SINGLE_TRANSACTION" ||
      second?.trainingStarted !== false ||
      second?.testPayloadUploaded !== false ||
      second?.testPayloadAccessed !== false) {
    return false;
  }

  // The governed recipe must be byte-identical to the DEC-0027 recipe.
  if (!training?.kaggleStartAuthorization) return false;
  if (
    JSON.stringify(canonical(launch.recipe)) !==
    JSON.stringify(canonical(training.kaggleStartAuthorization.recipe))
  ) {
    return false;
  }

  const decisions = Array.isArray(state?.decisions) ? state.decisions : [];
  const checkpoint = decisions.filter((decision) => decision?.id === "DEC-0029");
  const previous = decisions.filter((decision) => decision?.id === "DEC-0028");

  if (checkpoint.length !== 1 ||
      checkpoint[0].status !== "ACCEPTED" ||
      checkpoint[0].supersededBy !== null ||
      checkpoint[0].supersedes !== "DEC-0028" ||
      previous.length !== 1 ||
      previous[0].status !== "SUPERSEDED" ||
      previous[0].supersededBy !== "DEC-0029") {
    return false;
  }

  const { launchAuthorizationHash, ...rest } = launch;
  if (
    createHash("sha256").update(JSON.stringify(canonical(rest))).digest("hex") !==
    launchAuthorizationHash
  ) {
    return false;
  }

  // Reconstruct the immediately previous DEC-0028 launch-repair checkpoint. The DEC-0028
  // and DEC-0027 launch authorizations stay in the master state under their own keys, so
  // the previous predicate can be re-run against them unchanged.
  const before = structuredClone(state);
  before.masterStateVersion = "1.9.0";
  before.training.authorization.status = REPAIRED_READINESS;
  before.experiments["GHARIBO-exp-001"].readinessStatus = REPAIRED_READINESS;
  delete before.training.kaggleLaunchReauthorization;
  const previous0028 = before.decisions.find((decision) => decision?.id === "DEC-0028");
  previous0028.status = "ACCEPTED";
  previous0028.supersededBy = null;
  before.decisions = before.decisions.filter((decision) => decision?.id !== "DEC-0029");

  return isKaggleLaunchRepairedGoldState(before);
}

const COMPLETED_READINESS =
  "EXECUTION_COMPLETED_ACCEPTED_AWAITING_EVALUATION_AUTHORIZATION";
const COMPLETED_KERNEL_REF =
  "vokaigharibo/gharibo-exp-001-kaggle-start-fec22ca2";
const COMPLETED_KERNEL_VERSION = 3;
const COMPLETED_EXTERNAL_STATUS = "KernelWorkerStatus.COMPLETE";
const COMPLETED_GLOBAL_STEP = 160;
const COMPLETED_EPOCHS = 1;
const COMPLETED_ROLLUP =
  "788bc0a77d465bcbc997e8698177fbd90c9e8e2720e549159a27684095284885";
const COMPLETED_FINAL_ADAPTER =
  "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f";
const COMPLETED_CKPT_160 =
  "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f";
const COMPLETED_CKPT_150 =
  "5e062fa0bbba3c5276e3d6086f8e7dc0a7e1605c2dbf8c1d989ecbfe5a140249";
const COMPLETED_ACCEPTANCE_HASH =
  "06194e95c22b07a4c433154f627f20f515dbb43100e7615885345f6b0cb0c647";

/**
 * DEC-0030 accepts the POST-EXECUTION reality of the artifact DEC-0029 authorized.
 *
 * It is deliberately NOT a supersession: `supersedesDecisionId` is null because
 * DEC-0027/0028/0029 remain the true history of what was launched, and attempts 1 and 2
 * stay recorded as ERROR-before-training. What this checkpoint adds is the acceptance of
 * a completed run — including the fp16 -> float32 runtime deviation, which is recorded
 * rather than smoothed over — and the explicit refusal to promote a model or to treat
 * training completion as evaluation.
 */
export function isKaggleExecutionCompletedGoldState(state) {
  const training = state?.training;
  const authorization = training?.authorization;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];
  const completion = training?.executionCompletion;

  if (!completion ||
      state?.masterStateVersion !== "1.11.0" ||
      training?.status !== "COMPLETED" ||
      training?.hasStarted !== true ||
      state?.currentState?.trainingStatus !== "COMPLETED" ||
      state?.currentState?.trainingHasStarted !== true ||
      authorization?.status !== COMPLETED_READINESS ||
      experiment?.readinessStatus !== COMPLETED_READINESS ||
      experiment?.runStatus !== "COMPLETED" ||
      experiment?.evaluationStatus !== "NOT_RUN" ||
      completion?.status !== "KAGGLE_EXECUTION_COMPLETED_ACCEPTED" ||
      completion?.decisionId !== "DEC-0030" ||
      completion?.supersedesDecisionId !== null ||
      completion?.packageId !== ISSUED_PACKAGE ||
      completion?.runId !== ISSUED_RUN ||
      completion?.experimentId !== "GHARIBO-exp-001" ||
      completion?.issuanceReceiptHash !== ISSUANCE_RECEIPT ||
      completion?.executionAuthorizationHash !== EXECUTION_AUTHORIZATION_HASH ||
      completion?.startAuthorizationHash !== DEC0027_START_AUTHORIZATION_HASH ||
      completion?.launchAuthorizationHash !==
        training?.kaggleLaunchReauthorization?.launchAuthorizationHash ||
      completion?.recipeHash !== RECIPE ||
      completion?.qualificationHash !== ACCEPTED_QUALIFICATION_HASH ||
      completion?.engineFreeze !== FREEZE ||
      completion?.datasetHash !== ACCEPTED_GOLD_HASHES.dataset ||
      ["train", "validation", "test"].some(
        (split) => completion?.splitHashes?.[split] !== ACCEPTED_GOLD_HASHES[split],
      ) ||
      completion?.recordFormat !== "harmony-messages-v1") {
    return false;
  }

  // ---------------------------------------------------------------- external execution
  if (completion?.worker !== "kaggle" ||
      completion?.accelerator !== "NvidiaTeslaT4" ||
      completion?.kernelRef !== COMPLETED_KERNEL_REF ||
      completion?.kernelVersion !== COMPLETED_KERNEL_VERSION ||
      completion?.attemptNumber !== COMPLETED_KERNEL_VERSION ||
      completion?.artifactNotebookSha256 !== REAUTHORIZED_NOTEBOOK ||
      completion?.artifactLaunchBundleHash !== REAUTHORIZED_LAUNCH_BUNDLE ||
      completion?.externalStatus !== COMPLETED_EXTERNAL_STATUS ||
      completion?.executionStarted !== true ||
      completion?.trainingStarted !== true ||
      completion?.trainingCompleted !== true ||
      completion?.fromStatus !== "QUEUED" ||
      completion?.toStatus !== "COMPLETED") {
    return false;
  }

  // ------------------------------------------------------------- real training evidence
  const t = completion?.training;
  if (!t ||
      t.numExamples !== 640 ||
      t.numEpochs !== COMPLETED_EPOCHS ||
      t.totalSteps !== COMPLETED_GLOBAL_STEP ||
      t.globalStep !== COMPLETED_GLOBAL_STEP ||
      t.epoch !== 1 ||
      t.perDeviceTrainBatchSize !== 1 ||
      t.gradientAccumulationSteps !== 4 ||
      t.totalBatchSize !== 4 ||
      t.trainableParameters !== 3981312 ||
      !(t.trainRuntimeSeconds > 0) ||
      !(t.trainLoss > 0) ||
      t.loggedSteps !== COMPLETED_GLOBAL_STEP ||
      t.completionMarker !== "COMPLETED") {
    return false;
  }

  // ------------------------------------------- the fp16 -> float32 deviation, recorded
  const deviation = completion?.runtimeDeviation;
  if (!deviation ||
      deviation.declaredDtype !== "fp16" ||
      deviation.effectiveDtype !== "float32" ||
      deviation.classification !== "MATERIAL_RUNTIME_DEVIATION_ACCEPTED_POST_EXECUTION" ||
      deviation.operatorAuthored !== false ||
      deviation.engineImposed !== true ||
      deviation.recipeEditedRetroactively !== false ||
      deviation.packageDtypeFieldUnchanged !== true ||
      !Array.isArray(deviation.evidence) || deviation.evidence.length < 2) {
    return false;
  }

  // ------------------------------------------------------------------ TEST isolation
  const testPolicy = completion?.testPolicy;
  if (!testPolicy ||
      testPolicy.testPayloadUploaded !== false ||
      testPolicy.testPayloadAccessed !== false ||
      testPolicy.testUsage !== "HASH_INTEGRITY_ONLY" ||
      testPolicy.testRecordsParsed !== 0) {
    return false;
  }

  // ---------------------------------------------------------------- artifact evidence
  const artifacts = completion?.artifacts;
  if (!artifacts ||
      artifacts.checksumMismatches !== 0 ||
      artifacts.rollupHash !== COMPLETED_ROLLUP ||
      artifacts.rollupRecomputedMatches !== true ||
      artifacts.finalAdapterSha256 !== COMPLETED_FINAL_ADAPTER ||
      artifacts.checkpoint160Sha256 !== COMPLETED_CKPT_160 ||
      artifacts.checkpoint150Sha256 !== COMPLETED_CKPT_150 ||
      artifacts.completionMarker !== "COMPLETED") {
    return false;
  }

  // ------------------------------- completion must not smuggle in promotion or evaluation
  // An unevaluated run is never promotable: ADR-0008 gates promotion on at least one real
  // evaluation result, and `evaluationStatus` is NOT_RUN here by construction.
  if (completion?.evaluation?.status !== "NOT_RUN" ||
      completion?.evaluation?.executed !== false ||
      completion?.promotion?.promoted !== false ||
      completion?.promotion?.targetModel !== "GHARIBO-V0.1" ||
      experiment?.promotable !== false ||
      state?.training?.evaluationResults !== 0) {
    return false;
  }

  // ------------------------------- attempts 1 and 2 stay ERROR-before-training, verbatim
  const attempts = completion?.executionAttemptHistory;
  if (!Array.isArray(attempts) || attempts.length !== 3) return false;
  const [first, second, third] = attempts;
  if (first?.attemptNumber !== 1 || first?.decisionId !== "DEC-0027" ||
      first?.externalStatus !== "KernelWorkerStatus.ERROR" ||
      first?.trainingStarted !== false) return false;
  if (second?.attemptNumber !== 2 || second?.decisionId !== "DEC-0028" ||
      second?.externalStatus !== "KernelWorkerStatus.ERROR" ||
      second?.trainingStarted !== false) return false;
  if (third?.attemptNumber !== 3 || third?.decisionId !== "DEC-0029" ||
      third?.externalStatus !== COMPLETED_EXTERNAL_STATUS ||
      third?.trainingStarted !== true) return false;

  // --------------------------------------------------------------- acceptance hash + history
  const { acceptanceHash, ...body } = completion;
  if (createHash("sha256").update(JSON.stringify(canonical(body))).digest("hex") !==
      acceptanceHash) {
    return false;
  }
  if (acceptanceHash !== COMPLETED_ACCEPTANCE_HASH) return false;

  const decisions = Array.isArray(state?.decisions) ? state.decisions : [];
  const checkpoint = decisions.filter((decision) => decision?.id === "DEC-0030");
  const previous = decisions.filter((decision) => decision?.id === "DEC-0029");
  if (checkpoint.length !== 1 ||
      checkpoint[0].status !== "ACCEPTED" ||
      checkpoint[0].supersededBy !== null ||
      checkpoint[0].supersedes !== null ||
      previous.length !== 1 ||
      previous[0].status !== "ACCEPTED" ||
      previous[0].supersededBy !== null) {
    return false;
  }

  return isKaggleLaunchReauthorizedGoldState(preExecutionState(state));
}

/**
 * Reconstructs the DEC-0029 launch checkpoint exactly as it stood BEFORE DEC-0030
 * accepted the completed execution. DEC-0029 stays an ACCEPTED decision: DEC-0030
 * accepts its outcome rather than replacing its authority.
 *
 * Exported so the pre-execution predicates — and the regression tests that pin
 * them — stay meaningful after the state advanced, instead of silently passing
 * because the tip no longer matches their shape.
 */
export function preExecutionState(state) {
  const before = structuredClone(state);
  before.masterStateVersion = "1.10.0";
  before.training.status = "NOT_STARTED";
  before.training.hasStarted = false;
  before.currentState.trainingStatus = "NOT_STARTED";
  before.currentState.trainingHasStarted = false;
  before.training.authorization.status = REAUTHORIZED_READINESS;
  before.experiments["GHARIBO-exp-001"].readinessStatus = REAUTHORIZED_READINESS;
  before.experiments["GHARIBO-exp-001"].runStatus = "QUEUED";
  delete before.training.executionCompletion;
  before.decisions = before.decisions.filter((decision) => decision?.id !== "DEC-0030");
  return before;
}

export function isAcceptedGoldGovernanceState(state) {
  return (
    isAcceptedGoldPreviewState(state) ||
    isIssuedGoldState(state) ||
    isExecutionAuthorizedGoldState(state) ||
    isKaggleStartAuthorizedGoldState(state) ||
    isKaggleLaunchRepairedGoldState(state) ||
    isKaggleLaunchReauthorizedGoldState(state) ||
    isKaggleExecutionCompletedGoldState(state)
  );
}
