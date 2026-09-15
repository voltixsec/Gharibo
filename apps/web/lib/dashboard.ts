/**
 * Dashboard read-model — derives UI truth from governance/GHARIBO_MASTER_STATE.json.
 *
 * This module reads the authoritative project state file and produces typed
 * read-models for the dashboard, topbar and section pages. It NEVER fabricates
 * data. Every field maps to a real key in the master state; if the file is
 * missing, unreadable, or a field is absent, the read-model returns null and
 * the UI renders "unavailable" rather than inventing values.
 *
 * Schema authority: governance/GHARIBO_MASTER_STATE.json (schemaVersion 1.0.0).
 *
 * IMPORTANT — training truth:
 *   `training.status` is the single source of truth for the governed training
 *   lifecycle. Authorization records (DEC-0025..DEC-0029) grant permission to
 *   act; they do NOT mean training is running. This module deliberately keeps
 *   "authorized" and "running" distinct so the UI can never render an
 *   authorization as execution.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { StatusVariant } from "@/components/status";

/** Resolve the master state file from the repo root regardless of cwd. */
function masterStatePath(): string {
  // Next.js runs with cwd = apps/web; the repo root is two levels up.
  const repoRoot = join(process.cwd(), "..", "..");
  const candidates = [
    join(process.cwd(), "governance", "GHARIBO_MASTER_STATE.json"),
    join(repoRoot, "governance", "GHARIBO_MASTER_STATE.json"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

/** Raw shape of the subset of master state this module reads. */
interface MasterStateRaw {
  schemaVersion?: string;
  masterStateVersion?: string;
  updatedAt?: string;
  project?: {
    id?: string;
    name?: string;
    repository?: string;
    currentMajorProgram?: string;
    currentMilestone?: string;
    currentMilestoneTitle?: string;
    decisionAuthority?: string;
  };
  currentState?: {
    trainingStatus?: string;
    trainingHasStarted?: boolean;
    trainingInvariant?: string;
    currentMilestone?: string;
    milestoneStatus?: string;
    blockerSummary?: string;
  };
  datasets?: Record<
    string,
    {
      id?: string;
      version?: string;
      status?: string;
      format?: string;
      exampleCount?: number;
      contentFrozen?: boolean;
      split?: {
        seed?: string;
        counts?: { train?: number; validation?: number; test?: number };
      };
      audit?: {
        cohortSize?: number;
        pass?: number;
        needsReview?: number;
        fail?: number;
        auditedTestCount?: number;
      };
      hashes?: {
        algorithm?: string;
        datasetHash?: string;
        splitHashes?: { train?: string; validation?: string; test?: string };
      };
    }
  >;
  training?: {
    status?: string;
    hasStarted?: boolean;
    invariant?: string;
    method?: string;
    quantization?: string;
    baseModelCandidate?: string;
    computePolicy?: string;
    weightsDownloaded?: boolean;
    adaptersProduced?: number;
    checkpointsProduced?: number;
    evaluationResults?: number;
    engine?: {
      id?: string;
      name?: string;
      freezeLabel?: string;
      freezeApplied?: boolean;
    };
    worker?: { id?: string; provider?: string; interface?: string };
    qualification?: { status?: string; ctoAccepted?: boolean };
    authorization?: {
      status?: string;
      decisionId?: string;
      scope?: string;
      packageIssued?: boolean;
      runIssued?: boolean;
      executionStarted?: boolean;
      executionAuthorized?: boolean;
      kaggleStartAuthorized?: boolean;
    };
    issuance?: {
      status?: string;
      packageId?: string;
      runId?: string;
      runStatus?: string;
      issuedAt?: string;
    };
    executionAuthorization?: {
      status?: string;
      decisionId?: string;
      fromStatus?: string;
      toStatus?: string;
      executionAuthorized?: boolean;
      kaggleStartAuthorized?: boolean;
      executionStarted?: boolean;
    };
    kaggleStartAuthorization?: {
      status?: string;
      decisionId?: string;
      startAuthorized?: boolean;
      testUsage?: string;
      testPayloadIncluded?: boolean;
      testPayloadAccessed?: boolean;
      accelerator?: string;
      expectedRunStatus?: string;
    };
    kaggleLaunchAuthorization?: {
      status?: string;
      decisionId?: string;
      supersedesDecisionId?: string;
      launchAttempted?: boolean;
      launchAccepted?: boolean;
      executionStarted?: boolean;
      trainingHasStarted?: boolean;
      startAuthorized?: boolean;
      notebookSha256?: string;
      expectedRunStatus?: string;
      testUsage?: string;
      testPayloadIncluded?: boolean;
      testPayloadAccessed?: boolean;
      accelerator?: string;
      worker?: string;
      authorizedCodeSnapshot?: string;
      authorizedAt?: string;
      launchAttemptHistory?: LaunchAttempt[];
    };
    kaggleLaunchReauthorization?: {
      status?: string;
      decisionId?: string;
      supersedesDecisionId?: string;
      launchAttempted?: boolean;
      launchAccepted?: boolean;
      executionStarted?: boolean;
      trainingHasStarted?: boolean;
      startAuthorized?: boolean;
      notebookSha256?: string;
      expectedRunStatus?: string;
      testUsage?: string;
      testPayloadIncluded?: boolean;
      testPayloadAccessed?: boolean;
      accelerator?: string;
      worker?: string;
      authorizedCodeSnapshot?: string;
      authorizedAt?: string;
      launchAttemptHistory?: LaunchAttempt[];
    };
  };
  experiments?: Record<
    string,
    {
      id?: string;
      status?: string;
      baseModel?: string;
      datasetVersion?: string;
      method?: string;
      engine?: string;
      worker?: string;
      trainingRunId?: string;
      packageId?: string;
      evaluationStatus?: string;
      evaluationScore?: number | null;
      readinessStatus?: string;
      promotionTarget?: string;
      promotable?: boolean;
      promotionBlockedReason?: string;
      runStatus?: string;
      references?: string[];
    }
  >;
  models?: {
    baseModelCandidates?: Array<{
      id?: string;
      role?: string;
      status?: string;
      note?: string;
    }>;
    derivedModels?: Array<{ id?: string; status?: string; note?: string }>;
  };
  blockers?: Array<{
    id?: string;
    title?: string;
    detail?: string;
    severity?: string;
    status?: string;
    blocks?: string[];
  }>;
  nextActions?: Array<{
    id?: string;
    priority?: string;
    action?: string;
    title?: string;
    description?: string;
    requires?: string;
    references?: string[];
  }>;
}

interface LaunchAttempt {
  attemptNumber?: number;
  decisionId?: string;
  kernelRef?: string;
  kernelVersion?: number;
  externalStatus?: string;
  terminalStage?: string;
  rootCauseClass?: string;
  rootCauseDetail?: string;
  trainingStarted?: boolean;
  testPayloadUploaded?: boolean;
  testPayloadAccessed?: boolean;
}

/** Safe read with fallback. Returns null when the source is unavailable. */
function readMasterState(): MasterStateRaw | null {
  try {
    const filePath = masterStatePath();
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw) as MasterStateRaw;
  } catch {
    return null;
  }
}

/** Singleton cache — read once per module lifetime. */
let cached: MasterStateRaw | null | undefined;
function getState(): MasterStateRaw | null {
  if (cached === undefined) {
    cached = readMasterState();
  }
  return cached;
}

/** Invalidate the cache (used by tests and HMR). */
export function invalidateDashboardCache(): void {
  cached = undefined;
}

/** True when the authoritative state file could be read. */
export function isStateAvailable(): boolean {
  return getState() !== null;
}

// ---------------------------------------------------------------------------
// Governed training lifecycle
// ---------------------------------------------------------------------------

/**
 * The governed training lifecycle as the interface must present it.
 *
 * NOT_STARTED   — no execution has begun (the invariant holds)
 * AUTHORIZED    — a decision permits a launch, but nothing has executed
 * QUEUED        — the run exists and is queued for a worker
 * RUNNING       — external evidence shows execution has actually started
 * COMPLETED     — training finished
 * FAILED        — an executed attempt reached a terminal error
 * INTERRUPTED   — execution stopped before completion
 * RESUMABLE     — stopped but can be resumed
 * UNKNOWN       — the state file is unavailable
 */
export type TrainingLifecycle =
  | "NOT_STARTED"
  | "AUTHORIZED"
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "INTERRUPTED"
  | "RESUMABLE"
  | "UNKNOWN";

export interface TrainingLifecycleInfo {
  /** Coarse lifecycle phase derived from governed evidence. */
  lifecycle: TrainingLifecycle;
  /** The literal `training.status` string from the master state, if present. */
  rawStatus: string | null;
  /** True only when external evidence shows execution actually started. */
  hasStarted: boolean;
  /** True when the invariant "TRAINING HAS NOT STARTED" holds. */
  invariantHolds: boolean;
  /** The invariant text, surfaced verbatim so it is never softened. */
  invariant: string | null;
  /** Human-readable explanation of why this lifecycle phase was chosen. */
  reason: string;
}

/**
 * Derive the training lifecycle from governed evidence.
 *
 * Precedence is strict and evidence-based: an executed attempt that failed
 * outranks an authorization, and an authorization never outranks execution.
 */
export function getTrainingLifecycle(): TrainingLifecycleInfo {
  const s = getState();
  if (!s) {
    return {
      lifecycle: "UNKNOWN",
      rawStatus: null,
      hasStarted: false,
      invariantHolds: false,
      invariant: null,
      reason: "Governance state file is unavailable.",
    };
  }

  const t = s.training;
  const rawStatus = t?.status ?? s.currentState?.trainingStatus ?? null;
  const hasStarted =
    (t?.hasStarted ?? s.currentState?.trainingHasStarted ?? false) === true;
  const invariant = t?.invariant ?? s.currentState?.trainingInvariant ?? null;

  const launchAuth = t?.kaggleLaunchReauthorization ?? t?.kaggleLaunchAuthorization;
  const attempts =
    launchAuth?.launchAttemptHistory ??
    t?.kaggleLaunchAuthorization?.launchAttemptHistory ??
    [];
  const lastAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;
  const anAttemptFailed =
    !!lastAttempt?.externalStatus && lastAttempt.externalStatus !== "COMPLETE";

  const base = {
    rawStatus,
    hasStarted,
    invariantHolds: !hasStarted,
    invariant,
  };

  // Execution evidence first — never let an authorization mask a failure.
  if (hasStarted) {
    const normalized = (rawStatus ?? "").toUpperCase();
    if (normalized.includes("FAIL")) {
      return {
        ...base,
        lifecycle: "FAILED",
        reason: "External evidence shows an executed run reached a terminal failure.",
      };
    }
    if (normalized.includes("INTERRUPT") || normalized.includes("CANCEL")) {
      return {
        ...base,
        lifecycle: "INTERRUPTED",
        reason: "External evidence shows execution stopped before completion.",
      };
    }
    if (normalized.includes("RESUM")) {
      return {
        ...base,
        lifecycle: "RESUMABLE",
        reason: "The run stopped and is recorded as resumable.",
      };
    }
    if (normalized.includes("COMPLETE")) {
      return {
        ...base,
        lifecycle: "COMPLETED",
        reason: "External evidence shows training completed.",
      };
    }
    return {
      ...base,
      lifecycle: "RUNNING",
      reason: "External evidence shows execution has started.",
    };
  }

  // No execution yet. A run may still exist in a queued state.
  const runStatus = (t?.issuance?.runStatus ?? "").toUpperCase();
  if (runStatus === "QUEUED" || launchAuth?.expectedRunStatus === "QUEUED") {
    // A queued run with a failed prior attempt is reported as authorized-for-retry,
    // not as "running" and not as a silent success.
    if (anAttemptFailed) {
      return {
        ...base,
        lifecycle: "AUTHORIZED",
        reason:
          "A prior launch attempt failed before training began; a retry is authorized. Training has not started.",
      };
    }
    return {
      ...base,
      lifecycle: "QUEUED",
      reason: "A run is queued for the worker. Training has not started.",
    };
  }

  // Authorization without execution.
  if (
    launchAuth ||
    t?.kaggleStartAuthorization?.startAuthorized ||
    t?.executionAuthorization?.executionAuthorized ||
    t?.authorization?.executionAuthorized
  ) {
    return {
      ...base,
      lifecycle: "AUTHORIZED",
      reason:
        "A governance decision authorizes action, but no execution evidence exists. Training has not started.",
    };
  }

  if (anAttemptFailed) {
    return {
      ...base,
      lifecycle: "FAILED",
      reason: "A recorded launch attempt failed before training began.",
    };
  }

  return {
    ...base,
    lifecycle: "NOT_STARTED",
    reason: "No execution evidence exists for this experiment.",
  };
}

/** Map a governed training lifecycle to a semantic status variant. */
export function lifecycleVariant(lifecycle: TrainingLifecycle): StatusVariant {
  switch (lifecycle) {
    case "COMPLETED":
      return "success";
    case "RUNNING":
      return "running";
    case "QUEUED":
      return "queued";
    case "AUTHORIZED":
      return "authorized";
    case "FAILED":
      return "failed";
    case "INTERRUPTED":
      return "warning";
    case "RESUMABLE":
      return "warning";
    case "NOT_STARTED":
      return "not-started";
    case "UNKNOWN":
    default:
      return "neutral";
  }
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface ProjectStateInfo {
  id: string | null;
  name: string | null;
  program: string | null;
  milestone: string | null;
  milestoneTitle: string | null;
  milestoneStatus: string | null;
  masterStateVersion: string | null;
  schemaVersion: string | null;
  updatedAt: string | null;
  decisionAuthority: string | null;
  nextAction: string | null;
  nextActionId: string | null;
  blockerSummary: string | null;
}

export function getProjectState(): ProjectStateInfo {
  const s = getState();
  if (!s) {
    return {
      id: null,
      name: null,
      program: null,
      milestone: null,
      milestoneTitle: null,
      milestoneStatus: null,
      masterStateVersion: null,
      schemaVersion: null,
      updatedAt: null,
      decisionAuthority: null,
      nextAction: null,
      nextActionId: null,
      blockerSummary: null,
    };
  }
  const action = (s.nextActions ?? [])[0];
  return {
    id: s.project?.id ?? null,
    name: s.project?.name ?? null,
    program: s.project?.currentMajorProgram ?? null,
    milestone: s.project?.currentMilestone ?? null,
    milestoneTitle: s.project?.currentMilestoneTitle ?? null,
    milestoneStatus: s.currentState?.milestoneStatus ?? null,
    masterStateVersion: s.masterStateVersion ?? null,
    schemaVersion: s.schemaVersion ?? null,
    updatedAt: s.updatedAt ?? null,
    decisionAuthority: s.project?.decisionAuthority ?? null,
    nextAction: action?.action ?? action?.title ?? null,
    nextActionId: action?.id ?? null,
    blockerSummary: s.currentState?.blockerSummary ?? null,
  };
}

// ---------------------------------------------------------------------------
// Active experiment
// ---------------------------------------------------------------------------

export interface LaunchAttemptInfo {
  attemptNumber: number | null;
  decisionId: string | null;
  externalStatus: string | null;
  terminalStage: string | null;
  rootCauseClass: string | null;
  rootCauseDetail: string | null;
  trainingStarted: boolean;
  testPayloadAccessed: boolean;
}

export interface ExperimentInfo {
  experimentId: string | null;
  experimentStatus: string | null;
  baseModel: string | null;
  datasetVersion: string | null;
  method: string | null;
  engine: string | null;
  worker: string | null;
  workerProvider: string | null;
  packageId: string | null;
  runId: string | null;
  runStatus: string | null;
  authorizationStatus: string | null;
  authorizationDecisionId: string | null;
  launchStatus: string | null;
  launchDecisionId: string | null;
  supersedesDecisionId: string | null;
  launchAttempted: boolean;
  launchAccepted: boolean;
  expectedRunStatus: string | null;
  accelerator: string | null;
  attemptCount: number;
  attempts: LaunchAttemptInfo[];
  latestAttempt: LaunchAttemptInfo | null;
  readinessStatus: string | null;
  promotionTarget: string | null;
  promotable: boolean;
  promotionBlockedReason: string | null;
}

function emptyExperimentInfo(): ExperimentInfo {
  return {
    experimentId: null,
    experimentStatus: null,
    baseModel: null,
    datasetVersion: null,
    method: null,
    engine: null,
    worker: null,
    workerProvider: null,
    packageId: null,
    runId: null,
    runStatus: null,
    authorizationStatus: null,
    authorizationDecisionId: null,
    launchStatus: null,
    launchDecisionId: null,
    supersedesDecisionId: null,
    launchAttempted: false,
    launchAccepted: false,
    expectedRunStatus: null,
    accelerator: null,
    attemptCount: 0,
    attempts: [],
    latestAttempt: null,
    readinessStatus: null,
    promotionTarget: null,
    promotable: false,
    promotionBlockedReason: null,
  };
}

function toAttemptInfo(a: LaunchAttempt): LaunchAttemptInfo {
  return {
    attemptNumber: a.attemptNumber ?? null,
    decisionId: a.decisionId ?? null,
    externalStatus: a.externalStatus ?? null,
    terminalStage: a.terminalStage ?? null,
    rootCauseClass: a.rootCauseClass ?? null,
    rootCauseDetail: a.rootCauseDetail ?? null,
    trainingStarted: a.trainingStarted ?? false,
    testPayloadAccessed: a.testPayloadAccessed ?? false,
  };
}

export function getExperimentInfo(experimentId = "GHARIBO-exp-001"): ExperimentInfo {
  const s = getState();
  if (!s) return emptyExperimentInfo();

  const exp = s.experiments?.[experimentId];
  const t = s.training;
  const launchAuth = t?.kaggleLaunchReauthorization ?? t?.kaggleLaunchAuthorization;
  const history =
    launchAuth?.launchAttemptHistory ??
    t?.kaggleLaunchAuthorization?.launchAttemptHistory ??
    [];
  const attempts = history.map(toAttemptInfo);
  const latestAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;

  return {
    // The experiment record is the authority for identity; fall back to the
    // requested id only when the record genuinely exists under that key.
    experimentId: exp ? (exp.id ?? experimentId) : null,
    experimentStatus: exp?.status ?? null,
    baseModel: exp?.baseModel ?? t?.baseModelCandidate ?? null,
    datasetVersion: exp?.datasetVersion ?? null,
    method: exp?.method ?? t?.method ?? null,
    engine: exp?.engine ?? t?.engine?.name ?? null,
    worker: exp?.worker ?? t?.worker?.id ?? null,
    workerProvider: t?.worker?.provider ?? null,
    packageId: exp?.packageId ?? t?.issuance?.packageId ?? null,
    runId: exp?.trainingRunId ?? t?.issuance?.runId ?? null,
    runStatus: exp?.runStatus ?? t?.issuance?.runStatus ?? null,
    authorizationStatus:
      exp?.readinessStatus ?? t?.authorization?.status ?? null,
    authorizationDecisionId: t?.authorization?.decisionId ?? null,
    launchStatus: launchAuth?.status ?? null,
    launchDecisionId: launchAuth?.decisionId ?? null,
    supersedesDecisionId: t?.kaggleLaunchReauthorization?.supersedesDecisionId ?? null,
    launchAttempted: launchAuth?.launchAttempted ?? false,
    launchAccepted: launchAuth?.launchAccepted ?? false,
    expectedRunStatus:
      t?.kaggleLaunchReauthorization?.expectedRunStatus ??
      t?.kaggleStartAuthorization?.expectedRunStatus ??
      null,
    accelerator:
      t?.kaggleLaunchReauthorization?.accelerator ??
      t?.kaggleStartAuthorization?.accelerator ??
      null,
    attemptCount: attempts.length,
    attempts,
    latestAttempt,
    readinessStatus: exp?.readinessStatus ?? null,
    promotionTarget: exp?.promotionTarget ?? null,
    promotable: exp?.promotable ?? false,
    promotionBlockedReason: exp?.promotionBlockedReason ?? null,
  };
}

// ---------------------------------------------------------------------------
// Governed Gold dataset
// ---------------------------------------------------------------------------

export interface GoldDatasetInfo {
  datasetId: string | null;
  version: string | null;
  status: string | null;
  format: string | null;
  exampleCount: number | null;
  contentFrozen: boolean;
  train: number | null;
  validation: number | null;
  test: number | null;
  splitSeed: string | null;
  auditCohortSize: number | null;
  auditPass: number | null;
  auditNeedsReview: number | null;
  auditFail: number | null;
  auditedTestCount: number | null;
  datasetHash: string | null;
  splitHashes: { train: string | null; validation: string | null; test: string | null };
  testUsage: string | null;
  testPayloadIncluded: boolean | null;
}

function emptyGold(): GoldDatasetInfo {
  return {
    datasetId: null,
    version: null,
    status: null,
    format: null,
    exampleCount: null,
    contentFrozen: false,
    train: null,
    validation: null,
    test: null,
    splitSeed: null,
    auditCohortSize: null,
    auditPass: null,
    auditNeedsReview: null,
    auditFail: null,
    auditedTestCount: null,
    datasetHash: null,
    splitHashes: { train: null, validation: null, test: null },
    testUsage: null,
    testPayloadIncluded: null,
  };
}

/**
 * Read the Governed Gold dataset.
 *
 * The Gold corpus has its own governed physical source rather than living in
 * the legacy SQLite dataset model, so this reads `masterState.datasets[<id>]`
 * — the authoritative governance record — and never the legacy tables.
 */
export function getGoldDatasetInfo(
  datasetId = "GHARIBO-Research-Gold-v0.1",
): GoldDatasetInfo {
  const s = getState();
  if (!s) return emptyGold();

  const d = s.datasets?.[datasetId];
  if (!d) return emptyGold();

  const startAuth = s.training?.kaggleStartAuthorization;
  const launchAuth =
    s.training?.kaggleLaunchReauthorization ?? s.training?.kaggleLaunchAuthorization;

  return {
    datasetId: d.id ?? null,
    version: d.version ?? null,
    status: d.status ?? null,
    format: d.format ?? null,
    exampleCount: d.exampleCount ?? null,
    contentFrozen: d.contentFrozen ?? false,
    train: d.split?.counts?.train ?? null,
    validation: d.split?.counts?.validation ?? null,
    test: d.split?.counts?.test ?? null,
    splitSeed: d.split?.seed ?? null,
    auditCohortSize: d.audit?.cohortSize ?? null,
    auditPass: d.audit?.pass ?? null,
    auditNeedsReview: d.audit?.needsReview ?? null,
    auditFail: d.audit?.fail ?? null,
    auditedTestCount: d.audit?.auditedTestCount ?? null,
    datasetHash: d.hashes?.datasetHash ?? null,
    splitHashes: {
      train: d.hashes?.splitHashes?.train ?? null,
      validation: d.hashes?.splitHashes?.validation ?? null,
      test: d.hashes?.splitHashes?.test ?? null,
    },
    testUsage: startAuth?.testUsage ?? launchAuth?.testUsage ?? null,
    testPayloadIncluded:
      launchAuth?.testPayloadIncluded ?? startAuth?.testPayloadIncluded ?? null,
  };
}

// ---------------------------------------------------------------------------
// Model registry / promotion truth
// ---------------------------------------------------------------------------

export interface DerivedModelInfo {
  id: string;
  status: string;
  note: string;
}

export interface ModelStateInfo {
  baseModelId: string | null;
  baseModelRole: string | null;
  baseModelStatus: string | null;
  promotedModel: string | null;
  hasPromotedModel: boolean;
  evaluationState: string | null;
  derivedModels: DerivedModelInfo[];
  /** The reserved target version, intentionally NOT created. */
  reservedTarget: string | null;
  /** The experiment's declared promotion target, if one is registered. */
  promotionTarget: string | null;
}

export function getModelStateInfo(experimentId = "GHARIBO-exp-001"): ModelStateInfo {
  const s = getState();
  const exp = s?.experiments?.[experimentId];
  const derived = (s?.models?.derivedModels ?? []).map((m) => ({
    id: m.id ?? "unknown",
    status: m.status ?? "unknown",
    note: m.note ?? "",
  }));
  const candidate = (s?.models?.baseModelCandidates ?? [])[0];

  // A model is only "promoted" when the registry says so. A reserved name with
  // status NOT_CREATED is explicitly not a promotion.
  const promoted = derived.find(
    (m) => m.id === "GHARIBO-V0.1" && m.status !== "NOT_CREATED",
  );

  return {
    baseModelId: candidate?.id ?? s?.training?.baseModelCandidate ?? null,
    baseModelRole: candidate?.role ?? null,
    baseModelStatus: candidate?.status ?? null,
    promotedModel: promoted?.id ?? null,
    hasPromotedModel: !!promoted,
    evaluationState: exp?.evaluationStatus ?? null,
    derivedModels: derived,
    reservedTarget: derived.find((m) => m.id === "GHARIBO-V0.1")?.id ?? null,
    promotionTarget: exp?.promotionTarget ?? null,
  };
}

// ---------------------------------------------------------------------------
// Blockers / next actions
// ---------------------------------------------------------------------------

export interface BlockerEntry {
  id: string;
  title: string;
  detail: string;
  severity: string;
  status: string;
}

export interface NextActionEntry {
  id: string;
  priority: string;
  action: string;
  requires: string;
  references: string[];
}

export interface BlockerInfo {
  summary: string | null;
  blockers: BlockerEntry[];
  openBlockers: BlockerEntry[];
  nextActions: NextActionEntry[];
}

export function getBlockerInfo(): BlockerInfo {
  const s = getState();
  if (!s) {
    return { summary: null, blockers: [], openBlockers: [], nextActions: [] };
  }
  const blockers: BlockerEntry[] = (s.blockers ?? []).map((b) => ({
    id: b.id ?? "unknown",
    title: b.title ?? "Untitled",
    detail: b.detail ?? "",
    severity: b.severity ?? "unknown",
    status: b.status ?? "unknown",
  }));
  const nextActions: NextActionEntry[] = (s.nextActions ?? []).map((a) => ({
    id: a.id ?? "unknown",
    priority: a.priority ?? "P2",
    action: a.action ?? a.title ?? "Untitled action",
    requires: a.requires ?? "",
    references: a.references ?? [],
  }));
  return {
    summary: s.currentState?.blockerSummary ?? null,
    blockers,
    openBlockers: blockers.filter((b) => b.status.toUpperCase() !== "CLOSED"),
    nextActions,
  };
}

// ---------------------------------------------------------------------------
// Engine / qualification (used by System and Training pages)
// ---------------------------------------------------------------------------

export interface EngineInfo {
  id: string | null;
  name: string | null;
  freezeLabel: string | null;
  freezeApplied: boolean;
  qualificationStatus: string | null;
  ctoAccepted: boolean;
  method: string | null;
  quantization: string | null;
  computePolicy: string | null;
  weightsDownloaded: boolean;
  adaptersProduced: number | null;
  checkpointsProduced: number | null;
  evaluationResults: number | null;
}

export function getEngineInfo(): EngineInfo {
  const s = getState();
  const q = s?.training?.qualification;
  return {
    id: s?.training?.engine?.id ?? null,
    name: s?.training?.engine?.name ?? null,
    freezeLabel: s?.training?.engine?.freezeLabel ?? null,
    freezeApplied: s?.training?.engine?.freezeApplied ?? false,
    qualificationStatus: q?.status ?? null,
    ctoAccepted: q?.ctoAccepted ?? false,
    method: s?.training?.method ?? null,
    quantization: s?.training?.quantization ?? null,
    computePolicy: s?.training?.computePolicy ?? null,
    weightsDownloaded: s?.training?.weightsDownloaded ?? false,
    adaptersProduced: s?.training?.adaptersProduced ?? null,
    checkpointsProduced: s?.training?.checkpointsProduced ?? null,
    evaluationResults: s?.training?.evaluationResults ?? null,
  };
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

export interface TopbarProjectState {
  label: string;
  variant: StatusVariant;
}

/** Derive a compact, truthful operational status for the topbar. */
export function getProjectStateForTopbar(): TopbarProjectState {
  const info = getTrainingLifecycle();

  switch (info.lifecycle) {
    case "RUNNING":
      return { label: "Training running", variant: "running" };
    case "COMPLETED":
      return { label: "Training complete", variant: "success" };
    case "FAILED":
      return { label: "Training failed", variant: "failed" };
    case "INTERRUPTED":
      return { label: "Training interrupted", variant: "warning" };
    case "RESUMABLE":
      return { label: "Resumable", variant: "warning" };
    case "QUEUED":
      return { label: "Queued", variant: "queued" };
    case "AUTHORIZED": {
      const s = getState();
      const decision =
        s?.training?.kaggleLaunchReauthorization?.decisionId ??
        s?.training?.kaggleLaunchAuthorization?.decisionId ??
        s?.training?.kaggleStartAuthorization?.decisionId ??
        null;
      return {
        label: decision ? `Launch authorized · ${decision}` : "Launch authorized",
        variant: "authorized",
      };
    }
    case "NOT_STARTED":
      return { label: "Training not started", variant: "not-started" };
    case "UNKNOWN":
    default:
      return { label: "State unavailable", variant: "neutral" };
  }
}
