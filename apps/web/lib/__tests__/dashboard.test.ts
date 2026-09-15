/**
 * Tests for the dashboard read-model.
 *
 * These tests verify two things that matter for UI truth:
 *   1. The read-model maps the ACTUAL master-state schema — including the
 *      governed dataset record, the experiment record and the DERIVED model
 *      registry — rather than a remembered shape.
 *   2. When the source is unavailable or a field is absent, the read-model
 *      returns null/empty instead of fabricating a value.
 *
 * The mock state below is a faithful excerpt of
 * governance/GHARIBO_MASTER_STATE.json at masterStateVersion 1.10.0.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock node:fs before importing the module under test.
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

import * as fs from "node:fs";
import {
  getProjectState,
  getExperimentInfo,
  getGoldDatasetInfo,
  getModelStateInfo,
  getBlockerInfo,
  getEngineInfo,
  getTrainingLifecycle,
  getProjectStateForTopbar,
  lifecycleVariant,
  isStateAvailable,
  invalidateDashboardCache,
} from "../dashboard";

const MOCK_STATE = {
  schemaVersion: "1.0.0",
  masterStateVersion: "1.10.0",
  updatedAt: "2026-09-15",
  project: {
    id: "GHARIBO",
    name: "GHARIBO AI LAB",
    currentMajorProgram: "Post-training infrastructure and qualification",
    currentMilestone: "M3C",
    currentMilestoneTitle: "Real Model-Compatibility Qualification",
    decisionAuthority: "CTO",
  },
  currentState: {
    trainingStatus: "NOT_STARTED",
    trainingHasStarted: false,
    trainingInvariant: "TRAINING HAS NOT STARTED",
    currentMilestone: "M3C",
    milestoneStatus: "COMPLETE",
    blockerSummary: "DEC-0029 supersedes the DEC-0028 launch artifact.",
  },
  datasets: {
    "GHARIBO-Research-Gold-v0.1": {
      id: "GHARIBO-Research-Gold-v0.1",
      version: "0.1.0",
      status: "ACCEPTED",
      format: "OpenAI Harmony",
      exampleCount: 800,
      contentFrozen: true,
      split: { seed: "20260914", counts: { train: 640, validation: 80, test: 80 } },
      audit: {
        cohortSize: 100,
        pass: 100,
        needsReview: 0,
        fail: 0,
        auditedTestCount: 0,
      },
      hashes: {
        algorithm: "sha256",
        datasetHash: "84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5",
        splitHashes: {
          train: "84025de18403b8660d9702877b2b6fd329cedb886cad0095ab67e4daa3828ad2",
          validation: "063fb4422aed247b3f92c0f0d5b1291af46fd4357ca48829a7e7f6ce98815787",
          test: "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",
        },
      },
    },
  },
  training: {
    status: "NOT_STARTED",
    hasStarted: false,
    invariant: "TRAINING HAS NOT STARTED",
    method: "QLoRA + SFT",
    quantization: "4-bit",
    baseModelCandidate: "openai/gpt-oss-20b",
    computePolicy: "ZERO_COST",
    weightsDownloaded: false,
    adaptersProduced: 0,
    checkpointsProduced: 0,
    evaluationResults: 0,
    engine: {
      id: "unsloth-core",
      name: "Unsloth Core",
      freezeLabel: "unsloth-freeze-2026.09.15",
      freezeApplied: true,
    },
    worker: {
      id: "KaggleTrainingWorker",
      provider: "Kaggle Notebooks (free NVIDIA T4)",
    },
    qualification: { status: "QUALIFIED", ctoAccepted: true },
    authorization: {
      status: "KAGGLE_LAUNCH_REAUTHORIZED_AWAITING_RETRY",
      decisionId: "DEC-0025",
      packageIssued: true,
      runIssued: true,
      executionStarted: false,
      executionAuthorized: true,
      kaggleStartAuthorized: true,
    },
    issuance: {
      status: "ISSUED_DRAFT",
      packageId: "78dd1bf374ed1c53785ea50bf179b1b7a4764d40c121d3d41cda4e2a2e3e68f2",
      runId: "ea6e30f2-ce26-4323-b35a-3436ee867eaf",
      runStatus: "QUEUED",
    },
    executionAuthorization: {
      status: "EXECUTION_AUTHORIZED_QUEUED",
      decisionId: "DEC-0026",
      executionAuthorized: true,
      kaggleStartAuthorized: false,
      executionStarted: false,
    },
    kaggleStartAuthorization: {
      status: "KAGGLE_START_AUTHORIZED",
      decisionId: "DEC-0027",
      startAuthorized: true,
      testUsage: "HASH_INTEGRITY_ONLY",
      testPayloadIncluded: false,
      testPayloadAccessed: false,
      accelerator: "NvidiaTeslaT4",
      expectedRunStatus: "QUEUED",
    },
    kaggleLaunchAuthorization: {
      status: "KAGGLE_LAUNCH_REPAIRED_AUTHORIZED",
      decisionId: "DEC-0028",
      launchAttempted: false,
      launchAccepted: false,
      testUsage: "HASH_INTEGRITY_ONLY",
      testPayloadIncluded: false,
      expectedRunStatus: "QUEUED",
      accelerator: "NvidiaTeslaT4",
      launchAttemptHistory: [
        {
          attemptNumber: 1,
          decisionId: "DEC-0027",
          externalStatus: "KernelWorkerStatus.ERROR",
          terminalStage: "notebook Section 4 (pinned engine install)",
          rootCauseClass: "DEPENDENCY_INSTALL_FAILURE_WITH_DIAGNOSTIC_SUPPRESSED",
          rootCauseDetail: "uv pip install returned exit status 1",
          trainingStarted: false,
          testPayloadAccessed: false,
        },
      ],
    },
    kaggleLaunchReauthorization: {
      status: "KAGGLE_LAUNCH_REAUTHORIZED",
      decisionId: "DEC-0029",
      supersedesDecisionId: "DEC-0028",
      startAuthorized: true,
      launchAttempted: false,
      launchAccepted: false,
      executionStarted: false,
      trainingHasStarted: false,
      expectedRunStatus: "QUEUED",
      testUsage: "HASH_INTEGRITY_ONLY",
      testPayloadIncluded: false,
      testPayloadAccessed: false,
      accelerator: "NvidiaTeslaT4",
      worker: "kaggle",
      launchAttemptHistory: [
        {
          attemptNumber: 1,
          decisionId: "DEC-0027",
          externalStatus: "KernelWorkerStatus.ERROR",
          terminalStage: "notebook Section 4 (pinned engine install)",
          rootCauseClass: "DEPENDENCY_INSTALL_FAILURE_WITH_DIAGNOSTIC_SUPPRESSED",
          rootCauseDetail: "uv pip install returned exit status 1",
          trainingStarted: false,
          testPayloadAccessed: false,
        },
        {
          attemptNumber: 2,
          decisionId: "DEC-0028",
          externalStatus: "KernelWorkerStatus.ERROR",
          terminalStage: "notebook Section 4, install dry-run",
          rootCauseClass: "FROZEN_SET_RESOLVER_UNSATISFIABLE_IN_SINGLE_TRANSACTION",
          rootCauseDetail:
            "unsloth caps datasets below 4.4.0 while the frozen set pins datasets==5.0.1",
          trainingStarted: false,
          testPayloadAccessed: false,
        },
      ],
    },
  },
  experiments: {
    "GHARIBO-exp-001": {
      id: "GHARIBO-exp-001",
      status: "EXPERIMENT",
      baseModel: "openai/gpt-oss-20b",
      datasetVersion: "GHARIBO-Research-Gold-v0.1",
      method: "QLoRA + SFT",
      engine: "Unsloth Core",
      worker: "KaggleTrainingWorker",
      trainingRunId: "ea6e30f2-ce26-4323-b35a-3436ee867eaf",
      packageId: "78dd1bf374ed1c53785ea50bf179b1b7a4764d40c121d3d41cda4e2a2e3e68f2",
      evaluationStatus: "NOT_RUN",
      evaluationScore: null,
      readinessStatus: "KAGGLE_LAUNCH_REAUTHORIZED_AWAITING_RETRY",
      promotionTarget: "GHARIBO-V0.1",
      promotable: false,
      promotionBlockedReason:
        "Promotion requires at least one evaluation result and a training-run reference.",
      runStatus: "QUEUED",
    },
  },
  models: {
    baseModelCandidates: [
      {
        id: "openai/gpt-oss-20b",
        role: "INITIAL_BASE_MODEL_CANDIDATE",
        status: "CANDIDATE",
      },
    ],
    derivedModels: [
      {
        id: "GHARIBO-exp-001",
        status: "EXPERIMENT",
        note: "Registered as an EXPERIMENT only.",
      },
      { id: "GHARIBO-V0.1", status: "NOT_CREATED", note: "Reserved name." },
    ],
  },
  blockers: [
    {
      id: "BLK-0001",
      status: "CLOSED",
      title: "Free-Kaggle v6 qualification completed",
      detail: "CLOSED 2026-09-15.",
    },
  ],
  nextActions: [
    {
      id: "ACT-0001",
      priority: "P0",
      action: "Submit the exact DEC-0027 launch bundle to the private Kaggle T4 worker.",
      requires: "DEC-0027",
      references: ["docs/TRAINING_STRATEGY.md"],
    },
  ],
};

function mockState(value: unknown) {
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(value));
  invalidateDashboardCache();
}

function mockMissingState() {
  vi.mocked(fs.existsSync).mockReturnValue(false);
  invalidateDashboardCache();
}

describe("dashboard read-model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateDashboardCache();
  });

  describe("when master state is unavailable", () => {
    beforeEach(mockMissingState);

    it("reports state as unavailable and returns null project state", () => {
      expect(isStateAvailable()).toBe(false);
      const result = getProjectState();
      expect(result.program).toBeNull();
      expect(result.milestone).toBeNull();
      expect(result.masterStateVersion).toBeNull();
    });

    it("returns null experiment info", () => {
      const result = getExperimentInfo();
      expect(result.experimentId).toBeNull();
      expect(result.runStatus).toBeNull();
      expect(result.attemptCount).toBe(0);
    });

    it("returns empty gold dataset info", () => {
      const result = getGoldDatasetInfo();
      expect(result.datasetId).toBeNull();
      expect(result.exampleCount).toBeNull();
      expect(result.train).toBeNull();
    });

    it("returns empty model state", () => {
      const result = getModelStateInfo();
      expect(result.hasPromotedModel).toBe(false);
      expect(result.derivedModels).toEqual([]);
    });

    it("reports the training lifecycle as UNKNOWN", () => {
      const result = getTrainingLifecycle();
      expect(result.lifecycle).toBe("UNKNOWN");
      expect(result.hasStarted).toBe(false);
    });

    it("reports the topbar state as unavailable", () => {
      const result = getProjectStateForTopbar();
      expect(result.label).toBe("State unavailable");
      expect(result.variant).toBe("neutral");
    });
  });

  describe("when master state is available", () => {
    beforeEach(() => mockState(MOCK_STATE));

    it("extracts project state", () => {
      const result = getProjectState();
      expect(result.id).toBe("GHARIBO");
      expect(result.program).toBe("Post-training infrastructure and qualification");
      expect(result.milestone).toBe("M3C");
      expect(result.milestoneStatus).toBe("COMPLETE");
      expect(result.masterStateVersion).toBe("1.10.0");
      expect(result.decisionAuthority).toBe("CTO");
      expect(result.nextActionId).toBe("ACT-0001");
    });

    it("extracts experiment info from the experiment and training records", () => {
      const result = getExperimentInfo();
      expect(result.experimentId).toBe("GHARIBO-exp-001");
      expect(result.experimentStatus).toBe("EXPERIMENT");
      expect(result.baseModel).toBe("openai/gpt-oss-20b");
      expect(result.runStatus).toBe("QUEUED");
      expect(result.worker).toBe("KaggleTrainingWorker");
      expect(result.launchStatus).toBe("KAGGLE_LAUNCH_REAUTHORIZED");
      expect(result.launchDecisionId).toBe("DEC-0029");
      expect(result.supersedesDecisionId).toBe("DEC-0028");
      expect(result.launchAttempted).toBe(false);
      expect(result.launchAccepted).toBe(false);
      expect(result.attemptCount).toBe(2);
      expect(result.latestAttempt?.externalStatus).toBe("KernelWorkerStatus.ERROR");
      expect(result.latestAttempt?.trainingStarted).toBe(false);
    });

    it("never reports an attempt as having started training", () => {
      const result = getExperimentInfo();
      for (const attempt of result.attempts) {
        expect(attempt.trainingStarted).toBe(false);
        expect(attempt.testPayloadAccessed).toBe(false);
      }
    });

    it("extracts the governed Gold dataset from the datasets map", () => {
      const result = getGoldDatasetInfo();
      expect(result.datasetId).toBe("GHARIBO-Research-Gold-v0.1");
      expect(result.status).toBe("ACCEPTED");
      expect(result.exampleCount).toBe(800);
      expect(result.train).toBe(640);
      expect(result.validation).toBe(80);
      expect(result.test).toBe(80);
      expect(result.auditCohortSize).toBe(100);
      expect(result.auditPass).toBe(100);
      expect(result.auditNeedsReview).toBe(0);
      expect(result.auditFail).toBe(0);
      expect(result.auditedTestCount).toBe(0);
      expect(result.contentFrozen).toBe(true);
      expect(result.datasetHash).toBe(
        "84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5",
      );
      expect(result.testUsage).toBe("HASH_INTEGRITY_ONLY");
      expect(result.testPayloadIncluded).toBe(false);
    });

    it("confirms the split sums to the declared example count", () => {
      const result = getGoldDatasetInfo();
      expect((result.train ?? 0) + (result.validation ?? 0) + (result.test ?? 0)).toBe(
        result.exampleCount,
      );
    });

    it("treats GHARIBO-V0.1 as NOT created", () => {
      const result = getModelStateInfo();
      expect(result.hasPromotedModel).toBe(false);
      expect(result.promotedModel).toBeNull();
      expect(result.evaluationState).toBe("NOT_RUN");
      expect(result.promotionTarget).toBe("GHARIBO-V0.1");
      expect(result.reservedTarget).toBe("GHARIBO-V0.1");
      expect(result.derivedModels).toHaveLength(2);
    });

    it("extracts blocker and next-action info", () => {
      const result = getBlockerInfo();
      expect(result.summary).toContain("DEC-0029");
      expect(result.blockers).toHaveLength(1);
      expect(result.blockers[0].title).toContain("qualification");
      expect(result.openBlockers).toHaveLength(0);
      expect(result.nextActions).toHaveLength(1);
      expect(result.nextActions[0].priority).toBe("P0");
      expect(result.nextActions[0].requires).toBe("DEC-0027");
    });

    it("extracts engine qualification info", () => {
      const result = getEngineInfo();
      expect(result.name).toBe("Unsloth Core");
      expect(result.qualificationStatus).toBe("QUALIFIED");
      expect(result.ctoAccepted).toBe(true);
      expect(result.freezeLabel).toBe("unsloth-freeze-2026.09.15");
      expect(result.weightsDownloaded).toBe(false);
      expect(result.adaptersProduced).toBe(0);
      expect(result.evaluationResults).toBe(0);
    });
  });

  describe("training lifecycle derivation", () => {
    it("reports AUTHORIZED — never RUNNING — when a decision permits a retry", () => {
      mockState(MOCK_STATE);
      const result = getTrainingLifecycle();
      expect(result.lifecycle).toBe("AUTHORIZED");
      expect(result.hasStarted).toBe(false);
      expect(result.invariantHolds).toBe(true);
      expect(result.invariant).toBe("TRAINING HAS NOT STARTED");
    });

    it("maps AUTHORIZED to the authorized variant, never to success", () => {
      mockState(MOCK_STATE);
      const result = getTrainingLifecycle();
      expect(lifecycleVariant(result.lifecycle)).toBe("authorized");
      expect(lifecycleVariant(result.lifecycle)).not.toBe("success");
      expect(lifecycleVariant(result.lifecycle)).not.toBe("healthy");
    });

    it("never reports RUNNING for the current authorization-only state", () => {
      mockState(MOCK_STATE);
      expect(getTrainingLifecycle().lifecycle).not.toBe("RUNNING");
    });

    it("reports NOT_STARTED when no decision or execution evidence exists", () => {
      mockState({
        ...MOCK_STATE,
        training: {
          ...MOCK_STATE.training,
          issuance: { ...MOCK_STATE.training.issuance, runStatus: "DRAFT" },
          authorization: {
            ...MOCK_STATE.training.authorization,
            executionAuthorized: false,
            kaggleStartAuthorized: false,
          },
          executionAuthorization: undefined,
          kaggleStartAuthorization: undefined,
          kaggleLaunchAuthorization: undefined,
          kaggleLaunchReauthorization: undefined,
        },
      });
      const result = getTrainingLifecycle();
      expect(result.lifecycle).toBe("NOT_STARTED");
      expect(lifecycleVariant(result.lifecycle)).toBe("not-started");
    });

    it("reports RUNNING only when external evidence shows execution started", () => {
      mockState({
        ...MOCK_STATE,
        currentState: { ...MOCK_STATE.currentState, trainingHasStarted: true },
        training: { ...MOCK_STATE.training, hasStarted: true, status: "RUNNING" },
      });
      const result = getTrainingLifecycle();
      expect(result.lifecycle).toBe("RUNNING");
      expect(result.hasStarted).toBe(true);
      expect(result.invariantHolds).toBe(false);
      expect(lifecycleVariant(result.lifecycle)).toBe("running");
    });

    it("reports FAILED when an executed run reached a terminal error", () => {
      mockState({
        ...MOCK_STATE,
        currentState: { ...MOCK_STATE.currentState, trainingHasStarted: true },
        training: { ...MOCK_STATE.training, hasStarted: true, status: "FAILED" },
      });
      expect(getTrainingLifecycle().lifecycle).toBe("FAILED");
    });

    it("reports COMPLETED only for a completed execution", () => {
      mockState({
        ...MOCK_STATE,
        currentState: { ...MOCK_STATE.currentState, trainingHasStarted: true },
        training: { ...MOCK_STATE.training, hasStarted: true, status: "COMPLETED" },
      });
      expect(getTrainingLifecycle().lifecycle).toBe("COMPLETED");
      expect(lifecycleVariant("COMPLETED")).toBe("success");
    });

    it("reports QUEUED when a run is queued and no attempt has failed", () => {
      mockState({
        ...MOCK_STATE,
        training: {
          ...MOCK_STATE.training,
          kaggleLaunchAuthorization: undefined,
          kaggleLaunchReauthorization: undefined,
        },
      });
      const result = getTrainingLifecycle();
      expect(result.lifecycle).toBe("QUEUED");
      expect(lifecycleVariant(result.lifecycle)).toBe("queued");
    });
  });

  describe("topbar derivation", () => {
    it("never claims training is running or successful in the current state", () => {
      mockState(MOCK_STATE);
      const result = getProjectStateForTopbar();
      expect(result.variant).not.toBe("success");
      expect(result.variant).not.toBe("running");
      expect(result.label).toContain("DEC-0029");
    });

    it("reports 'Training not started' with no authorizations", () => {
      mockState({
        ...MOCK_STATE,
        training: {
          ...MOCK_STATE.training,
          issuance: { ...MOCK_STATE.training.issuance, runStatus: "DRAFT" },
          authorization: {
            ...MOCK_STATE.training.authorization,
            executionAuthorized: false,
            kaggleStartAuthorized: false,
          },
          executionAuthorization: undefined,
          kaggleStartAuthorization: undefined,
          kaggleLaunchAuthorization: undefined,
          kaggleLaunchReauthorization: undefined,
        },
      });
      const result = getProjectStateForTopbar();
      expect(result.label).toBe("Training not started");
      expect(result.variant).toBe("not-started");
    });
  });

  describe("when master state JSON is malformed", () => {
    it("returns null state without throwing", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("not valid json {{{");
      invalidateDashboardCache();
      expect(isStateAvailable()).toBe(false);
      expect(getProjectState().program).toBeNull();
      expect(getTrainingLifecycle().lifecycle).toBe("UNKNOWN");
    });
  });
});
