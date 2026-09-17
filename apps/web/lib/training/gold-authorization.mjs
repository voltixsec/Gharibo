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
const EVALUATION_AUTHORIZED_READINESS =
  "EVALUATION_AUTHORIZED_AWAITING_EXECUTION";
const ECK_KERNEL_REF =
  "vokaigharibo/gharibo-exp-001-kaggle-start-fec22ca2";
/** The pinned base-model revision every governed arm must load, unadapted. */
const DEC0026_BASE_MODEL_REVISION = "6cee5e81ee83917806bbde320786a8fb61efebee";
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
 * The accepted execution state is pinned to an exact master-state revision so silent drift
 * cannot pass as "accepted". Exactly two revisions are known-good:
 *
 * - `1.11.0` — DEC-0030 acceptance of the completed run (the original freeze).
 * - `1.12.0` — DEC-0031, an ADDITIVE reconciliation: ADR-0020, the post-execution validator
 *   invariants, the Frozen-spec amendments, the ADR count 19 -> 20 and roadmap STAGE-1
 *   NOT_STARTED -> IN_PROGRESS. It changes no accepted execution fact — same run, same
 *   package, same artifacts, same hashes, same dtype deviation, still no evaluation and no
 *   promotion — so the 1.11.0 acceptance still holds verbatim inside it.
 *
 * Any further revision is NOT accepted until it is added here deliberately.
 *
 * `1.13.0` — DEC-0032 evaluation authorization. Also ADDITIVE: it records the CEO decision
 *   AUTHORIZED WITH LIMITS, closes BLK-0003, and moves evaluation to
 *   EVALUATION_AUTHORIZED_AWAITING_EXECUTION. It changes no accepted execution fact — same
 *   run, same package, same artifacts, same hashes, same dtype deviation, evaluation still
 *   NOT_RUN and still unpromoted — so the 1.11.0 acceptance holds verbatim inside it too.
 */
const COMPLETED_MASTER_STATE_VERSIONS = [
  "1.11.0",
  "1.12.0",
  "1.13.0",
  "1.14.0",
  "1.15.0",
  "1.16.0",
  "1.17.0", // DEC-0037 diagnostic only; accepted training facts are unchanged.
  "1.18.0", // DEC-0038 attempt-#4 authorization only; accepted training facts are unchanged.
  "1.19.0", // DEC-0039 attempt-#4 launch only; no result claimed, evaluation still NOT_RUN.
  "1.20.0", // DEC-0040 attempt-#4 pre-inference FAILURE; zero metrics, evaluation still NOT_RUN.
  "1.21.0", // DEC-0042 local-immutable-snapshot preflight; BLOCKED (diagnostic ImportError), zero metrics, evaluation still NOT_RUN.
];

/**
 * The DEC-0030 acceptance core, independent of the master-state revision.
 *
 * Split out from `isKaggleExecutionCompletedGoldState` so a LATER additive checkpoint
 * (DEC-0032) can assert "the DEC-0030 acceptance still holds, verbatim, and here is what
 * was added on top" without either duplicating the acceptance logic or loosening it. The
 * revision pin stays in the exported predicate; this core checks only what DEC-0030
 * accepted.
 *
 * The ONE field a later additive checkpoint may legitimately advance is the evaluation
 * readiness marker — DEC-0032 moves it from COMPLETED_READINESS to
 * EVALUATION_AUTHORIZED_READINESS without touching a single execution fact. Both values
 * are therefore admissible here, and `isKaggleExecutionCompletedGoldState` pins the
 * stricter COMPLETED_READINESS at the revision it froze.
 */
function acceptsCompletedExecutionCore(state) {
  const training = state?.training;
  const authorization = training?.authorization;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];
  const completion = training?.executionCompletion;
  const readinessIsPostCompletion =
    authorization?.status === COMPLETED_READINESS ||
    authorization?.status === EVALUATION_AUTHORIZED_READINESS;
  const experimentReadinessIsPostCompletion =
    experiment?.readinessStatus === COMPLETED_READINESS ||
    experiment?.readinessStatus === EVALUATION_AUTHORIZED_READINESS;

  if (!completion ||
      training?.status !== "COMPLETED" ||
      training?.hasStarted !== true ||
      state?.currentState?.trainingStatus !== "COMPLETED" ||
      state?.currentState?.trainingHasStarted !== true ||
      !readinessIsPostCompletion ||
      !experimentReadinessIsPostCompletion ||
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
      completion?.kernelRef !== ECK_KERNEL_REF ||
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
 * DEC-0030 accepts the POST-EXECUTION reality of the artifact DEC-0029 authorized.
 *
 * It is deliberately NOT a supersession: `supersedesDecisionId` is null because
 * DEC-0027/0028/0029 remain the true history of what was launched, and attempts 1 and 2
 * stay recorded as ERROR-before-training. What this checkpoint adds is the acceptance of
 * a completed run — including the fp16 -> float32 runtime deviation, which is recorded
 * rather than smoothed over — and the explicit refusal to promote a model or to treat
 * training completion as evaluation.
 *
 * The revision pin lives here: only the exact revisions in
 * `COMPLETED_MASTER_STATE_VERSIONS` are accepted as "the DEC-0030 acceptance", so silent
 * drift cannot pass as accepted.
 */
export function isKaggleExecutionCompletedGoldState(state) {
  if (!COMPLETED_MASTER_STATE_VERSIONS.includes(state?.masterStateVersion)) return false;
  // At the revisions this predicate froze (1.11.0 / 1.12.0) the readiness marker is pinned
  // exactly. Later revisions legitimately advanced it — 1.13.0 is DEC-0032 (authorization),
  // 1.14.0 is DEC-0033 (the infrastructure blocker), 1.15.0 is DEC-0034/DEC-0035 (the launch,
  // its pre-inference failure and the repaired relaunch) — and those are accepted through their
  // own predicates, which each re-run this core underneath. Listing them here keeps the
  // "current tip is an accepted completed execution" contract true without weakening it:
  // every post-1.12.0 revision still has to pass `acceptsCompletedExecutionCore` verbatim.
  const ADVANCED_READINESS_VERSIONS = [
    "1.13.0",
    "1.14.0",
    "1.15.0",
    "1.16.0",
    "1.17.0",
    "1.18.0",
    "1.19.0",
    "1.20.0",
    "1.21.0",
  ];
  if (!ADVANCED_READINESS_VERSIONS.includes(state?.masterStateVersion) &&
      (state?.training?.authorization?.status !== COMPLETED_READINESS ||
        state?.experiments?.["GHARIBO-exp-001"]?.readinessStatus !== COMPLETED_READINESS)) {
    return false;
  }
  // An advanced tip must NOT have moved evaluation or promotion forward.
  if (ADVANCED_READINESS_VERSIONS.includes(state?.masterStateVersion)) {
    if (state?.training?.evaluationResults !== 0) return false;
    if (state?.experiments?.["GHARIBO-exp-001"]?.evaluationStatus !== "NOT_RUN") return false;
    if (state?.experiments?.["GHARIBO-exp-001"]?.promotable !== false) return false;
  }
  return acceptsCompletedExecutionCore(state);
}

/**
 * DEC-0032 records the CEO decision AUTHORIZED WITH LIMITS for exactly one governed
 * held-out TEST benchmark.
 *
 * Like DEC-0031 it is ADDITIVE, not a supersession: the DEC-0030 acceptance must still
 * hold verbatim (`acceptsCompletedExecutionCore`), and DEC-0032 adds only the
 * authorization layer on top. What it must NOT do is move evaluation forward — so this
 * predicate explicitly requires that evaluation is still NOT_RUN, that
 * `evaluationResults` is still 0, and that the model is still unpromoted. Authorizing a
 * measurement is not taking it, and this predicate fails if anyone tries to conflate the
 * two.
 */
export function isEvaluationAuthorizedGoldState(state) {
  const training = state?.training;
  const authorization = training?.authorization;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];
  const evalAuthorization = training?.evaluationAuthorization;

  // The DEC-0030 acceptance must still hold verbatim underneath.
  if (!acceptsCompletedExecutionCore(state)) return false;

  // ...and evaluation must NOT have moved: authorization is not execution.
  if (training?.evaluationResults !== 0) return false;
  if (experiment?.evaluationStatus !== "NOT_RUN") return false;
  if (experiment?.promotable !== false) return false;
  if (experiment?.runStatus !== "COMPLETED") return false;

  if (authorization?.status !== EVALUATION_AUTHORIZED_READINESS ||
      experiment?.readinessStatus !== EVALUATION_AUTHORIZED_READINESS) {
    return false;
  }

  if (!evalAuthorization ||
      evalAuthorization.decisionId !== "DEC-0032" ||
      evalAuthorization.decision !== "AUTHORIZED WITH LIMITS" ||
      evalAuthorization.deciderRole !== "CEO" ||
      evalAuthorization.decisionDate !== "2026-09-15" ||
      evalAuthorization.scope !== "ONE_GOVERNED_HELD_OUT_TEST_BENCHMARK" ||
      evalAuthorization.authorizationHash !==
        "079afeb7088d0f731cb4175986a4d2ad7f3d35346046aac24ce57f8e6d5b3a96" ||
      evalAuthorization.testSplitHash !== ACCEPTED_GOLD_HASHES.test ||
      evalAuthorization.testRecordCount !== 80 ||
      evalAuthorization.candidateAdapterSha256 !== COMPLETED_FINAL_ADAPTER ||
      evalAuthorization.baseModelRevision !== DEC0026_BASE_MODEL_REVISION ||
      evalAuthorization.leakageAuditStatus !== "PASS" ||
      evalAuthorization.evaluationExecuted !== false ||
      evalAuthorization.evaluationCompleted !== false ||
      !Array.isArray(evalAuthorization.forbidden) ||
      !evalAuthorization.forbidden.includes("model promotion") ||
      !evalAuthorization.forbidden.includes("creating GHARIBO-V0.1")) {
    return false;
  }

  // BLK-0003 must be CLOSED, and closed by this decision specifically.
  const blocker = (state?.blockers || []).find((b) => b?.id === "BLK-0003");
  if (!blocker || blocker.status !== "CLOSED" || blocker.closedByDecisionId !== "DEC-0032") {
    return false;
  }

  // GHARIBO-V0.1 must still not exist.
  const v01 = (state?.models?.derivedModels || []).find((m) => m?.id === "GHARIBO-V0.1");
  if (!v01 || v01.status !== "NOT_CREATED") return false;

  const decisions = Array.isArray(state?.decisions) ? state.decisions : [];
  const checkpoint = decisions.filter((d) => d?.id === "DEC-0032");
  if (checkpoint.length !== 1 ||
      checkpoint[0].status !== "ACCEPTED" ||
      checkpoint[0].supersedes !== null ||
      checkpoint[0].supersededBy !== null) {
    return false;
  }

  // Rebuild the DEC-0030-only tip and require the original predicate to still accept it.
  const before = structuredClone(state);
  before.masterStateVersion = "1.12.0";
  before.training.authorization.status = COMPLETED_READINESS;
  before.experiments["GHARIBO-exp-001"].readinessStatus = COMPLETED_READINESS;
  delete before.training.evaluationAuthorization;
  delete before.blockers.find((b) => b?.id === "BLK-0003")?.closedByDecisionId;
  before.decisions = before.decisions.filter((d) => d?.id !== "DEC-0032");
  return isKaggleExecutionCompletedGoldState(before);
}

/**
 * DEC-0033 records the TRUTHFUL OUTCOME of the session DEC-0032 authorized: the benchmark
 * could not execute, because no GPU execution environment was available.
 *
 * This is still the AUTHORIZED / NOT-RUN family, so this predicate layers on top of
 * `isEvaluationAuthorizedGoldState` rather than replacing it. What it adds is the
 * requirement that the failure is stated as a failure:
 *
 *   - the blocker is recorded, OPEN, and attributed to DEC-0033;
 *   - `testInferenceOccurred` is false and `testRecordsParsed` is 0 — the claim that no
 *     measurement happened has to be machine-checkable, not asserted in prose;
 *   - the authorization is explicitly NOT consumed, because no TEST inference materially
 *     occurred and DEC-0032 hardStops[2] is therefore not triggered;
 *   - evaluation stays NOT_RUN with `evaluationResults` 0 and the model stays unpromoted.
 *
 * The point of this predicate is to make "we could not measure" fail loudly if anyone later
 * edits the state to look like "we measured". An infrastructure blocker is not a score, and
 * the one thing it must never become is a null dressed up as a zero.
 */
export function isEvaluationInfrastructureBlockedGoldState(
  state,
  {
    expectedBlockerStatus = "OPEN",
    expectedTestInferenceOccurred = false,
    expectedPostAttemptStatus = EVALUATION_AUTHORIZED_READINESS,
    expectedAuthorizationConsumed = false,
  } = {},
) {
  const training = state?.training;
  const evalAuthorization = training?.evaluationAuthorization;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];

  // The DEC-0032 authorization must still hold verbatim underneath.
  if (!isEvaluationAuthorizedGoldState(state)) return false;

  if (!evalAuthorization) return false;

  if (evalAuthorization.executionBlockerId !== "BLK-0004" ||
      evalAuthorization.executionBlockerResolutionId !== "DEC-0033" ||
      evalAuthorization.executionBlockerClass !== "INFRASTRUCTURE_NO_EXECUTION_ENVIRONMENT" ||
      evalAuthorization.executionBlockerPhase !== "PRE_INFERENCE" ||
      evalAuthorization.executionBlockerRecord !==
        "governance/DEC-0033-evaluation-infrastructure-blocker.json") {
    return false;
  }
  if (typeof evalAuthorization.executionBlockerHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(evalAuthorization.executionBlockerHash)) {
    return false;
  }

  // No measurement happened, and the state has to say so in machine-readable form.
  //
  // The four "advanced" fields below accept an override for the same reason `expectedBlockerStatus`
  // does: a later predicate that legitimately moves them (by LAUNCHING, without measuring) must be
  // able to re-run this predicate underneath without loosening it. Each override keeps exactly the
  // same strictness — the value must EQUAL what the caller declares — so omitting an override can
  // never disable a check, and declaring the wrong value still fails. What the override cannot do
  // is relax the invariant that actually matters here: no metric value was produced.
  if (evalAuthorization.executionAttempted !== true) return false;
  if (evalAuthorization.executionSucceeded !== false) return false;
  if (evalAuthorization.testInferenceOccurred !== expectedTestInferenceOccurred) return false;
  if (evalAuthorization.testRecordsParsed !== 0) return false;
  if (evalAuthorization.metricValuesProduced !== 0) return false;
  if (evalAuthorization.evaluationStatusAfterExecutionAttempt !== expectedPostAttemptStatus) {
    return false;
  }
  if (evalAuthorization.authorizationConsumed !== expectedAuthorizationConsumed) return false;

  // Evaluation must still not have moved.
  if (training?.evaluationResults !== 0) return false;
  if (experiment?.evaluationStatus !== "NOT_RUN") return false;
  if (experiment?.promotable !== false) return false;

  // The blocker must be recorded, OPEN, and attributable to this decision.
  //
  // `expectedBlockerStatus` exists so that later predicates which legitimately CLOSE this blocker
  // can still re-run this predicate underneath without having to loosen the assertion. The default
  // is "OPEN", so every existing caller keeps the original, strict behaviour; only a caller that
  // explicitly re-states the blocker's closed state passes anything else. Allowing the status to be
  // *omitted* would turn the check into a no-op, so it is a required-for-equality comparison.
  const blocker = (state?.blockers || []).find((b) => b?.id === "BLK-0004");
  if (!blocker || blocker.status !== expectedBlockerStatus) return false;

  // GHARIBO-V0.1 must still not exist.
  const v01 = (state?.models?.derivedModels || []).find((m) => m?.id === "GHARIBO-V0.1");
  if (!v01 || v01.status !== "NOT_CREATED") return false;

  const decisions = Array.isArray(state?.decisions) ? state.decisions : [];
  const record = decisions.filter((d) => d?.id === "DEC-0033");
  if (record.length !== 1 ||
      record[0].status !== "ACCEPTED" ||
      record[0].supersedes !== null ||
      record[0].supersededBy !== null) {
    return false;
  }

  // Rebuild the DEC-0032-only tip and require the previous predicate to still accept it.
  const before = structuredClone(state);
  before.masterStateVersion = "1.13.0";
  delete before.training.evaluationAuthorization.executionBlockerId;
  delete before.training.evaluationAuthorization.executionBlockerResolutionId;
  delete before.training.evaluationAuthorization.executionBlockerHash;
  delete before.training.evaluationAuthorization.executionBlockerRecord;
  delete before.training.evaluationAuthorization.executionBlockerClass;
  delete before.training.evaluationAuthorization.executionBlockerPhase;
  delete before.training.evaluationAuthorization.executionAttempted;
  delete before.training.evaluationAuthorization.executionSucceeded;
  delete before.training.evaluationAuthorization.testInferenceOccurred;
  delete before.training.evaluationAuthorization.testRecordsParsed;
  delete before.training.evaluationAuthorization.metricValuesProduced;
  delete before.training.evaluationAuthorization.evaluationStatusAfterExecutionAttempt;
  delete before.training.evaluationAuthorization.authorizationConsumed;
  before.blockers = before.blockers.filter((b) => b?.id !== "BLK-0004");
  before.decisions = before.decisions.filter((d) => d?.id !== "DEC-0033");
  return isEvaluationAuthorizedGoldState(before);
}

/**
 * DEC-0034 / DEC-0035 record the LAUNCH of the authorized benchmark, its PRE-INFERENCE failure,
 * and the repaired RELAUNCH. The kernel is in flight; no score exists.
 *
 * This is the most dangerous state the predicate layer has had to handle, because it is the first
 * in which TEST inference may ALREADY be happening. Two opposite failure modes have to be blocked
 * at once:
 *
 *   (a) ROUNDING UP. A launch is not a result. The state must not carry a single M1-M13 value,
 *       `evaluationResults` must stay 0, evaluation must stay NOT_RUN, and the model must stay
 *       unpromoted. If someone later writes a score into this state without a real
 *       metric-producing execution, this predicate fails.
 *
 *   (b) ROUNDING DOWN. The first launch genuinely FAILED, and that failure is a fact of the
 *       record — not a gap to be quietly overwritten by the successful relaunch. The predicate
 *       therefore requires the failure to still be stated, together with the machine-checkable
 *       claim that it occurred BEFORE any inference, which is exactly what makes the relaunch a
 *       RESTART of the same execution rather than a second (unauthorized) one.
 *
 * It also requires the forward-looking guarantee that closes the loop: no further attempt is
 * authorized, and any further attempt requires a new human decision. Without that, "one
 * execution" is a slogan rather than a constraint.
 *
 * LAYERING NOTE. This sits on `isEvaluationInfrastructureBlockedGoldState`, which asserts
 * BLK-0004 is OPEN — correct for the DEC-0033 tip it was written for, and false at this tip,
 * where the blocker is legitimately CLOSED. The predicate therefore passes the expected status
 * through explicitly and reconstructs the OPEN state before re-running the layer beneath. Passing
 * the status explicitly, rather than dropping the assertion, keeps the check strict: an omitted
 * status would silently disable it.
 */
export function isEvaluationBenchmarkLaunchedGoldState(state) {
  const training = state?.training;
  const evalAuthorization = training?.evaluationAuthorization;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];

  // The DEC-0033 blocker record must still hold underneath, with the launch-layer values
  // passed through explicitly rather than by weakening the assertions in the layer below.
  const launchLayerAccepted = isEvaluationInfrastructureBlockedGoldState(state, {
    expectedBlockerStatus: "CLOSED",
    expectedTestInferenceOccurred: "POSSIBLY_IN_FLIGHT",
    // NOTE: `evaluationStatusAfterExecutionAttempt` is deliberately NOT overridden. The DEC-0033
    // value (`EVALUATION_AUTHORIZED_READINESS`) still holds at this tip — it describes the state
    // after the failed attempt, which the launch did not change — so the layer below must keep
    // asserting it verbatim.
    expectedAuthorizationConsumed: true,
  });
  if (!launchLayerAccepted) return false;

  if (!evalAuthorization) return false;

  // ------------------------------------------------ the launch (DEC-0034)
  if (evalAuthorization.launchDecisionId !== "DEC-0034" ||
      evalAuthorization.launchRecord !==
        "governance/DEC-0034-evaluation-benchmark-launch.json") {
    return false;
  }
  if (typeof evalAuthorization.launchHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(evalAuthorization.launchHash)) {
    return false;
  }

  // (b) ROUNDING DOWN: the failure must still be stated, and stated as pre-inference.
  if (evalAuthorization.launchOutcome !== "FAILED_PRE_INFERENCE") return false;
  if (evalAuthorization.launchFailureClass !== "HARNESS_DEFECT_NO_EXECUTION") return false;
  if (evalAuthorization.launchFailurePhase !== "CELL_1_PIN_LOADING") return false;
  if (evalAuthorization.launchFailureTestInferenceOccurred !== false) return false;

  // ------------------------------------------------ the relaunch (DEC-0035)
  if (evalAuthorization.relaunchDecisionId !== "DEC-0035" ||
      evalAuthorization.relaunchRecord !==
        "governance/DEC-0035-evaluation-kernel-relaunch.json") {
    return false;
  }
  if (typeof evalAuthorization.relaunchHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(evalAuthorization.relaunchHash)) {
    return false;
  }
  if (evalAuthorization.activeKernelId !== "vokaigharibo/gharibo-eval-001-fec22ca2") return false;
  if (evalAuthorization.payloadBasis !== "PROMPTS_ONLY") return false;
  if (evalAuthorization.datasetVisibility !== "PRIVATE") return false;

  // The one permitted execution is committed and may not be quietly re-used.
  if (evalAuthorization.authorizationConsumed !== true) return false;
  if (evalAuthorization.furtherAttemptAuthorized !== false) return false;
  if (evalAuthorization.furtherAttemptRequiresNewDecision !== true) return false;

  // (a) ROUNDING UP: nothing may have been scored, and the run must be in flight, not finished.
  if (evalAuthorization.evaluationStatusAfterLaunch !== "EVALUATION_BENCHMARK_IN_FLIGHT") {
    return false;
  }
  if (evalAuthorization.testInferenceOccurred !== "POSSIBLY_IN_FLIGHT") return false;
  if (evalAuthorization.testRecordsParsedLocally !== 0) return false;
  if (evalAuthorization.metricValuesProduced !== 0) return false;
  if (evalAuthorization.executionSucceeded !== false) return false;

  // Evaluation must still not have moved.
  if (training?.evaluationResults !== 0) return false;
  if (experiment?.evaluationStatus !== "NOT_RUN") return false;
  if (experiment?.promotable !== false) return false;

  // GHARIBO-V0.1 must still not exist, even though a launch has now occurred.
  const v01 = (state?.models?.derivedModels || []).find((m) => m?.id === "GHARIBO-V0.1");
  if (!v01 || v01.status !== "NOT_CREATED") return false;

  // Both decisions must be present exactly once and neither may have been superseded.
  const decisions = Array.isArray(state?.decisions) ? state.decisions : [];
  for (const id of ["DEC-0034", "DEC-0035"]) {
    const found = decisions.filter((d) => d?.id === id);
    if (found.length !== 1 ||
        found[0].status !== "ACCEPTED" ||
        found[0].supersedes !== null ||
        found[0].supersededBy !== null) {
      return false;
    }
  }

  // BLK-0004 must be CLOSED, and closed through these decisions.
  const blocker = (state?.blockers || []).find((b) => b?.id === "BLK-0004");
  if (!blocker || blocker.status !== "CLOSED") return false;
  if (!Array.isArray(blocker.closedBy) || !blocker.closedBy.includes("DEC-0035")) return false;

  // Rebuild the DEC-0033-only tip and require the previous predicate to still accept it
  // with its own OPEN expectation intact.
  const before = structuredClone(state);
  before.masterStateVersion = "1.14.0";
  const ea = before.training.evaluationAuthorization;
  for (const key of [
    "launchDecisionId",
    "launchHash",
    "launchRecord",
    "launchOutcome",
    "launchFailureClass",
    "launchFailurePhase",
    "launchFailureTestInferenceOccurred",
    "launchFailureEvidence",
    "relaunchDecisionId",
    "relaunchHash",
    "relaunchRecord",
    "repairCommit",
    "activeKernelId",
    "activeKernelVersion",
    "activeKernelStatusAtRecordTime",
    "supersededKernelId",
    "supersededKernelFailureClass",
    "payloadBasis",
    "datasetId",
    "datasetVisibility",
    "evaluationStatusAfterLaunch",
    "authorizationConsumedMeaning",
    "furtherAttemptAuthorized",
    "furtherAttemptRequiresNewDecision",
    "furtherAttemptRequiresNewDecisionReason",
  ]) {
    delete ea[key];
  }
  // Restore the DEC-0033 shape of the fields that advanced.
  ea.testInferenceOccurred = false;
  ea.testRecordsParsed = 0;
  ea.authorizationConsumed = false;
  ea.evaluationStatusAfterExecutionAttempt = EVALUATION_AUTHORIZED_READINESS;
  const blk4 = before.blockers.find((b) => b?.id === "BLK-0004");
  if (blk4) {
    blk4.status = "OPEN";
    delete blk4.closedBy;
  }
  before.decisions = before.decisions.filter((d) => !["DEC-0034", "DEC-0035"].includes(d?.id));
  // Re-run the DEC-0033 layer with its OWN original expectations, so the launch layer cannot be
  // satisfied by a state in which the DEC-0033 record itself has been tampered with.
  return isEvaluationInfrastructureBlockedGoldState(before);
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

/**
 * The DEC-0036 escalation tip: the harness-repair loop was HALTED after a THIRD pre-inference
 * failure, and the next step is a CEO decision rather than another automated push.
 *
 * WHAT THIS PREDICATE IS FOR
 * -------------------------
 * The tempting reading of a third pre-inference failure is "still unspent, so push again". The
 * predicate exists to make that reading unavailable in code: at this tip the repair loop must be
 * recorded as halted, the attempt and defect counts must be honest, and NO fourth attempt may be
 * authorized. It is the machine-checkable form of "the harness does not re-authorize itself".
 *
 * LAYERING NOTE. This sits on `isEvaluationBenchmarkLaunchedGoldState`, which asserts the launch
 * layer's values — correct for the DEC-0035 tip, and false at this tip, where the third failure has
 * legitimately advanced several of them. As with the layer below, expected values are passed
 * through explicitly rather than by deleting the assertions.
 */
export function isEvaluationEscalatedGoldState(state) {
  const training = state?.training;
  const evalAuthorization = training?.evaluationAuthorization;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];
  if (!evalAuthorization) return false;

  // The launch layer must still hold underneath, with the fields the third failure advanced
  // passed through explicitly. NOTE the deliberate omission of `activeKernelStatusAtRecordTime`
  // and `activeKernelVersion` overrides — the layer below does NOT assert those, so nothing needs
  // relaxing there; the third failure only advanced fields it genuinely owns.
  const launchLayerAccepted = isEvaluationBenchmarkLaunchedGoldState(state);
  if (!launchLayerAccepted) return false;

  // ------------------------------------------------ the escalation (DEC-0036)
  if (evalAuthorization.escalationDecisionId !== "DEC-0036" ||
      evalAuthorization.escalationRecord !== "governance/DEC-0036-evaluation-escalation.json") {
    return false;
  }
  if (typeof evalAuthorization.escalationHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(evalAuthorization.escalationHash)) {
    return false;
  }

  // (b) ROUNDING DOWN: the third failure must still be stated, and stated as pre-inference.
  if (evalAuthorization.thirdLaunchOutcome !== "FAILED_PRE_INFERENCE") return false;
  if (evalAuthorization.thirdLaunchFailureClass !== "HARNESS_DEFECT_NO_EXECUTION") return false;
  if (evalAuthorization.thirdLaunchFailureDefectId !== "DEF-0036-E") return false;
  if (evalAuthorization.thirdLaunchFailurePhase !== "MODEL_LOAD") return false;
  if (evalAuthorization.thirdLaunchTestInferenceOccurred !== false) return false;
  // The model must not have been constructed — that is what makes "no inference" structural
  // rather than merely asserted.
  if (evalAuthorization.thirdLaunchModelObjectConstructed !== false) return false;

  // The counts must be honest. Three launches and five defect classes produced ZERO metrics;
  // a predicate that let those numbers round down would hide the whole point of the escalation.
  //
  // NOTE ON `launchAttempts` AND `defectClassesFound`. At THIS tip the escalation's own record is
  // three launches and five defect classes, and the floors are asserted as "at least" rather than
  // "exactly": attempt #4 (DEC-0038/DEC-0039/DEC-0040) is a LATER, separately-authorized execution
  // whose push and failure legitimately raise both counters. The floors are what matter here — a
  // count that fell BELOW the escalation's own record would mean the escalation had been doctored —
  // and the exact values are pinned at the DEC-0036 tip by the strip-and-re-assert step at the
  // bottom of this predicate, which restores 3 and 5 and re-runs the layer beneath.
  if (!(evalAuthorization.launchAttempts >= 3)) return false;
  if (!(evalAuthorization.defectClassesFound >= 5)) return false;
  // `harnessRepairs` stays EXACT: no repair was performed after the escalation, and one that
  // appeared would mean the halted loop had been quietly restarted.
  if (evalAuthorization.harnessRepairs !== 2) return false;
  if (evalAuthorization.metricValuesProducedAfterThreeLaunches !== 0) return false;

  // ------------------------------------------------ the halt itself
  if (evalAuthorization.harnessRepairLoopHalted !== true) return false;
  if (evalAuthorization.furtherAttemptAuthorized !== false) return false;
  if (evalAuthorization.furtherAttemptRequiresNewDecision !== true) return false;
  // `consumed` stays true; `spent` must stay FALSE, because no TEST inference occurred. If a
  // future edit flipped `spent` to true without inference, the state would silently forbid the
  // very repair the escalation is asking a human to consider — and if it flipped to false with
  // inference, it would silently permit test-set fitting. Both directions are blocked here.
  if (evalAuthorization.authorizationConsumed !== true) return false;
  if (evalAuthorization.authorizationSpent !== false) return false;
  if (evalAuthorization.hardStops2Satisfied !== false) return false;
  if (evalAuthorization.hardStops3Satisfied !== true) return false;

  // (a) ROUNDING UP: nothing may have been scored.
  if (evalAuthorization.testRecordsParsedLocally !== 0) return false;
  if (evalAuthorization.metricValuesProduced !== 0) return false;
  if (evalAuthorization.executionSucceeded !== false) return false;
  if (evalAuthorization.predictionsDownloaded !== false) return false;
  if (evalAuthorization.scoringPerformed !== false) return false;

  // Evaluation must still not have moved.
  if (training?.evaluationResults !== 0) return false;
  if (experiment?.evaluationStatus !== "NOT_RUN") return false;
  if (experiment?.promotable !== false) return false;

  // GHARIBO-V0.1 must still not exist.
  const v01 = (state?.models?.derivedModels || []).find((m) => m?.id === "GHARIBO-V0.1");
  if (!v01 || v01.status !== "NOT_CREATED") return false;

  // All three decisions must be present exactly once and none may have been superseded.
  const decisions = Array.isArray(state?.decisions) ? state.decisions : [];
  for (const id of ["DEC-0034", "DEC-0035", "DEC-0036"]) {
    const found = decisions.filter((d) => d?.id === id);
    if (found.length !== 1 ||
        found[0].status !== "ACCEPTED" ||
        found[0].supersedes !== null ||
        found[0].supersededBy !== null) {
      return false;
    }
  }

  // BLK-0004 must be CLOSED, and closed through these decisions.
  const blocker = (state?.blockers || []).find((b) => b?.id === "BLK-0004");
  if (!blocker || blocker.status !== "CLOSED") return false;
  if (!Array.isArray(blocker.closedBy) || !blocker.closedBy.includes("DEC-0035")) return false;

  // Rebuild the DEC-0035 tip and require the previous predicate to still accept it with its own
  // expectations intact, so this layer cannot be satisfied by tampering with the record beneath.
  const before = structuredClone(state);
  before.masterStateVersion = "1.15.0";
  const ea = before.training.evaluationAuthorization;
  for (const key of [
    "escalationDecisionId",
    "escalationHash",
    "escalationRecord",
    "escalationReason",
    "thirdLaunchKernelId",
    "thirdLaunchKernelVersion",
    "thirdLaunchStatus",
    "thirdLaunchOutcome",
    "thirdLaunchFailureDefectId",
    "thirdLaunchFailureClass",
    "thirdLaunchFailurePhase",
    "thirdLaunchFailureCell",
    "thirdLaunchFailureException",
    "thirdLaunchTestInferenceOccurred",
    "thirdLaunchReachedInstallStage",
    "thirdLaunchReachedModelLoad",
    "thirdLaunchModelObjectConstructed",
    "launchAttempts",
    "defectClassesFound",
    "harnessRepairs",
    "metricValuesProducedAfterThreeLaunches",
    "authorizationSpent",
    "authorizationStateIsFragile",
    "hardStops2Satisfied",
    "hardStops3Satisfied",
    "harnessRepairLoopHalted",
    "activeKernelVersion",
    "activeKernelStatusAtRecordTime",
    "predictionsDownloaded",
    "scoringPerformed",
  ]) {
    delete ea[key];
  }
  // Restore the DEC-0035 shape of the fields that advanced.
  ea.activeKernelVersion = 2;
  ea.activeKernelStatusAtRecordTime = "REPUSHED_AFTER_SECOND_REPAIR";
  before.decisions = before.decisions.filter((d) => d?.id !== "DEC-0036");
  return isEvaluationBenchmarkLaunchedGoldState(before);
}

/**
 * The master-state status of the DEC-0037 diagnostic: the diagnostic was RUN, it PASSED, and the
 * single authorization it consumed is SPENT. The load facts themselves live under `execution`.
 */
const DIAGNOSTIC_PASS_STATUS = "COMPLETED_PASS_AUTHORIZATION_CONSUMED";

/**
 * DEC-0038 records the CEO decision AUTHORIZED WITH LIMITS for evaluation attempt #4: exactly ONE
 * governed held-out TEST benchmark execution, BASE then CANDIDATE, over the same 80 records, one
 * kernel push, no retries, on the DEC-0037 proven loading path.
 *
 * WHY THIS PREDICATE EXISTS, AND WHAT IT REFUSES
 * ----------------------------------------------
 * The pending risk at this tip is not that the attempt is unauthorized — it is that authorizing an
 * attempt gets confused with having a result, or that the authorization quietly becomes a licence
 * to iterate. So this predicate does two separate jobs:
 *
 *   ROUNDING UP is blocked. `evaluationResults` must still be 0, `evaluationStatus` must still be
 *   "NOT_RUN", and the model must still be unpromoted. Authorizing a measurement is not taking it.
 *
 *   ITERATION is blocked. The authorization must be recorded as ONE push with no automatic retry,
 *   no fifth attempt, and — critically — the retry posture DEC-0036 established must still be
 *   intact underneath: `harnessRepairLoopHalted` true and `furtherAttemptAuthorized` false. This
 *   attempt is a HUMAN decision layered on top of the halt; it does not dissolve it.
 *
 * LAYERING NOTE. This sits on `isEvaluationEscalatedGoldState`. The escalation's own fields are the
 * historical record of the third failure and must survive verbatim; only the NEW attempt-#4 fields
 * are this layer's own. As required by the gate-hardening convention, the predicate strips its own
 * layer and re-asserts the predicate beneath, so it can never be satisfied by weakening the
 * escalation gate that it depends on.
 */
export function isEvaluationAttempt4AuthorizedGoldState(state) {
  const training = state?.training;
  const evalAuthorization = training?.evaluationAuthorization;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];
  if (!evalAuthorization) return false;

  // The escalation layer must still hold, verbatim. If the DEC-0036 halt or its third-failure
  // record were tampered with, this layer is not allowed to paper over it.
  if (!isEvaluationEscalatedGoldState(state)) return false;

  // ------------------------------------------------ the authorization itself (DEC-0038)
  if (evalAuthorization.attempt4AuthorizationDecisionId !== "DEC-0038") return false;
  if (evalAuthorization.attempt4AuthorizationRecord !==
      "governance/DEC-0038-evaluation-attempt-4-authorization.json") {
    return false;
  }
  if (evalAuthorization.attempt4AuthorizationStatus !== "AUTHORIZED_WITH_LIMITS") return false;
  if (typeof evalAuthorization.attempt4AuthorizationHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(evalAuthorization.attempt4AuthorizationHash)) {
    return false;
  }

  // (a) ROUNDING UP: the attempt must be bounded to ONE push, and it must not have produced
  // anything yet.
  //
  // NOTE ON THE PUSH FIELDS. This layer deliberately asserts the AUTHORIZATION, not the execution
  // state: the upper bound (`attempt4MaximumKernelPushes === 1`) is permanent and stays pinned here,
  // while `attempt4Pushed` / `attempt4KernelId` / `attempt4KernelVersion` / `attempt4Status` are
  // advanced legitimately by the launch that follows (DEC-0039). Pinning the execution fields at
  // their pre-launch values would make this predicate false at every later tip — and the upper
  // bound is the field that actually constrains behaviour, so it is the one kept here.
  if (evalAuthorization.attempt4Number !== 4) return false;
  if (evalAuthorization.attempt4MaximumKernelPushes !== 1) return false;
  // The DEC-0037 diagnostic must still be recorded as having authorized this attempt and no more.
  if (evalAuthorization.attempt4AuthorizationSpentOnInferenceStart !== true) return false;

  // Both arms on the SAME held-out TEST set, BASE first. A predicate that let the arm order float
  // would let a later edit put CANDIDATE first and invite exactly the cross-arm adjustment the
  // authorization forbids.
  if (!Array.isArray(evalAuthorization.attempt4Arms) ||
      evalAuthorization.attempt4Arms.length !== 2 ||
      evalAuthorization.attempt4Arms[0] !== "base" ||
      evalAuthorization.attempt4Arms[1] !== "candidate") {
    return false;
  }
  if (evalAuthorization.attempt4ArmOrder !== "BASE_THEN_CANDIDATE") return false;
  if (evalAuthorization.attempt4SameTestRecordsForBothArms !== true) return false;
  if (evalAuthorization.attempt4TestRecordCount !== 80) return false;
  if (evalAuthorization.attempt4TestSplitHash !==
      "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b") {
    return false;
  }
  if (evalAuthorization.attempt4HarnessVersion !== "gharibo-eval-harness-1.0.0") return false;

  // The decoding contract must be identical across arms, and CANDIDATE settings must be recorded as
  // not alterable after BASE output. This is the machine-checkable form of "do not tune against
  // BASE, and do not tune against TEST".
  if (evalAuthorization.attempt4DecodingIdenticalAcrossArms !== true) return false;
  if (evalAuthorization.attempt4CandidateSettingsNotAlteredAfterBaseOutput !== true) return false;

  // ------------------------------------------------ the two hard rules
  if (evalAuthorization.attempt4AuthorizationSpentOnInferenceStart !== true) return false;
  if (evalAuthorization.attempt4AutomaticRetryAuthorized !== false) return false;
  if (evalAuthorization.attempt4FifthAttemptAuthorized !== false) return false;
  if (evalAuthorization.attempt4FurtherAttemptRequiresNewDecision !== true) return false;

  // The DEC-0036 halt must survive this layer. An authorization that cleared
  // `furtherAttemptAuthorized` or dropped `harnessRepairLoopHalted` would be re-opening the loop
  // DEC-0036 closed, and it would ALSO fail the layer beneath — this is the round trip.
  if (evalAuthorization.harnessRepairLoopHalted !== true) return false;
  if (evalAuthorization.furtherAttemptAuthorized !== false) return false;
  if (evalAuthorization.furtherAttemptRequiresNewDecision !== true) return false;
  if (evalAuthorization.hardStops2Satisfied !== false) return false;
  if (evalAuthorization.hardStops3Satisfied !== true) return false;

  // The proven loader path is BINDING and must not be recorded as redesigned. Reusing it is the
  // entire evidential basis of this attempt; if the record stopped saying so, the authorization
  // would rest on nothing.
  if (evalAuthorization.attempt4LoaderConventionProvenBy !== "DEC-0037") return false;
  if (evalAuthorization.attempt4RedesignForbidden !== true) return false;
  if (evalAuthorization.attempt4AdditionalChatTemplates404Status !==
      "REPRODUCED_AND_NON_FATAL") {
    return false;
  }

  // ------------------------------------------------ nothing forbidden may have happened
  for (const key of [
    "attempt4PromotionAuthorized",
    "attempt4TuningAuthorized",
    "attempt4ModelSelectionAuthorized",
    "attempt4GhariboV01CreationAuthorized",
    "attempt4DatasetMutationAuthorized",
    "attempt4TestDrivenCodeOptimisationAuthorized",
  ]) {
    if (evalAuthorization[key] !== false) return false;
  }

  // ------------------------------------------------ evaluation must still not have moved
  if (evalAuthorization.authorizationSpent !== false) return false;
  if (evalAuthorization.metricValuesProduced !== 0) return false;
  if (evalAuthorization.predictionsDownloaded !== false) return false;
  if (evalAuthorization.scoringPerformed !== false) return false;

  if (training?.evaluationResults !== 0) return false;
  if (experiment?.evaluationStatus !== "NOT_RUN") return false;
  if (experiment?.promotable !== false) return false;

  // GHARIBO-V0.1 must still not exist.
  const v01 = (state?.models?.derivedModels || []).find((m) => m?.id === "GHARIBO-V0.1");
  if (!v01 || v01.status !== "NOT_CREATED") return false;

  // The diagnostic that grounds this authorization must still be recorded as PASS, and must still
  // be recorded as having refused both TEST access and inference. An authorization resting on a
  // diagnostic cannot outlive the diagnostic's own claims.
  //
  // NOTE the split of duties. Master state carries the diagnostic's LIFECYCLE (it ran, it passed,
  // its single authorization is consumed) plus the record path and hash; the LOAD FACTS themselves
  // (install / tokenizer / model load / testAccessed / inferenceExecuted) live in the record file.
  // Master state therefore pins the status and the hash here, and the record file is what makes the
  // PASS verifiable — the hash pins the bytes, so the pass cannot be re-worded in place.
  const diagnostic = training?.diagnosticAuthorization;
  if (!diagnostic) return false;
  if (diagnostic.decisionId !== "DEC-0037") return false;
  if (diagnostic.status !== DIAGNOSTIC_PASS_STATUS) return false;
  if (diagnostic.record !== "governance/DEC-0037-diagnostic-authorization.json") return false;
  if (diagnostic.resultRecord !== "governance/DEC-0037-diagnostic-authorization.json") return false;
  if (diagnostic.kernelPushes !== 1 || diagnostic.maximumKernelPushes !== 1) return false;
  if (diagnostic.kernelId !== "vokaigharibo/gharibo-diagnostic-dec0037") return false;
  if (diagnostic.evaluationAttempt4Authorized !== true) return false;
  if (diagnostic.evaluationAttempt4AuthorizationDecisionId !== "DEC-0038") return false;

  // DEC-0037 AND DEC-0038 must each be present exactly once, ACCEPTED, and unsuperseded. DEC-0036
  // is already checked by the layer beneath.
  const decisions = Array.isArray(state?.decisions) ? state.decisions : [];
  for (const id of ["DEC-0037", "DEC-0038"]) {
    const found = decisions.filter((d) => d?.id === id);
    if (found.length !== 1 ||
        found[0].status !== "ACCEPTED" ||
        found[0].supersedes !== null ||
        found[0].supersededBy !== null) {
      return false;
    }
  }

  // Rebuild the DEC-0037 tip by STRIPPING this layer, and require the predicate beneath to still
  // accept it. This is what makes the layer sound: it cannot be satisfied by loosening the
  // escalation gate underneath, because the gate underneath is re-run on the stripped state.
  //
  // The `attempt4Launch*` keys are stripped too: they are DEC-0039's layer, and leaving them in
  // would let a launch-only field satisfy the authorization gate rather than the launch gate.
  const before = structuredClone(state);
  before.masterStateVersion = "1.17.0";
  const eaBefore = before.training.evaluationAuthorization;
  for (const key of Object.keys(eaBefore)) {
    if (key.startsWith("attempt4")) delete eaBefore[key];
  }
  // Restore the DEC-0036 escalation-tip shape of the counters this layer's successors advance.
  // The escalation layer asserts these as FLOORS (>= 3 and >= 5); leaving them undefined after the
  // `attempt4*` sweep would make its floor comparison fail on a state that is factually correct at
  // the 1.17.0 tip, which is a bug in the strip, not a finding about the state.
  eaBefore.launchAttempts = 3;
  eaBefore.defectClassesFound = 5;
  if (before.training.diagnosticAuthorization) {
    const d = before.training.diagnosticAuthorization;
    d.evaluationAttempt4Authorized = false;
    delete d.evaluationAttempt4AuthorizationDecisionId;
    delete d.evaluationAttempt4AuthorizationHash;
    delete d.evaluationAttempt4AuthorizedAt;
    delete d.evaluationAttempt4AuthorizationBasis;
    d.next = "READY_FOR_HUMAN_DECISION_ON_EVALUATION_RETRY";
    delete d.note;
  }
  before.decisions = before.decisions.filter((d) => d?.id !== "DEC-0038");
  return isEvaluationEscalatedGoldState(before);
}

/**
 * DEC-0039 records that attempt #4 was actually LAUNCHED: one kernel push under DEC-0038's ONE-push
 * bound, zero pushes remaining, run IN FLIGHT.
 *
 * WHY THIS PREDICATE EXISTS
 * -------------------------
 * The dangerous misreading at this tip is "we launched, so we measured". This predicate makes that
 * reading unavailable in code. `evaluationResults` must still be 0, `evaluationStatus` must still be
 * "NOT_RUN", the model must still be unpromoted, and every "did we score anything yet" field must
 * still say no. A launch is the beginning of an experiment, not its report.
 *
 * IT ALSO PINS THE PUSH COUNT TO ZERO REMAINING. That is the field that makes repair-and-retry
 * impossible without a further human decision: if an edit silently restored a push, this predicate
 * fails. It is the machine-checkable form of "one attempt means one attempt".
 *
 * LAYERING NOTE. This sits on `isEvaluationAttempt4AuthorizedGoldState`. The authorization layer's
 * own fields are the historical record of what was permitted and must survive verbatim; only the
 * launch fields belong to this layer. As the gate-hardening convention requires, the predicate
 * strips its own layer and re-asserts the predicate beneath, so it cannot be satisfied by weakening
 * the authorization gate underneath — including by clearing the ONE-push bound it depends on.
 */
export function isEvaluationAttempt4LaunchedGoldState(state) {
  const training = state?.training;
  const evalAuthorization = training?.evaluationAuthorization;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];
  if (!evalAuthorization) return false;

  // The authorization layer must still hold, verbatim — including its ONE-push bound.
  if (!isEvaluationAttempt4AuthorizedGoldState(state)) return false;

  // ------------------------------------------------ the launch itself (DEC-0039)
  if (evalAuthorization.attempt4LaunchDecisionId !== "DEC-0039") return false;
  if (evalAuthorization.attempt4LaunchRecord !==
      "governance/DEC-0039-evaluation-attempt-4-launch.json") {
    return false;
  }
  if (typeof evalAuthorization.attempt4LaunchHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(evalAuthorization.attempt4LaunchHash)) {
    return false;
  }

  // ------------------------------------------------ ONE push, ZERO remaining
  //
  // NOTE ON `attempt4Status`. At the launch tip this is "IN_FLIGHT". A later record RESOLVES it to
  // a terminal outcome, and this layer admits exactly two resolutions: the run concluded and was
  // recorded as a pre-inference failure, or the run concluded successfully. It does NOT admit a
  // value that would imply the attempt never launched. The push accounting below is what actually
  // constrains behaviour, and it stays pinned exactly.
  const launchStatus = evalAuthorization.attempt4Status;
  if (launchStatus !== "IN_FLIGHT" &&
      launchStatus !== "FAILED_PRE_INFERENCE" &&
      launchStatus !== "COMPLETED") {
    return false;
  }
  if (evalAuthorization.attempt4Pushed !== true) return false;
  if (evalAuthorization.attempt4KernelPushesPerformed !== 1) return false;
  if (evalAuthorization.attempt4KernelPushesRemaining !== 0) return false;
  if (evalAuthorization.attempt4KernelId !== "vokaigharibo/gharibo-eval-001-fec22ca2") return false;
  if (evalAuthorization.attempt4KernelVersion !== 3) return false;
  if (evalAuthorization.attempt4RetryAuthorized !== false) return false;

  // The authorization's own bound must not have been widened by this launch.
  if (evalAuthorization.attempt4MaximumKernelPushes !== 1) return false;
  if (evalAuthorization.attempt4AuthorizationSpentOnInferenceStart !== true) return false;
  if (evalAuthorization.attempt4AutomaticRetryAuthorized !== false) return false;
  if (evalAuthorization.attempt4FifthAttemptAuthorized !== false) return false;

  // The pushed artifact must be pinned by hash, not by path.
  if (!/^[0-9a-f]{64}$/.test(evalAuthorization.attempt4NotebookSha256AsPushed ?? "")) {
    return false;
  }
  if (!/^[0-9a-f]{64}$/.test(evalAuthorization.attempt4LaunchBundleHashAsPushed ?? "")) {
    return false;
  }

  // ------------------------------------------------ (a) ROUNDING UP: nothing may be claimed
  //
  // NOTE ON `attempt4TestInferenceOccurred`. At the launch tip this is the honest placeholder
  // "IN_FLIGHT_NOT_YET_ESTABLISHED". A later record RESOLVES it, and the only resolution this
  // predicate admits is `false` — the run concluded and established that no TEST inference took
  // place. A value of `true` would mean inference DID occur, which this authorization never
  // permitted this layer to assume, and is rejected here (and again in the failure layer above).
  // Accepting the resolved `false` keeps the layer true at later tips without weakening it: the
  // placeholder asserted "unknown", and `false` is strictly more information, not less.
  const inferenceState = evalAuthorization.attempt4TestInferenceOccurred;
  if (inferenceState !== "IN_FLIGHT_NOT_YET_ESTABLISHED" && inferenceState !== false) {
    return false;
  }
  if (evalAuthorization.attempt4MetricValuesProduced !== 0) return false;
  if (evalAuthorization.metricValuesProduced !== 0) return false;
  if (evalAuthorization.predictionsDownloaded !== false) return false;
  if (evalAuthorization.scoringPerformed !== false) return false;
  if (evalAuthorization.authorizationSpent !== false) return false;

  if (training?.evaluationResults !== 0) return false;
  if (experiment?.evaluationStatus !== "NOT_RUN") return false;
  if (experiment?.promotable !== false) return false;

  const v01 = (state?.models?.derivedModels || []).find((m) => m?.id === "GHARIBO-V0.1");
  if (!v01 || v01.status !== "NOT_CREATED") return false;

  // DEC-0039 must be present exactly once, ACCEPTED, and unsuperseded.
  const decisions = Array.isArray(state?.decisions) ? state.decisions : [];
  const found = decisions.filter((d) => d?.id === "DEC-0039");
  if (found.length !== 1 ||
      found[0].status !== "ACCEPTED" ||
      found[0].supersedes !== null ||
      found[0].supersededBy !== null) {
    return false;
  }

  // Strip this layer and re-assert the authorization predicate beneath.
  const before = structuredClone(state);
  before.masterStateVersion = "1.18.0";
  const eaBefore = before.training.evaluationAuthorization;
  for (const key of Object.keys(eaBefore)) {
    if (key.startsWith("attempt4Launch") ||
        key === "attempt4Pushed" ||
        key === "attempt4KernelPushesPerformed" ||
        key === "attempt4KernelPushesRemaining" ||
        key === "attempt4KernelId" ||
        key === "attempt4KernelVersion" ||
        key === "attempt4KernelStatusAtRecordTime" ||
        key === "attempt4NotebookSha256AsPushed" ||
        key === "attempt4LaunchBundleHashAsPushed" ||
        key === "attempt4RetryAuthorized" ||
        key === "attempt4MetricValuesProduced") {
      delete eaBefore[key];
    }
  }
  // Restore the pre-launch shape of the fields the launch advanced.
  eaBefore.attempt4Status = "AUTHORIZED_NOT_YET_PUSHED";
  eaBefore.attempt4Pushed = false;
  eaBefore.attempt4KernelId = null;
  eaBefore.attempt4KernelVersion = null;
  eaBefore.attempt4TestInferenceOccurred = false;
  eaBefore.launchAttempts = 3;
  eaBefore.defectClassesFound = 5;
  eaBefore.activeKernelVersion = 3;
  eaBefore.activeKernelStatusAtRecordTime = "ERROR";
  before.decisions = before.decisions.filter((d) => d?.id !== "DEC-0039");
  return isEvaluationAttempt4AuthorizedGoldState(before);
}

/**
 * DEC-0040 records that evaluation attempt #4 FAILED PRE-INFERENCE, and that no repair was applied
 * and no fifth attempt was authorized.
 *
 * WHY THIS PREDICATE EXISTS
 * -------------------------
 * This is the most dangerous tip in the whole ledger for one specific reason: the failure is KNOWN
 * to be fixable, and a fixable failure invites a silent retry. So this predicate does three jobs:
 *
 *   NO MEASUREMENT. `evaluationResults` must still be 0, `evaluationStatus` must still be "NOT_RUN",
 *   the model must still be unpromoted. Four attempts produced nothing; the state must say so.
 *
 *   NO RETRY. Zero pushes remaining, zero retries performed, no repair performed, no fifth attempt
 *   authorized, and a new human decision required. This is what makes "we found the bug and fixed
 *   it" insufficient to restart the loop on the harness's own authority.
 *
 *   THE FINDING MUST SURVIVE. The decisive observation — the same 404 is fatal at the mutable ref
 *   "main" and non-fatal at the pinned commit SHA — must still be recorded, AND the unproven part
 *   must still be recorded as unproven. A later edit that upgraded `transportCausationStatus` to a
 *   proven value would be asserting something the logs do not support, so it fails here.
 *
 * LAYERING NOTE. This sits on `isEvaluationAttempt4LaunchedGoldState`. The launch layer's own fields
 * are the historical record of what was pushed and must survive verbatim; only the post-run outcome
 * fields belong to this layer. As the gate-hardening convention requires, the predicate strips its
 * own layer and re-asserts the predicate beneath — including the ONE-push bound — so it cannot be
 * satisfied by weakening the gate underneath it.
 */
export function isEvaluationAttempt4FailedGoldState(state) {
  const training = state?.training;
  const evalAuthorization = training?.evaluationAuthorization;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];
  if (!evalAuthorization) return false;

  // The launch layer must still hold, verbatim — including the ONE-push bound and zero remaining.
  if (!isEvaluationAttempt4LaunchedGoldState(state)) return false;

  // ------------------------------------------------ the failure record (DEC-0040)
  if (evalAuthorization.attempt4FailureDecisionId !== "DEC-0040") return false;
  if (evalAuthorization.attempt4FailureRecord !==
      "governance/DEC-0040-evaluation-attempt-4-failure.json") {
    return false;
  }
  if (typeof evalAuthorization.attempt4FailureHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(evalAuthorization.attempt4FailureHash)) {
    return false;
  }

  // (b) ROUNDING DOWN: the failure must still be stated, and stated as pre-inference.
  if (evalAuthorization.attempt4Status !== "FAILED_PRE_INFERENCE") return false;
  if (evalAuthorization.attempt4Outcome !== "FAILED_PRE_INFERENCE") return false;
  if (evalAuthorization.attempt4FailureClass !== "HARNESS_DEFECT_NO_EXECUTION") return false;
  if (evalAuthorization.attempt4FailureDefectId !== "DEF-0040-A") return false;
  if (evalAuthorization.attempt4FailurePhase !== "MODEL_LOAD") return false;
  if (evalAuthorization.attempt4TestInferenceOccurred !== false) return false;
  // The model object must never have been constructed — that is what makes "no inference"
  // structural rather than merely asserted.
  if (evalAuthorization.attempt4ModelObjectConstructed !== false) return false;
  if (evalAuthorization.attempt4PredictionFilesProduced !== 0) return false;
  if (evalAuthorization.attempt4FailureEvidenceResult !== "PASSED_4_OF_4_PRE_INFERENCE") {
    return false;
  }

  // ------------------------------------------------ the decisive finding, with its limit
  if (evalAuthorization.attempt4ResolvedRevisionObserved !== "main") return false;
  if (evalAuthorization.attempt4ResolvedRevisionKind !== "MUTABLE_REF_NAME") return false;
  if (evalAuthorization.attempt4ContrastResolvedRevision !==
      "093fba6992ef5a7152481afec0bdfca1ac486998") {
    return false;
  }
  if (evalAuthorization.attempt4ContrastResolvedRevisionKind !== "IMMUTABLE_COMMIT_SHA") {
    return false;
  }
  if (evalAuthorization.attempt4ContrastOutcome !== "PASS") return false;
  if (evalAuthorization.attempt4SameDefectIsNotInherentlyFatal !== true) return false;
  // The unproven part must STAY unproven. Upgrading this to a proven value would assert transport
  // causation the two logs do not establish.
  if (evalAuthorization.attempt4TransportCausationStatus !== "UNPROVEN_NOT_ASSERTED") return false;

  // ------------------------------------------------ no repair, no retry
  if (evalAuthorization.attempt4AuthorizationState !==
      "EXHAUSTED_ONE_PUSH_CONSUMED_ZERO_REMAINING") {
    return false;
  }
  if (evalAuthorization.attempt4KernelPushesRemaining !== 0) return false;
  if (evalAuthorization.attempt4RetriesPerformed !== 0) return false;
  if (evalAuthorization.attempt4RepairPerformed !== false) return false;
  if (evalAuthorization.attempt4RetryAuthorized !== false) return false;
  if (evalAuthorization.attempt4FifthAttemptAuthorized !== false) return false;
  if (evalAuthorization.attempt4FurtherAttemptRequiresNewDecision !== true) return false;
  if (evalAuthorization.attempt4RemediesIdentifiedNotApplied !== true) return false;

  // The halt must survive this layer. NOTE `launchAttempts` is deliberately NOT pinned to an exact
  // value here: DEC-0040 raised the honest count to 4, and the floor lives in the escalation layer
  // beneath. Pinning 4 exactly would make every later tip fail for no safety gain.
  if (evalAuthorization.harnessRepairLoopHalted !== true) return false;
  if (evalAuthorization.furtherAttemptAuthorized !== false) return false;
  if (evalAuthorization.furtherAttemptRequiresNewDecision !== true) return false;
  if (evalAuthorization.hardStops2Satisfied !== false) return false;
  if (evalAuthorization.hardStops3Satisfied !== true) return false;

  // ------------------------------------------------ (a) ROUNDING UP: nothing may be claimed
  if (evalAuthorization.attempt4MetricValuesProduced !== 0) return false;
  if (evalAuthorization.metricValuesProduced !== 0) return false;
  if (evalAuthorization.predictionsDownloaded !== false) return false;
  if (evalAuthorization.scoringPerformed !== false) return false;
  if (evalAuthorization.authorizationSpent !== false) return false;

  if (training?.evaluationResults !== 0) return false;
  if (experiment?.evaluationStatus !== "NOT_RUN") return false;
  if (experiment?.promotable !== false) return false;

  const v01 = (state?.models?.derivedModels || []).find((m) => m?.id === "GHARIBO-V0.1");
  if (!v01 || v01.status !== "NOT_CREATED") return false;

  // DEC-0040 must be present exactly once, ACCEPTED, and unsuperseded.
  const decisions = Array.isArray(state?.decisions) ? state.decisions : [];
  const found = decisions.filter((d) => d?.id === "DEC-0040");
  if (found.length !== 1 ||
      found[0].status !== "ACCEPTED" ||
      found[0].supersedes !== null ||
      found[0].supersededBy !== null) {
    return false;
  }

  // Strip this layer and re-assert the launch predicate beneath.
  //
  // NOTE the sweep uses EXPLICIT prefixes rather than a bare `attempt4Failure*` match, because
  // `attempt4FurtherAttemptRequiresNewDecision` is the AUTHORIZATION layer's field (it happens to
  // share the `attempt4F` prefix). Deleting it here would strip a field the layer beneath
  // re-asserts, and the round trip would then fail on a state that is factually correct.
  const before = structuredClone(state);
  before.masterStateVersion = "1.19.0";
  const eaBefore = before.training.evaluationAuthorization;
  for (const key of Object.keys(eaBefore)) {
    if (key.startsWith("attempt4FailureRecord") ||
        key.startsWith("attempt4FailureHash") ||
        key.startsWith("attempt4FailureDecisionId") ||
        key.startsWith("attempt4FailureClass") ||
        key.startsWith("attempt4FailureDefectId") ||
        key.startsWith("attempt4FailurePhase") ||
        key.startsWith("attempt4FailureCell") ||
        key.startsWith("attempt4FailureException") ||
        key.startsWith("attempt4FailureLogSha256") ||
        key.startsWith("attempt4FailureEvidence") ||
        key.startsWith("attempt4Resolved") ||
        key.startsWith("attempt4Contrast") ||
        key === "attempt4Outcome" ||
        key === "attempt4ModelObjectConstructed" ||
        key === "attempt4PredictionFilesProduced" ||
        key === "attempt4SameDefectIsNotInherentlyFatal" ||
        key === "attempt4TransportCausationStatus" ||
        key === "attempt4RemediesIdentifiedNotApplied" ||
        key === "attempt4AuthorizationState" ||
        key === "attempt4RetriesPerformed" ||
        key === "attempt4RepairPerformed") {
      delete eaBefore[key];
    }
  }
  // Restore the in-flight shape of the fields the failure advanced.
  eaBefore.attempt4Status = "IN_FLIGHT";
  eaBefore.attempt4TestInferenceOccurred = "IN_FLIGHT_NOT_YET_ESTABLISHED";
  eaBefore.attempt4KernelStatusAtRecordTime = "RUNNING";
  eaBefore.launchAttempts = 3;
  eaBefore.defectClassesFound = 5;
  before.decisions = before.decisions.filter((d) => d?.id !== "DEC-0040");
  return isEvaluationAttempt4LaunchedGoldState(before);
}


/**
 * DEC-0044 authorizes exactly ONE Evaluation Attempt #5.
 *
 * This is an ADDITIVE authorization layer only. It does not rewrite DEC-0038/39/40
 * history, does not claim an evaluation result, and does not authorize promotion.
 *
 * The predicate strips DEC-0044 back to the already-accepted 1.22.0 state and then
 * re-runs the full historical governance predicate underneath it.
 */
export function isEvaluationAttempt5AuthorizedGoldState(state) {
  const training = state?.training;
  const attempt5 = training?.attempt5Authorization;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];

  if (state?.masterStateVersion !== "1.23.0") return false;
  if (!attempt5 || !experiment) return false;

  if (
    attempt5.decisionId !== "DEC-0044" ||
    attempt5.status !== "AUTHORIZED_NOT_LAUNCHED" ||
    attempt5.attemptNumber !== 5 ||
    attempt5.maximumKernelPushes !== 1 ||
    attempt5.kernelPushesPerformed !== 0 ||
    attempt5.kernelPushesRemaining !== 1 ||
    attempt5.automaticRetryAuthorized !== false ||
    attempt5.testAccessAuthorized !== true ||
    attempt5.inferenceAuthorized !== true ||
    attempt5.scoringAuthorized !== true ||
    attempt5.promotionAuthorized !== false ||
    attempt5.ghariboV01CreationAuthorized !== false ||
    attempt5.retrainingAuthorized !== false ||
    attempt5.tuningAuthorized !== false ||
    attempt5.modelSelectionAuthorized !== false ||
    attempt5.authorizationSpentOnInferenceStart !== true ||
    attempt5.authorizationSpent !== false ||
    attempt5.authorizationConsumed !== false ||
    attempt5.launchAttempted !== false ||
    attempt5.testInferenceOccurred !== false ||
    attempt5.metricValuesProduced !== 0
  ) {
    return false;
  }

  if (
    attempt5.authorizationHash !==
      "f46b32607149deb06905263e09ee945c9b24f004d703b282967c0d6036c45f5e" ||
    attempt5.testRecordCount !== 80 ||
    attempt5.testSplitHash !==
      "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b" ||
    attempt5.candidateArmId !== "GHARIBO-exp-001" ||
    attempt5.candidateAdapterSha256 !==
      "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f" ||
    attempt5.baseModel !== "openai/gpt-oss-20b" ||
    attempt5.baseModelRevision !==
      "6cee5e81ee83917806bbde320786a8fb61efebee" ||
    attempt5.loaderArchitecture !== "IMMUTABLE_LOCAL_SNAPSHOT" ||
    attempt5.loaderArchitectureProvenBy !== "DEC-0043" ||
    attempt5.distributionRepo !==
      "unsloth/gpt-oss-20b-unsloth-bnb-4bit" ||
    attempt5.immutableDistributionRevision !==
      "093fba6992ef5a7152481afec0bdfca1ac486998" ||
    attempt5.notebookSha256 !==
      "49673f97d137445cf9c3ada162d0d70fdf511ff0b308c86681554b472c3e3eb3" ||
    attempt5.launchBundleHash !==
      "6b27b342d9615ccf6a56ee9303a8e98ce90638de5290dc9301bd93b6ae9db344" ||
    attempt5.promptsSha256 !==
      "dcea32df3697921322afc33eae856bf6fd4e111785f63c4d399de7077e43f333"
  ) {
    return false;
  }

  if (
    !Array.isArray(attempt5.arms) ||
    attempt5.arms.length !== 2 ||
    attempt5.arms[0] !== "base" ||
    attempt5.arms[1] !== "candidate" ||
    attempt5.armOrder !== "BASE_THEN_CANDIDATE" ||
    attempt5.sameTestRecordsForBothArms !== true
  ) {
    return false;
  }

  if (
    training?.evaluationResults !== 0 ||
    experiment.evaluationStatus !== "NOT_RUN" ||
    experiment.evaluationScore !== null ||
    experiment.promotable !== false ||
    experiment.readinessStatus !==
      "ATTEMPT_5_AUTHORIZED_AWAITING_EXECUTION" ||
    experiment.evaluationAuthorizationDecisionId !== "DEC-0044" ||
    experiment.evaluationAuthorizationStatus !== "AUTHORIZED_WITH_LIMITS"
  ) {
    return false;
  }

  const v01 = (state?.models?.derivedModels || []).find(
    (m) => m?.id === "GHARIBO-V0.1"
  );

  if (!v01 || v01.status !== "NOT_CREATED") return false;

  const preflight = training?.preflightReconciliation;

  if (
    !preflight ||
    preflight.loaderExecutionProven !== true ||
    preflight.attempt5Authorized !== true ||
    preflight.attempt5AuthorizationDecisionId !== "DEC-0044" ||
    preflight.next !== "ATTEMPT_5_AUTHORIZED_NOT_LAUNCHED"
  ) {
    return false;
  }

  const decisions = Array.isArray(state?.decisions)
    ? state.decisions
    : [];

  const dec44 = decisions.filter((d) => d?.id === "DEC-0044");

  if (
    dec44.length !== 1 ||
    dec44[0].status !== "ACCEPTED" ||
    dec44[0].supersedes !== null ||
    dec44[0].supersededBy !== null
  ) {
    return false;
  }

  // Strip ONLY the DEC-0044 layer and prove the accepted state underneath.
  const before = structuredClone(state);

  before.masterStateVersion = "1.22.0";

  before.decisions = before.decisions.filter(
    (d) => d?.id !== "DEC-0044"
  );

  delete before.training.attempt5Authorization;

  if (before.training.preflightReconciliation) {
    before.training.preflightReconciliation.attempt5Authorized = false;

    delete before.training.preflightReconciliation
      .attempt5AuthorizationDecisionId;

    before.training.preflightReconciliation.next =
      "HUMAN_DECISION_ON_ATTEMPT_5";
  }

  const beforeExperiment =
    before.experiments?.["GHARIBO-exp-001"];

  if (beforeExperiment) {
    beforeExperiment.readinessStatus =
      "EVALUATION_AUTHORIZED_AWAITING_EXECUTION";

    beforeExperiment.evaluationAuthorizationDecisionId =
      "DEC-0032";

    beforeExperiment.evaluationAuthorizationStatus =
      "AUTHORIZED_WITH_LIMITS";
  }

  if (before.training.evaluation) {
    delete before.training.evaluation.authorizationDecisionId;
    delete before.training.evaluation.authorizationHash;

    before.training.evaluation.authorizationStatus =
      "EVALUATION_READY_AWAITING_AUTHORIZATION";

    before.training.evaluation.nextGate =
      "EXPLICIT_EVALUATION_AUTHORIZATION_REQUIRED";
  }

  return isAcceptedGoldGovernanceState(before);
}


/**
 * DEC-0045 records the terminal PRE-INFERENCE outcome of Attempt #5.
 *
 * This layer records failure; it does not create an evaluation result.
 * The one-push bound is exhausted, inference never began, M1-M13 remain
 * null, and any future execution requires a new explicit human decision.
 */
export function isEvaluationAttempt5FailedGoldState(state) {
  const training = state?.training;
  const attempt5 = training?.attempt5Authorization;
  const failure = training?.attempt5Failure;
  const experiment = state?.experiments?.["GHARIBO-exp-001"];

  if (state?.masterStateVersion !== "1.24.0") return false;
  if (!attempt5 || !failure || !experiment) return false;

  if (
    attempt5.decisionId !== "DEC-0044" ||
    attempt5.status !== "FAILED_PRE_INFERENCE_ONE_PUSH_CONSUMED" ||
    attempt5.attemptNumber !== 5 ||
    attempt5.maximumKernelPushes !== 1 ||
    attempt5.kernelPushesPerformed !== 1 ||
    attempt5.kernelPushesRemaining !== 0 ||
    attempt5.launchAttempted !== true ||
    attempt5.kernelVersion !== 4 ||
    attempt5.kernelStatus !== "KernelWorkerStatus.ERROR" ||
    attempt5.testInferenceOccurred !== false ||
    attempt5.metricValuesProduced !== 0 ||
    attempt5.authorizationSpent !== false ||
    attempt5.authorizationConsumed !== true ||
    attempt5.automaticRetryAuthorized !== false ||
    attempt5.retryAuthorized !== false ||
    attempt5.attempt6Authorized !== false ||
    attempt5.furtherAttemptAuthorized !== false ||
    attempt5.furtherAttemptRequiresNewHumanDecision !== true ||
    attempt5.failureDecisionId !== "DEC-0045" ||
    attempt5.failureRecord !==
      "governance/DEC-0045-evaluation-attempt-5-failure.json" ||
    !/^[0-9a-f]{64}$/.test(attempt5.failureHash ?? "")
  ) {
    return false;
  }

  if (
    failure.decisionId !== "DEC-0045" ||
    failure.status !==
      "EVALUATION_ATTEMPT_5_FAILED_PRE_INFERENCE_ONE_PUSH_EXHAUSTED" ||
    failure.attemptNumber !== 5 ||
    failure.kernelVersion !== 4 ||
    failure.kernelStatus !== "KernelWorkerStatus.ERROR" ||
    failure.launchOutcome !== "FAILED_PRE_INFERENCE" ||
    failure.failureDefectId !== "DEF-0045-A" ||
    failure.failurePhase !== "SNAPSHOT_DOWNLOAD" ||
    failure.failureException !== "AttributeError" ||
    failure.testInferenceOccurred !== false ||
    failure.metricValuesProduced !== 0 ||
    failure.kernelPushesPerformed !== 1 ||
    failure.kernelPushesRemaining !== 0 ||
    failure.retryAuthorized !== false ||
    failure.attempt6Authorized !== false ||
    failure.furtherAttemptRequiresNewHumanDecision !== true ||
    failure.failureHash !== attempt5.failureHash
  ) {
    return false;
  }

  if (
    training?.evaluationResults !== 0 ||
    experiment.evaluationStatus !== "NOT_RUN" ||
    experiment.evaluationScore !== null ||
    experiment.promotable !== false ||
    experiment.readinessStatus !==
      "ATTEMPT_5_FAILED_PRE_INFERENCE_AWAITING_HUMAN_DECISION" ||
    experiment.evaluationAuthorizationDecisionId !== "DEC-0044" ||
    experiment.evaluationOutcomeDecisionId !== "DEC-0045" ||
    experiment.evaluationAuthorizationStatus !==
      "EXHAUSTED_ONE_PUSH_CONSUMED"
  ) {
    return false;
  }

  const v01 =
    (state?.models?.derivedModels || [])
      .find((m) => m?.id === "GHARIBO-V0.1");

  if (!v01 || v01.status !== "NOT_CREATED") return false;

  if (
    failure.repairCandidate?.commit !==
      "05d923f4ed3cada9093263839ba4f3c25717614b" ||
    failure.repairCandidate?.status !==
      "LOCAL_REGRESSION_PROVEN_ONLY" ||
    failure.repairCandidate?.mergedToMain !== false ||
    failure.repairCandidate?.runtimeProvenOnKaggle !== false ||
    failure.repairCandidate?.executionAuthorized !== false
  ) {
    return false;
  }

  const decisions =
    Array.isArray(state?.decisions)
      ? state.decisions
      : [];

  const dec45 =
    decisions.filter((d) => d?.id === "DEC-0045");

  if (
    dec45.length !== 1 ||
    dec45[0].status !== "ACCEPTED" ||
    dec45[0].supersedes !== null ||
    dec45[0].supersededBy !== null
  ) {
    return false;
  }

  // Strip DEC-0045 and prove the accepted DEC-0044 state underneath.
  const before = structuredClone(state);

  before.masterStateVersion = "1.23.0";

  before.decisions =
    before.decisions.filter(
      (d) => d?.id !== "DEC-0045"
    );

  delete before.training.attempt5Failure;

  const a =
    before.training.attempt5Authorization;

  a.status = "AUTHORIZED_NOT_LAUNCHED";
  a.kernelPushesPerformed = 0;
  a.kernelPushesRemaining = 1;
  a.launchAttempted = false;
  a.testInferenceOccurred = false;
  a.metricValuesProduced = 0;
  a.authorizationSpent = false;
  a.authorizationConsumed = false;

  for (const key of [
    "kernelVersion",
    "kernelStatus",
    "retryAuthorized",
    "attempt6Authorized",
    "furtherAttemptAuthorized",
    "furtherAttemptRequiresNewHumanDecision",
    "failureDecisionId",
    "failureRecord",
    "failureHash",
    "failurePhase",
    "failureException",
    "failureLogSha256",
    "repairCandidateBranch",
    "repairCandidateCommit",
    "repairCandidateStatus",
    "repairMergedToMain",
    "repairRuntimeProvenOnKaggle",
    "repairExecutionAuthorized"
  ]) {
    delete a[key];
  }

  const p =
    before.training.preflightReconciliation;

  delete p.attempt5Outcome;
  delete p.attempt5OutcomeDecisionId;

  p.next =
    "ATTEMPT_5_AUTHORIZED_NOT_LAUNCHED";

  if (before.training.evaluation) {
    before.training.evaluation.status =
      "NOT_RUN";

    before.training.evaluation.executed =
      false;

    before.training.evaluation.authorizationStatus =
      "ATTEMPT_5_AUTHORIZED_NOT_LAUNCHED";

    before.training.evaluation.authorizationDecisionId =
      "DEC-0044";

    delete before.training.evaluation.outcomeDecisionId;

    before.training.evaluation.nextGate =
      "ONE_GOVERNED_KAGGLE_PUSH_FOR_ATTEMPT_5";

    before.training.evaluation.note =
      "DEC-0044 authorizes exactly one Attempt #5 benchmark execution. No push or TEST inference has occurred at this checkpoint.";
  }

  const e =
    before.experiments?.["GHARIBO-exp-001"];

  e.readinessStatus =
    "ATTEMPT_5_AUTHORIZED_AWAITING_EXECUTION";

  e.evaluationAuthorizationDecisionId =
    "DEC-0044";

  delete e.evaluationOutcomeDecisionId;

  e.evaluationAuthorizationStatus =
    "AUTHORIZED_WITH_LIMITS";

  if (before.currentState?.blockerSummary) {
    before.currentState.blockerSummary.blockingNow =
      "Evaluation Attempt #5 is explicitly authorized by DEC-0044 and prepared for exactly ONE governed Kaggle push. The push has NOT occurred yet; TEST inference has NOT begun.";

    before.currentState.blockerSummary.note =
      "The immutable local-snapshot loader remains execution-proven. DEC-0043 preserves the earlier two-push preflight governance deviation without retroactive authorization. DEC-0044 authorizes measurement only: BASE then CANDIDATE over the same 80 held-out TEST prompts. Evaluation remains NOT_RUN until real inference occurs; M1-M13 remain null; candidate remains EXPERIMENTAL_UNPROMOTED; GHARIBO-V0.1 remains NOT_CREATED.";
  }

  if (Array.isArray(before.nextActions)) {
    const action =
      before.nextActions.find((x) => x?.id === "ACT-0001");

    if (action) {
      action.priority = "P0";

      action.action =
        "Execute the single DEC-0044-authorized Evaluation Attempt #5 Kaggle benchmark: BASE then CANDIDATE over the same 80 held-out TEST prompts.";

      action.requires =
        "DEC-0044";

      action.references = [
        "governance/DEC-0044-evaluation-attempt-5-authorization.json",
        "apps/web/data/kaggle-eval/gharibo-eval-001/launch-plan.json",
        "scripts/eval/build-eval-kernel.mjs"
      ];

      action.status =
        "READY_FOR_EXECUTION";

      action.note =
        "Exactly one Kaggle push is authorized. Automatic retry is forbidden. No promotion is authorized. Once TEST inference begins the authorization is spent.";
    }
  }

  for (const value of Object.values(before)) {
    if (Array.isArray(value)) {
      const i =
        value.findIndex(
          (x) => x?.revision === "1.24.0"
        );

      if (i >= 0) {
        value.splice(i, 1);
      }
    }
  }

  return isEvaluationAttempt5AuthorizedGoldState(before);
}


/**
 * DEC-0046 authorizes exactly ONE Evaluation Attempt #6.
 *
 * This is additive over the terminal DEC-0045 failure state.
 * Attempt #5 history remains immutable; no result or promotion is created here.
 */
export function isEvaluationAttempt6AuthorizedGoldState(state) {
  if (state?.masterStateVersion === "1.26.0") {
    const r = state.training?.attempt6ArtifactReconciliation;
    const bundle = "1d98de8ad3d0342232bb653bb4e78889565f9b6a7a49ab41ece13171cf68867e";
    if (r?.decisionId !== "DEC-0047" ||
        r.reconciliationHash !== "0d78ec1a55df0a0d12b3485c87012b1c616a3915f89560e6f8354d9bc51b3243" ||
        r.authorizationDecisionId !== "DEC-0046" ||
        r.authorizationHash !== "3afac20d638e033c13d875381b97005891d3946f3ba2ac336b04093b287bca93" ||
        r.previousLaunchBundleHash !== "598ec55dff3bbffb33beb9e6c1672ca1797abb80a74cc5f34e7300b592853275" ||
        r.launchBundleHash !== bundle ||
        state.training.attempt6Authorization?.launchBundleHash !== bundle ||
        state.training.evaluationAuthorization?.attempt6LaunchBundleHash !== bundle ||
        r.adapterDataset?.datasetId !== "vokaigharibo/gharibo-exp-001-adapter-fec22ca2" ||
        r.adapterDataset.visibility !== "PRIVATE" || r.adapterDataset.remoteDownloadVerified !== true ||
        r.adapterDataset.exactlyOneAdapterDirectory !== true ||
        r.candidateAdapterSha256 !== "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f" ||
        r.maximumKernelPushes !== 1 || r.kernelPushesPerformed !== 0 || r.kernelPushesRemaining !== 1 ||
        r.automaticRetryAuthorized !== false || r.testInferenceOccurred !== false ||
        state.decisions?.filter(d => d.id === "DEC-0047" && d.status === "ACCEPTED" && d.supersedes === null && d.supersededBy === null).length !== 1) return false;
    // Remove only the new artifact-binding layer, then verify the original authorization.
    const before = structuredClone(state);
    before.masterStateVersion = "1.25.0";
    before.training.attempt6Authorization.launchBundleHash = r.previousLaunchBundleHash;
    before.training.evaluationAuthorization.attempt6LaunchBundleHash = r.previousLaunchBundleHash;
    delete before.training.attempt6ArtifactReconciliation;
    before.decisions = before.decisions.filter(d => d.id !== "DEC-0047");
    before.history = before.history.filter(h => h.revision !== "1.26.0");
    return isEvaluationAttempt6AuthorizedGoldState(before);
  }
  const training = state?.training;
  const attempt6 = training?.attempt6Authorization;
  const experiment =
    state?.experiments?.["GHARIBO-exp-001"];
  const evalAuthorization =
    training?.evaluationAuthorization;

  if (state?.masterStateVersion !== "1.25.0") {
    return false;
  }

  if (!attempt6 || !experiment || !evalAuthorization) {
    return false;
  }

  if (
    attempt6.decisionId !== "DEC-0046" ||
    attempt6.status !== "AUTHORIZED_NOT_LAUNCHED" ||
    attempt6.attemptNumber !== 6 ||
    attempt6.maximumKernelPushes !== 1 ||
    attempt6.kernelPushesPerformed !== 0 ||
    attempt6.kernelPushesRemaining !== 1 ||
    attempt6.automaticRetryAuthorized !== false ||
    attempt6.launchAttempted !== false ||
    attempt6.testInferenceOccurred !== false ||
    attempt6.metricValuesProduced !== 0 ||
    attempt6.authorizationSpent !== false ||
    attempt6.authorizationConsumed !== false ||
    attempt6.repairLocallyProven !== true ||
    attempt6.repairRuntimeProvenOnKaggle !== false ||
    attempt6.repairRegressionChecksPassed !== 9 ||
    attempt6.staticKernelChecksPassed !== 64 ||
    attempt6.notebookSha256 !==
      "eebd832d771467b8e468b8dbba946b7b7ff3e202f31ae52b6d76c2f1a7b0f48e" ||
    attempt6.launchBundleHash !==
      "598ec55dff3bbffb33beb9e6c1672ca1797abb80a74cc5f34e7300b592853275" ||
    attempt6.promptsSha256 !==
      "dcea32df3697921322afc33eae856bf6fd4e111785f63c4d399de7077e43f333" ||
    attempt6.repairSourceCommit !==
      "05d923f4ed3cada9093263839ba4f3c25717614b"
  ) {
    return false;
  }

  if (
    evalAuthorization.attempt6AuthorizationDecisionId !==
      "DEC-0046" ||
    evalAuthorization.attempt6AuthorizationHash !==
      "3afac20d638e033c13d875381b97005891d3946f3ba2ac336b04093b287bca93" ||
    evalAuthorization.attempt6Status !==
      "AUTHORIZED_NOT_LAUNCHED" ||
    evalAuthorization.attempt6Number !== 6 ||
    evalAuthorization.attempt6MaximumKernelPushes !== 1 ||
    evalAuthorization.attempt6KernelPushesPerformed !== 0 ||
    evalAuthorization.attempt6KernelPushesRemaining !== 1 ||
    evalAuthorization.attempt6AutomaticRetryAuthorized !== false ||
    evalAuthorization.attempt6ExecutionAuthorized !== true ||
    evalAuthorization.attempt6LaunchAttempted !== false ||
    evalAuthorization.attempt6TestInferenceOccurred !== false ||
    evalAuthorization.attempt6MetricValuesProduced !== 0
  ) {
    return false;
  }

  if (
    training?.evaluationResults !== 0 ||
    experiment.evaluationStatus !== "NOT_RUN" ||
    experiment.evaluationScore !== null ||
    experiment.promotable !== false ||
    experiment.readinessStatus !==
      "ATTEMPT_6_AUTHORIZED_AWAITING_EXECUTION" ||
    experiment.evaluationAuthorizationDecisionId !==
      "DEC-0046" ||
    experiment.evaluationAuthorizationStatus !==
      "AUTHORIZED_WITH_LIMITS_ONE_PUSH_AVAILABLE" ||
    experiment.evaluationOutcomeDecisionId !==
      "DEC-0045" ||
    experiment.evaluationAttemptNumber !== 6 ||
    experiment.evaluationKernelPushesRemaining !== 1
  ) {
    return false;
  }

  const v01 =
    (state?.models?.derivedModels || [])
      .find((m) => m?.id === "GHARIBO-V0.1");

  if (!v01 || v01.status !== "NOT_CREATED") {
    return false;
  }

  const decisions =
    Array.isArray(state?.decisions)
      ? state.decisions
      : [];

  const dec46 =
    decisions.filter(
      (d) => d?.id === "DEC-0046"
    );

  if (
    dec46.length !== 1 ||
    dec46[0].status !== "ACCEPTED" ||
    dec46[0].supersedes !== null ||
    dec46[0].supersededBy !== null
  ) {
    return false;
  }

  // Strip ONLY the DEC-0046 layer and prove DEC-0045 still holds exactly beneath it.
  const before =
    structuredClone(state);

  before.masterStateVersion =
    "1.24.0";

  before.decisions =
    before.decisions.filter(
      (d) => d?.id !== "DEC-0046"
    );

  delete before.training.attempt6Authorization;

  const ea =
    before.training.evaluationAuthorization;

  for (const key of Object.keys(ea)) {
    if (key.startsWith("attempt6")) {
      delete ea[key];
    }
  }

  const e =
    before.experiments?.["GHARIBO-exp-001"];

  e.readinessStatus =
    "ATTEMPT_5_FAILED_PRE_INFERENCE_AWAITING_HUMAN_DECISION";

  e.evaluationAuthorizationDecisionId =
    "DEC-0044";

  e.evaluationAuthorizationStatus =
    "EXHAUSTED_ONE_PUSH_CONSUMED";

  e.evaluationOutcomeDecisionId =
    "DEC-0045";

  delete e.evaluationAttemptNumber;
  delete e.evaluationKernelPushesRemaining;

  if (before.currentState?.blockerSummary) {
    before.currentState.blockerSummary.blockingNow =
      "Evaluation Attempt #5 failed PRE-INFERENCE on Kaggle kernel Version 4 during immutable snapshot_download. Its single authorized push is exhausted. No retry or Attempt #6 is authorized.";

    before.currentState.blockerSummary.note =
      "No BASE or CANDIDATE inference occurred, M1-M13 remain null, and the candidate remains EXPERIMENTAL_UNPROMOTED. A Hugging Face Hub post-install refresh repair exists on branch fix/attempt5-v4-hfhub-refresh at commit 05d923f4ed3cada9093263839ba4f3c25717614b; it is locally regression-proven only, not merged to main, not Kaggle-runtime-proven, and not authorized for execution.";
  }

  if (Array.isArray(before.nextActions)) {
    const action =
      before.nextActions.find(
        (x) => x?.id === "ACT-0001"
      );

    if (action) {
      action.priority = "P0";

      action.action =
        "Human decision required: decide whether any future evaluation execution should be authorized. A locally regression-proven repair candidate exists at 05d923f4ed3cada9093263839ba4f3c25717614b, but it is not merged or execution-authorized.";

      action.requires =
        "NEW_EXPLICIT_HUMAN_DECISION_AFTER_DEC-0045";

      action.references = [
        "governance/DEC-0045-evaluation-attempt-5-failure.json",
        "governance/DEC-0044-evaluation-attempt-5-authorization.json",
        "fix/attempt5-v4-hfhub-refresh@05d923f4ed3cada9093263839ba4f3c25717614b"
      ];

      action.status =
        "BLOCKED_AWAITING_HUMAN_DECISION";

      action.note =
        "Attempt #5 exhausted its single push and failed before inference. No automatic retry and no Attempt #6 are authorized.";
    }
  }

  before.history =
    (before.history || [])
      .filter(
        (h) => h?.revision !== "1.25.0"
      );

  return isEvaluationAttempt5FailedGoldState(before);
}


/**
 * DEC-0048 post-evaluation forensic closure.
 *
 * This does not rewrite or weaken any historical authorization.
 * It recognizes only the exact v1.27 EXP-001 closure, then
 * reconstructs the accepted v1.26 DEC-0047 checkpoint and
 * delegates to the existing Attempt #6 validator.
 */
function isExp001ForensicClosureGoldState(state) {
  if (
    state?.masterStateVersion !== "1.27.0" ||
    state?.updatedAt !== "2026-09-17"
  ) {
    return false;
  }

  const experiment =
    state?.experiments?.["GHARIBO-exp-001"];

  const closure = experiment?.forensicClosure;

  const decision =
    (state?.decisions || []).find(
      (d) => d?.id === "DEC-0048"
    );

  if (
    !decision ||
    decision.status !== "ACCEPTED" ||
    decision.date !== "2026-09-17" ||
    decision.supersedes !== null ||
    decision.supersededBy !== null ||
    decision.architectureChanging !== false ||

    experiment?.evaluationStatus !==
      "ATTEMPT_6_INFERENCE_COMPLETE_SCORING_NON_DECISIONAL" ||

    experiment?.evaluationScore !== null ||
    experiment?.promotable !== false ||

    experiment?.readinessStatus !==
      "CLOSED_NON_PROMOTABLE_TRAINING_OBJECTIVE_DEFECT" ||

    closure?.decisionId !== "DEC-0048" ||
    !/^[0-9a-f]{64}$/.test(
      closure?.decisionHash ?? ""
    ) ||

    closure?.rootCause !==
      "TRAINING_WINDOW_TRUNCATION_EXCLUDED_ASSISTANT_GOLD_PAYLOAD" ||

    closure
      ?.trainAssistantEntirelyOutsideEffectiveWindow
      ?.count !== 640 ||

    closure
      ?.trainAssistantEntirelyOutsideEffectiveWindow
      ?.total !== 640 ||

    closure
      ?.validationAssistantEntirelyOutsideEffectiveWindow
      ?.count !== 80 ||

    closure
      ?.validationAssistantEntirelyOutsideEffectiveWindow
      ?.total !== 80 ||

    closure?.assistantOnlyLoss !== false ||
    closure?.maxLength !== 512 ||
    closure?.testConsumed !== true ||

    closure?.testReusableForExp002Optimization !== false ||

    closure?.candidateStatus !==
      "EXPERIMENTAL_NON_PROMOTABLE" ||

    closure?.ghariboV01Status !==
      "NOT_CREATED"
  ) {
    return false;
  }

  const before = structuredClone(state);

  before.masterStateVersion = "1.26.0";
  before.updatedAt = "2026-09-16";

  before.currentState.trainingInvariant =
    "TRAINING COMPLETED — EXPERIMENTAL ADAPTER ONLY; NO MODEL PROMOTION AND NO EVALUATION CLAIM";

  if (before.currentState?.blockerSummary) {
    before.currentState.blockerSummary.blockingNow =
      "Attempt #6 is ready for its single authorized Kaggle kernel push after DEC-0047 binds the missing accepted private adapter input. No kernel push or TEST inference has occurred.";

    before.currentState.blockerSummary.note =
      "DEC-0046 authorization remains unchanged. DEC-0047 reconciles only the launch artifact: notebook and evaluation semantics unchanged; one push remaining; no automatic retry or promotion.";
  }

  const e =
    before.experiments["GHARIBO-exp-001"];

  e.evaluationStatus = "NOT_RUN";
  e.evaluationScore = null;

  e.readinessStatus =
    "ATTEMPT_6_AUTHORIZED_AWAITING_EXECUTION";

  e.promotable = false;

  e.promotionBlockedReason =
    "Training completed, but promotion requires at least one real evaluation result and none exists. Training completion is not model promotion (ADR-0008).";

  delete e.forensicClosure;

  before.decisions =
    before.decisions.filter(
      (d) => d?.id !== "DEC-0048"
    );

  before.history =
    (before.history || []).filter(
      (h) => h?.revision !== "1.27.0"
    );

  const act1 =
    (before.nextActions || []).find(
      (a) => a?.id === "ACT-0001"
    );

  if (act1) {
    act1.priority = "P0";

    act1.action =
      "READY_FOR_THE_SINGLE_KAGGLE_KERNEL_PUSH: use the DEC-0047 reconciled bundle under the existing DEC-0046 one-push authorization. This preparation task stops before execution.";

    act1.requires = "DEC-0046 + DEC-0047";

    act1.references = [
      "governance/DEC-0047-attempt-6-artifact-reconciliation.json",
      "governance/DEC-0046-evaluation-attempt-6-authorization.json",
      "governance/DEC-0045-evaluation-attempt-5-failure.json",
      "scripts/eval/prepare-eval-launch-attempt6.mjs",
      "scripts/eval/check-attempt6-authorization-gate.mjs"
    ];

    act1.status =
      "READY_FOR_THE_SINGLE_KAGGLE_KERNEL_PUSH";

    act1.note =
      "Zero pushes performed; one remaining. No TEST inference, scoring, tuning, training, selection, or promotion performed.";
  }

  return isEvaluationAttempt6AuthorizedGoldState(
    before
  );
}

/**
 * DEC-0049 EXP-002 training-contract preparation.
 *
 * This layer records PREPARATION ONLY. It does not authorize a Kaggle launch, a
 * training run, an evaluation or a promotion, and it does not weaken any
 * historical authorization: it recognizes the exact v1.28 EXP-002 contract
 * preparation, then reconstructs the accepted v1.27 DEC-0048 forensic closure
 * and delegates to the existing validator beneath it.
 */
function isExp002ContractPreparedGoldState(state) {
  if (
    state?.masterStateVersion !== "1.28.0" ||
    state?.updatedAt !== "2026-09-17"
  ) {
    return false;
  }

  const training = state?.training?.exp002;
  const experiment = state?.experiments?.["GHARIBO-exp-002"];
  const blocker = (state?.blockers || []).find((b) => b?.id === "BLK-0005");

  const decision = (state?.decisions || []).find((d) => d?.id === "DEC-0049");

  if (
    !decision ||
    decision.status !== "ACCEPTED" ||
    decision.date !== "2026-09-17" ||
    decision.supersedes !== null ||
    decision.supersededBy !== null ||
    decision.architectureChanging !== false ||

    // PREPARATION ONLY. Nothing may have been launched, trained or measured.
    !training ||
    training.status !== "CONTRACT_PREPARED_NOT_AUTHORIZED" ||
    training.trainingAuthorized !== false ||
    training.kernelPushesPerformed !== 0 ||
    training.maximumKernelPushes !== 1 ||
    training.testPayloadInBundle !== false ||
    training.qualificationPayloadInBundle !== false ||
    training.preflightVerdict !== "PASS" ||

    !experiment ||
    experiment.trainingAuthorized !== false ||
    experiment.authorizationDecisionId !== null ||
    experiment.kernelPushesPerformed !== 0 ||
    experiment.kernelPushesRemaining !== 1 ||
    experiment.evaluationStatus !== "NOT_RUN" ||
    experiment.evaluationScore !== null ||
    experiment.promotable !== false ||
    experiment.readinessStatus !== "CONTRACT_PREPARED_AWAITING_LAUNCH_AUTHORIZATION" ||
    experiment.lossContract !== "ASSISTANT_ONLY_EXPLICIT_LABEL_MASK" ||
    experiment.qualificationSplit?.policy !== "SEALED_UNTIL_V1_PROMOTION_GATE" ||

    // The EXP-001 closure must remain exactly as DEC-0048 left it.
    state?.experiments?.["GHARIBO-exp-001"]?.promotable !== false ||
    state?.experiments?.["GHARIBO-exp-001"]?.readinessStatus !==
      "CLOSED_NON_PROMOTABLE_TRAINING_OBJECTIVE_DEFECT" ||

    // No evaluation result may be claimed anywhere.
    state?.training?.evaluationResults !== 0 ||

    // The independent-corpus gap must stay recorded, not be quietly dropped.
    !blocker ||
    blocker.status !== "OPEN" ||
    blocker.blocks?.includes("V1-PROMOTION") !== true
  ) {
    return false;
  }

  // Strip ONLY the DEC-0049 layer and prove the accepted state underneath.
  const before = structuredClone(state);

  before.masterStateVersion = "1.27.0";

  before.decisions = before.decisions.filter((d) => d?.id !== "DEC-0049");

  before.history = (before.history || []).filter((h) => h?.revision !== "1.28.0");

  delete before.experiments["GHARIBO-exp-002"];

  before.models.derivedModels = (before.models.derivedModels || []).filter(
    (m) => m?.id !== "GHARIBO-exp-002" && m?.id !== "GHARIBO-V1"
  );

  delete before.training.exp002;

  before.blockers = (before.blockers || []).filter((b) => b?.id !== "BLK-0005");

  before.nextActions = (before.nextActions || []).filter(
    (a) => a?.id !== "ACT-0003" && a?.id !== "ACT-0004"
  );

  for (const action of before.nextActions) {
    if (action.id === "ACT-0001") {
      action.status = "READY_FOR_THE_SINGLE_KAGGLE_KERNEL_PUSH";
      delete action.note;
    }
    if (action.id === "ACT-0002") {
      delete action.status;
      delete action.note;
    }
  }

  before.validation.results = (before.validation.results || []).filter(
    (r) => r?.gate !== "exp002:preflight"
  );

  return isExp001ForensicClosureGoldState(before);
}

/**
 * DEC-0050 LOCAL ONLY execution policy + local hardware infeasibility.
 *
 * This layer records a POLICY CHANGE and a HARDWARE DETERMINATION. It authorizes
 * nothing to run, and it does not weaken any historical authorization: it
 * recognizes the exact v1.29 state, then reconstructs the accepted v1.28 DEC-0049
 * contract preparation and delegates to the validator beneath it.
 */
function isLocalOnlyPolicyGoldState(state) {
  if (
    state?.masterStateVersion !== "1.29.0" ||
    state?.updatedAt !== "2026-09-17"
  ) {
    return false;
  }

  const training = state?.training?.exp002;
  const experiment = state?.experiments?.["GHARIBO-exp-002"];
  const blocker = (state?.blockers || []).find((b) => b?.id === "BLK-0006");
  const decision = (state?.decisions || []).find((d) => d?.id === "DEC-0050");

  if (
    !decision ||
    decision.status !== "ACCEPTED" ||
    decision.date !== "2026-09-17" ||
    decision.supersedes !== null ||
    decision.supersededBy !== null ||
    decision.architectureChanging !== false ||

    // LOCAL ONLY, and nothing running anywhere.
    !training ||
    training.status !== "BLOCKED_LOCAL_HARDWARE_INFEASIBLE" ||
    training.executionPolicy !== "LOCAL_ONLY" ||
    training.trainingAuthorized !== false ||
    training.localHardwareVerdict !== "NO" ||
    training.kaggleAuthorized !== false ||
    training.testPayloadInBundle !== false ||
    training.qualificationPayloadInBundle !== false ||

    // The Kaggle launch gate must be GONE, not merely annotated.
    "authorizationPhrase" in training ||
    "maximumKernelPushes" in training ||
    "kernelPushesPerformed" in training ||

    !experiment ||
    experiment.trainingAuthorized !== false ||
    experiment.evaluationStatus !== "NOT_RUN" ||
    experiment.evaluationScore !== null ||
    experiment.promotable !== false ||
    experiment.executionPolicy !== "LOCAL_ONLY" ||
    experiment.localHardwareVerdict !== "NO" ||
    experiment.readinessStatus !== "BLOCKED_LOCAL_HARDWARE_INFEASIBLE" ||
    experiment.qualificationSplit?.policy !== "SEALED_UNTIL_V1_PROMOTION_GATE" ||

    // No evaluation result may be claimed anywhere.
    state?.training?.evaluationResults !== 0 ||

    // The EXP-001 closure must remain exactly as DEC-0048 left it.
    state?.experiments?.["GHARIBO-exp-001"]?.promotable !== false ||

    // Both open issues must stay recorded.
    !blocker ||
    blocker.status !== "OPEN" ||
    blocker.blocks?.includes("V1-PROMOTION") !== true ||
    (state?.blockers || []).find((b) => b?.id === "BLK-0005")?.status !== "OPEN" ||

    // The superseded Kaggle next-action must not be operative.
    (state?.nextActions || []).find((a) => a?.id === "ACT-0003")?.status !== "SUPERSEDED"
  ) {
    return false;
  }

  // Strip ONLY the DEC-0050 layer and prove the accepted state underneath.
  const before = structuredClone(state);

  before.masterStateVersion = "1.28.0";

  before.decisions = before.decisions.filter((d) => d?.id !== "DEC-0050");
  before.history = (before.history || []).filter((h) => h?.revision !== "1.29.0");
  before.blockers = (before.blockers || []).filter((b) => b?.id !== "BLK-0006");
  before.nextActions = (before.nextActions || []).filter((a) => a?.id !== "ACT-0005");
  before.validation.results = (before.validation.results || []).filter(
    (r) => r?.gate !== "exp002:local-hardware"
  );

  for (const action of before.nextActions) {
    if (action.id === "ACT-0003") {
      action.status = "BLOCKED_ON_HUMAN_AUTHORIZATION";
      delete action.supersededBy;
      action.action =
        "Await the single explicit human authorization 'AUTHORIZE EXP-002 TRAINING " +
        "LAUNCH' before any Kaggle kernel push. The prepared package, notebook and " +
        "private training payload are ready; one push is the maximum.";
      action.requires = "DEC-0049";
      action.references = [
        "governance/DEC-0049-exp002-training-contract-preparation.json",
        "data/derived/exp002/preflight.json",
        "data/derived/exp002/package/launch-summary.json",
      ];
      action.note =
        "Zero pushes performed; one available. No training, evaluation or promotion performed.";
    }
  }

  const e = before.experiments["GHARIBO-exp-002"];
  e.readinessStatus = "CONTRACT_PREPARED_AWAITING_LAUNCH_AUTHORIZATION";
  e.promotionBlockedReason =
    "Training has not been authorized, no run exists and no evaluation result exists. " +
    "Additionally BLK-0005 records that no independent source corpus exists, so any V1 " +
    "claim must state that it rests on the sealed EXP-002 qualification split.";
  delete e.executionPolicy;
  delete e.localHardwareVerdict;
  delete e.localHardwareArtifact;

  const t = before.training.exp002;
  t.status = "CONTRACT_PREPARED_NOT_AUTHORIZED";
  t.trainingAuthorized = false;
  t.authorizationPhrase = "AUTHORIZE EXP-002 TRAINING LAUNCH";
  t.maximumKernelPushes = 1;
  t.kernelPushesPerformed = 0;
  delete t.executionPolicy;
  delete t.localHardwareVerdict;
  delete t.localHardwareArtifact;
  delete t.kaggleAuthorized;
  delete t.supersededNextAction;

  return isExp002ContractPreparedGoldState(before);
}

/**
 * DEC-0051 local V1 runtime contract + local evaluation controller.
 *
 * This layer records LOCAL IMPLEMENTATION only. It authorizes nothing to run and
 * weakens no historical authorization: it recognizes the exact v1.30 state, then
 * reconstructs the accepted v1.29 LOCAL ONLY policy layer and delegates beneath it.
 */
function isLocalRuntimeContractGoldState(state) {
  if (
    state?.masterStateVersion !== "1.30.0" ||
    state?.updatedAt !== "2026-09-17"
  ) {
    return false;
  }

  const decision = (state?.decisions || []).find((d) => d?.id === "DEC-0051");
  const training = state?.training?.exp002;
  const experiment = state?.experiments?.["GHARIBO-exp-002"];

  if (
    !decision ||
    decision.status !== "ACCEPTED" ||
    decision.date !== "2026-09-17" ||
    decision.supersedes !== null ||
    decision.supersededBy !== null ||
    decision.architectureChanging !== false ||

    // The LOCAL ONLY posture from DEC-0050 must be entirely unchanged.
    training?.executionPolicy !== "LOCAL_ONLY" ||
    training?.kaggleAuthorized !== false ||
    training?.trainingAuthorized !== false ||
    training?.localHardwareVerdict !== "NO" ||
    "authorizationPhrase" in (training || {}) ||

    experiment?.executionPolicy !== "LOCAL_ONLY" ||
    experiment?.trainingAuthorized !== false ||
    experiment?.promotable !== false ||
    experiment?.evaluationScore !== null ||
    experiment?.localHardwareVerdict !== "NO" ||

    // Still nothing measured anywhere.
    state?.training?.evaluationResults !== 0 ||

    // Both open issues must remain recorded.
    (state?.blockers || []).find((b) => b?.id === "BLK-0005")?.status !== "OPEN" ||
    (state?.blockers || []).find((b) => b?.id === "BLK-0006")?.status !== "OPEN"
  ) {
    return false;
  }

  // Strip ONLY the DEC-0051 layer and prove the accepted state underneath.
  const before = structuredClone(state);

  before.masterStateVersion = "1.29.0";
  before.decisions = before.decisions.filter((d) => d?.id !== "DEC-0051");
  before.history = (before.history || []).filter((h) => h?.revision !== "1.30.0");
  before.validation.results = (before.validation.results || []).filter(
    (r) => r?.gate !== "exp002:v1-runtime-contract"
  );

  return isLocalOnlyPolicyGoldState(before);
}

/**
 * DEC-0052 empirical runtime projection + governed 100-row pilot.
 *
 * Records a PROJECTION and a PILOT configuration only. It does not authorize a
 * run, and it does not reduce the governed 560-row contract: this layer asserts
 * that the governed split hash is UNCHANGED. It recognizes the exact v1.31 state,
 * then reconstructs the accepted v1.30 layer and delegates beneath it.
 */
function isRuntimeProjectionGoldState(state) {
  if (
    state?.masterStateVersion !== "1.31.0" ||
    state?.updatedAt !== "2026-09-17"
  ) {
    return false;
  }

  const decision = (state?.decisions || []).find((d) => d?.id === "DEC-0052");
  const training = state?.training?.exp002;
  const projection = training?.runtimeProjection;
  const pilot = training?.pilotConfiguration;
  const experiment = state?.experiments?.["GHARIBO-exp-002"];

  if (
    !decision ||
    decision.status !== "ACCEPTED" ||
    decision.date !== "2026-09-17" ||
    decision.supersedes !== null ||
    decision.supersededBy !== null ||
    decision.architectureChanging !== false ||

    // LOCAL ONLY and nothing running.
    training?.executionPolicy !== "LOCAL_ONLY" ||
    training?.kaggleAuthorized !== false ||
    training?.trainingAuthorized !== false ||
    training?.localHardwareVerdict !== "NO" ||
    "authorizationPhrase" in (training || {}) ||

    // The projection must be recorded and must not have crossed the hard stop.
    !projection ||
    projection.hardStopHours !== 4.0 ||
    projection.governedConfigProjectedHours > projection.hardStopHours ||
    projection.pilotConfigProjectedHours > projection.hardStopHours ||

    // The PILOT must not be promotable or authorized.
    !pilot ||
    pilot.promotable !== false ||
    pilot.trainingAuthorized !== false ||
    pilot.rows !== 100 ||
    pilot.optimizerSteps !== 25 ||

    // The governed production contract must be UNCHANGED.
    experiment?.qualificationSplit?.policy !== "SEALED_UNTIL_V1_PROMOTION_GATE" ||
    experiment?.trainingAuthorized !== false ||
    experiment?.promotable !== false ||
    experiment?.evaluationScore !== null ||
    experiment?.localHardwareVerdict !== "NO" ||

    // Still nothing measured anywhere.
    state?.training?.evaluationResults !== 0 ||

    // Both open issues must remain recorded.
    (state?.blockers || []).find((b) => b?.id === "BLK-0005")?.status !== "OPEN" ||
    (state?.blockers || []).find((b) => b?.id === "BLK-0006")?.status !== "OPEN"
  ) {
    return false;
  }

  // Strip ONLY the DEC-0052 layer and prove the accepted state underneath.
  const before = structuredClone(state);

  before.masterStateVersion = "1.30.0";
  before.decisions = before.decisions.filter((d) => d?.id !== "DEC-0052");
  before.history = (before.history || []).filter((h) => h?.revision !== "1.31.0");
  before.validation.results = (before.validation.results || []).filter(
    (r) => r?.gate !== "exp002:runtime-projection"
  );
  delete before.training.exp002.runtimeProjection;
  delete before.training.exp002.pilotConfiguration;

  return isLocalRuntimeContractGoldState(before);
}

/**
 * DEC-0053 Kaggle authorized as the EXP-002 training compute host.
 *
 * Supersedes the DEC-0050 restriction of compute to local hardware and re-scopes
 * BLK-0006 so it no longer blocks training. It authorizes no RUN: it recognizes
 * the exact v1.32 state, then reconstructs the accepted v1.31 layer and delegates.
 */
function isKaggleComputeAuthorizedGoldState(state) {
  if (
    state?.masterStateVersion !== "1.32.0" ||
    state?.updatedAt !== "2026-09-17"
  ) {
    return false;
  }

  const decision = (state?.decisions || []).find((d) => d?.id === "DEC-0053");
  const t = state?.training?.exp002;
  const e = state?.experiments?.["GHARIBO-exp-002"];
  const b6 = (state?.blockers || []).find((b) => b?.id === "BLK-0006");

  if (
    !decision ||
    decision.status !== "ACCEPTED" ||
    decision.supersedes !== null ||
    decision.supersededBy !== null ||
    decision.architectureChanging !== false ||

    // Kaggle compute authorized, local GPU not required.
    t?.executionPolicy !== "KAGGLE_TRAINING_LOCAL_EVALUATION" ||
    t?.computeHost !== "KAGGLE_T4_CLASS" ||
    t?.localGpuRequired !== false ||
    t?.kaggleAuthorized !== true ||
    "authorizationPhrase" in (t || {}) ||

    // Nothing has actually run.
    t?.trainingAuthorized !== false ||
    t?.pilot?.trainingAuthorized !== false ||
    t?.pilot?.kernelPushesPerformed !== 0 ||
    t?.production?.trainingAuthorized !== false ||
    t?.production?.kernelPushesPerformed !== 0 ||
    t?.production?.gatedOnPilot !== true ||
    t?.production?.projectedHours > t?.production?.hardStopHours ||

    // The pilot must never be promotable.
    t?.pilot?.promotable !== false ||
    t?.pilot?.rows !== 100 ||
    t?.pilot?.projectedHours > t?.production?.hardStopHours ||

    // Evaluation, scoring and the holdout stay LOCAL.
    e?.executionPolicy !== "KAGGLE_TRAINING_LOCAL_EVALUATION" ||
    e?.trainingAuthorized !== false ||
    e?.promotable !== false ||
    e?.evaluationScore !== null ||
    e?.qualificationSplit?.policy !== "SEALED_UNTIL_V1_PROMOTION_GATE" ||

    // BLK-0006 must be re-scoped, not deleted.
    !b6 ||
    b6.status !== "RE_SCOPED_NOT_BLOCKING" ||
    (b6.blocks || []).length !== 0 ||

    // The independent-corpus gap must stay recorded.
    (state?.blockers || []).find((b) => b?.id === "BLK-0005")?.status !== "OPEN" ||

    // Still nothing measured anywhere.
    state?.training?.evaluationResults !== 0
  ) {
    return false;
  }

  // Strip ONLY the DEC-0053 layer and prove the accepted state underneath.
  const before = structuredClone(state);

  before.masterStateVersion = "1.31.0";
  before.decisions = before.decisions.filter((d) => d?.id !== "DEC-0053");
  before.history = (before.history || []).filter((h) => h?.revision !== "1.32.0");
  before.validation.results = (before.validation.results || []).filter(
    (r) => r?.gate !== "exp002:pilot-package"
  );

  const bt = before.training.exp002;
  bt.executionPolicy = "LOCAL_ONLY";
  bt.kaggleAuthorized = false;
  bt.status = "BLOCKED_LOCAL_HARDWARE_INFEASIBLE";
  delete bt.computeHost;
  delete bt.localGpuRequired;
  delete bt.pilot;
  delete bt.production;
  bt.supersededNextAction =
    "ACT-0003 (await 'AUTHORIZE EXP-002 TRAINING LAUNCH') is superseded by DEC-0050. " +
    "There is no Kaggle authorization gate.";

  const be = before.experiments["GHARIBO-exp-002"];
  be.executionPolicy = "LOCAL_ONLY";
  be.readinessStatus = "BLOCKED_LOCAL_HARDWARE_INFEASIBLE";
  be.promotionBlockedReason =
    "DEC-0050: the governed recipe cannot execute on the local hardware, so no run and no " +
    "evaluation result exists. Additionally BLK-0005 records that no independent source " +
    "corpus exists, so any future V1 claim must state that it rests on the sealed EXP-002 " +
    "qualification split.";
  delete be.computeHost;
  delete be.pilotPackageId;
  delete be.productionPackageId;

  for (const blocker of before.blockers) {
    if (blocker.id === "BLK-0006") {
      blocker.status = "OPEN";
      blocker.blocks = ["STAGE-1", "V1-PROMOTION"];
      blocker.title = "Local hardware cannot execute the governed EXP-002 recipe";
      blocker.detail =
        "The only NVIDIA device on this machine is a GeForce GT 730 (GK208, sm_35) behind driver " +
        "391.35 with 1-4 GB of DDR3, below the compute-capability, driver and VRAM floors of the " +
        "governed stack. Nothing was reduced to make it fit.";
    }
  }

  return isRuntimeProjectionGoldState(before);
}

/**
 * DEC-0054 pilot Version 1 dtype failure corrected at source; Version 2 pushed.
 *
 * Records a REPAIR and a RELAUNCH. It claims no training result: Version 1
 * produced zero optimizer steps, and Version 2 is only RUNNING. It recognizes
 * the exact v1.33 state, then reconstructs the accepted v1.32 layer beneath it.
 */
function isPilotV2RelaunchedGoldState(state) {
  if (
    state?.masterStateVersion !== "1.33.0" ||
    state?.updatedAt !== "2026-09-17"
  ) {
    return false;
  }

  const decision = (state?.decisions || []).find((d) => d?.id === "DEC-0054");
  const t = state?.training?.exp002;
  const e = state?.experiments?.["GHARIBO-exp-002"];

  if (
    !decision ||
    decision.status !== "ACCEPTED" ||
    decision.supersedes !== null ||
    decision.supersededBy !== null ||
    decision.architectureChanging !== false ||

    // Version 1 must stay recorded as a PRE-TRAINING failure with no result.
    t?.pilot?.version1?.kernelVersion !== 1 ||
    t?.pilot?.version1?.terminalStatus !== "KernelWorkerStatus.ERROR" ||
    t?.pilot?.version1?.classification !== "PRE_TRAINING_CONTRACT_FAILURE" ||
    t?.pilot?.version1?.optimizerStepsCompleted !== 0 ||
    t?.pilot?.version1?.trainingEvidenceProduced !== false ||

    // Version 2 is RUNNING - never "complete".
    t?.pilot?.kernelVersion !== 2 ||
    t?.pilot?.kernelPushesPerformed !== 1 ||
    t?.pilot?.observedStatus !== "KernelWorkerStatus.RUNNING" ||
    t?.pilot?.promotable !== false ||
    t?.pilot?.trainingAuthorized !== false ||

    // The corrected contract must be in force.
    t?.executionPolicy !== "KAGGLE_TRAINING_LOCAL_EVALUATION" ||
    t?.localGpuRequired !== false ||
    t?.production?.gatedOnPilot !== true ||
    t?.production?.trainingAuthorized !== false ||
    t?.production?.kernelPushesPerformed !== 0 ||

    // Evaluation untouched; pilot not promotable.
    e?.evaluationStatus !== "NOT_RUN" ||
    e?.evaluationScore !== null ||
    e?.promotable !== false ||
    e?.trainingAuthorized !== false ||
    e?.qualificationSplit?.policy !== "SEALED_UNTIL_V1_PROMOTION_GATE" ||
    state?.training?.evaluationResults !== 0 ||

    // Both open issues remain recorded.
    (state?.blockers || []).find((b) => b?.id === "BLK-0005")?.status !== "OPEN" ||
    (state?.blockers || []).find((b) => b?.id === "BLK-0006")?.status !== "RE_SCOPED_NOT_BLOCKING"
  ) {
    return false;
  }

  const before = structuredClone(state);

  before.masterStateVersion = "1.32.0";
  before.decisions = before.decisions.filter((d) => d?.id !== "DEC-0054");
  before.history = (before.history || []).filter((h) => h?.revision !== "1.33.0");
  before.validation.results = (before.validation.results || []).filter(
    (r) => r?.gate !== "exp002:pilot-kaggle-bundle"
  );

  const bt = before.training.exp002;
  bt.status = "PILOT_PACKAGE_PREPARED_AWAITING_LAUNCH_AUTHORIZATION";
  bt.pilot.packageId = "067bec301c6af0a2a675e41ba17548a6fb2b8f56b4787010322451b2b6668066";
  bt.pilot.notebookSha256 = "2425a1b38d84d414a858b2eaa4ea1052ebfbc6810413e7ccf58f2f41c8b70599";
  bt.pilot.kernelPushesPerformed = 0;
  delete bt.pilot.kernelVersion;
  delete bt.pilot.kernelRef;
  delete bt.pilot.observedStatus;
  delete bt.pilot.version1;
  bt.production.packageId = "5167db5f48678f79ed836b76070c021988af64874ed72c4f64faef362902d2bc";
  bt.production.notebookSha256 = "37fe02a39e58f594ee28a6a9793b2d3ca6e05b59f25f21c9e0b54a491fb395f5";

  const be = before.experiments["GHARIBO-exp-002"];
  be.readinessStatus = "PILOT_PACKAGE_PREPARED_AWAITING_LAUNCH_AUTHORIZATION";
  be.pilotPackageId = "067bec301c6af0a2a675e41ba17548a6fb2b8f56b4787010322451b2b6668066";
  be.productionPackageId = "5167db5f48678f79ed836b76070c021988af64874ed72c4f64faef362902d2bc";

  return isKaggleComputeAuthorizedGoldState(before);
}

/**
 * DEC-0055 EXP-002 pilot COMPLETE and integrity-verified.
 *
 * Records ARTIFACT RECOVERY AND VERIFICATION only. It promotes nothing, claims
 * no evaluation result, and requires the sealed qualification split to remain
 * untouched. It recognizes the exact v1.34 state, then reconstructs the accepted
 * v1.33 layer and delegates beneath it.
 */
function isPilotCompleteIntegrityVerifiedGoldState(state) {
  if (state?.masterStateVersion !== "1.34.0" || state?.updatedAt !== "2026-09-17") {
    return false;
  }
  const decision = (state?.decisions || []).find((d) => d?.id === "DEC-0055");
  const t = state?.training?.exp002;
  const e = state?.experiments?.["GHARIBO-exp-002"];
  if (
    !decision ||
    decision.status !== "ACCEPTED" ||
    decision.supersedes !== null ||
    decision.supersededBy !== null ||
    decision.architectureChanging !== false ||

    // The pilot is COMPLETE and integrity-verified - and nothing more.
    t?.status !== "PILOT_COMPLETE_INTEGRITY_PASS" ||
    t?.pilot?.observedStatus !== "KernelWorkerStatus.COMPLETE" ||
    t?.pilot?.kernelVersion !== 6 ||
    t?.pilot?.integrityVerdict !== "PASS" ||
    t?.pilot?.qualificationStatus !== "SEALED_UNTOUCHED" ||
    t?.pilot?.promotable !== false ||
    t?.pilot?.trainingAuthorized !== false ||
    t?.pilot?.version1?.optimizerStepsCompleted !== 0 ||

    // No evaluation, no promotion, no production run.
    e?.evaluationStatus !== "NOT_RUN" ||
    e?.evaluationScore !== null ||
    e?.promotable !== false ||
    e?.trainingAuthorized !== false ||
    e?.pilotIntegrityVerdict !== "PASS" ||
    e?.qualificationSplit?.policy !== "SEALED_UNTIL_V1_PROMOTION_GATE" ||
    state?.training?.evaluationResults !== 0 ||
    t?.production?.kernelPushesPerformed !== 0 ||
    t?.production?.trainingAuthorized !== false ||

    // Open issues stay recorded.
    (state?.blockers || []).find((b) => b?.id === "BLK-0005")?.status !== "OPEN" ||
    (state?.blockers || []).find((b) => b?.id === "BLK-0006")?.status !== "RE_SCOPED_NOT_BLOCKING"
  ) {
    return false;
  }
  const before = structuredClone(state);
  before.masterStateVersion = "1.33.0";
  before.decisions = before.decisions.filter((d) => d?.id !== "DEC-0055");
  before.history = (before.history || []).filter((h) => h?.revision !== "1.34.0");
  before.validation.results = (before.validation.results || []).filter(
    (r) => r?.gate !== "exp002:pilot-integrity"
  );
  const bt = before.training.exp002;
  bt.status = "PILOT_V2_RUNNING";
  bt.pilot.observedStatus = "KernelWorkerStatus.RUNNING";
  bt.pilot.kernelVersion = 2;
  delete bt.pilot.integrityVerdict;
  delete bt.pilot.adapterSha256;
  delete bt.pilot.integrityArtifact;
  delete bt.pilot.qualificationStatus;
  const be = before.experiments["GHARIBO-exp-002"];
  be.readinessStatus = "PILOT_V2_RUNNING";
  delete be.pilotIntegrityVerdict;
  return isPilotV2RelaunchedGoldState(before);
}

/**
 * DEC-0056 prospective authorization for the verified pilot adapter to enter the
 * V1 qualification gate.
 *
 * Records GATE ENTRY ONLY. It does not promote, does not declare V1, and requires
 * the qualification gold to remain local and unscored at this revision. It
 * recognizes the exact v1.35 state, then reconstructs v1.34 and delegates.
 */
function isQualificationGateEntryGoldState(state) {
  if (state?.masterStateVersion !== "1.35.0" || state?.updatedAt !== "2026-09-17") {
    return false;
  }
  const decision = (state?.decisions || []).find((d) => d?.id === "DEC-0056");
  const t = state?.training?.exp002;
  const q = t?.qualification;
  const e = state?.experiments?.["GHARIBO-exp-002"];
  if (
    !decision ||
    decision.status !== "ACCEPTED" ||
    decision.supersedes !== null ||
    decision.supersededBy !== null ||
    decision.architectureChanging !== false ||

    // Gate entry authorized; nothing promoted and nothing scored yet.
    q?.status !== "AUTHORIZED" ||
    q?.decisionId !== "DEC-0056" ||
    q?.rows !== 80 ||
    q?.goldLocal !== true ||
    q?.scoringLocal !== true ||
    q?.inferenceHost !== "KAGGLE_INFERENCE_ONLY" ||
    q?.evaluationStatus !== "NOT_RUN" ||
    t?.pilot?.qualificationStatus !== "AUTHORIZED_NOT_YET_RUN" ||
    t?.pilot?.promotable !== false ||
    t?.pilot?.trainingAuthorized !== false ||
    t?.pilot?.integrityVerdict !== "PASS" ||

    // No evaluation result, no promotion, no production run.
    e?.evaluationStatus !== "NOT_RUN" ||
    e?.evaluationScore !== null ||
    e?.promotable !== false ||
    e?.trainingAuthorized !== false ||
    e?.qualificationSplit?.policy !== "SEALED_UNTIL_V1_PROMOTION_GATE" ||
    state?.training?.evaluationResults !== 0 ||
    t?.production?.kernelPushesPerformed !== 0 ||
    t?.production?.trainingAuthorized !== false ||

    // Open issues stay recorded.
    (state?.blockers || []).find((b) => b?.id === "BLK-0005")?.status !== "OPEN" ||
    (state?.blockers || []).find((b) => b?.id === "BLK-0006")?.status !== "RE_SCOPED_NOT_BLOCKING"
  ) {
    return false;
  }
  const before = structuredClone(state);
  before.masterStateVersion = "1.34.0";
  before.decisions = before.decisions.filter((d) => d?.id !== "DEC-0056");
  before.history = (before.history || []).filter((h) => h?.revision !== "1.35.0");
  before.validation.results = (before.validation.results || []).filter(
    (r) => r?.gate !== "exp002:qualification-seal-open"
  );
  const bt = before.training.exp002;
  bt.pilot.qualificationStatus = "SEALED_UNTOUCHED";
  delete bt.pilot.qualificationAuthorization;
  delete bt.qualification;
  const be = before.experiments["GHARIBO-exp-002"];
  be.readinessStatus = "PILOT_COMPLETE_AWAITING_QUALIFICATION_AUTHORIZATION";
  return isPilotCompleteIntegrityVerifiedGoldState(before);
}

export function isAcceptedGoldGovernanceState(state) {
  return (
    isAcceptedGoldPreviewState(state) ||
    isIssuedGoldState(state) ||
    isExecutionAuthorizedGoldState(state) ||
    isKaggleStartAuthorizedGoldState(state) ||
    isKaggleLaunchRepairedGoldState(state) ||
    isKaggleLaunchReauthorizedGoldState(state) ||
    isEvaluationAuthorizedGoldState(state) ||
    isEvaluationInfrastructureBlockedGoldState(state) ||
    isEvaluationBenchmarkLaunchedGoldState(state) ||
    isEvaluationEscalatedGoldState(state) ||
    isEvaluationAttempt4AuthorizedGoldState(state) ||
    isEvaluationAttempt4LaunchedGoldState(state) ||
    isEvaluationAttempt4FailedGoldState(state) ||
    isEvaluationAttempt5AuthorizedGoldState(state) ||
    isEvaluationAttempt5FailedGoldState(state) ||
    isExp001ForensicClosureGoldState(state) ||
    isEvaluationAttempt6AuthorizedGoldState(state) ||
    isExp002ContractPreparedGoldState(state) ||
    isLocalOnlyPolicyGoldState(state) ||
    isLocalRuntimeContractGoldState(state) ||
    isRuntimeProjectionGoldState(state) ||
    isKaggleComputeAuthorizedGoldState(state) ||
    isPilotV2RelaunchedGoldState(state) ||
    isPilotCompleteIntegrityVerifiedGoldState(state) ||
    isQualificationGateEntryGoldState(state) ||
    isKaggleExecutionCompletedGoldState(state)
  );
}
