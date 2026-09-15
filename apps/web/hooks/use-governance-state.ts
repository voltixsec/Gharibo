"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Client-side shapes of the governance read-model.
 *
 * These mirror the JSON returned by GET /api/governance-state. They are
 * declared separately from lib/dashboard.ts because that module is server-only
 * (it reads the filesystem) and importing it from a client component would pull
 * `node:fs` into the browser bundle.
 */
export type GovernanceLifecycle =
  | "NOT_STARTED"
  | "AUTHORIZED"
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "INTERRUPTED"
  | "RESUMABLE"
  | "UNKNOWN";

export interface GovernanceState {
  available: boolean;
  project: {
    id: string | null;
    name: string | null;
    program: string | null;
    milestone: string | null;
    milestoneTitle: string | null;
    milestoneStatus: string | null;
    masterStateVersion: string | null;
    updatedAt: string | null;
    decisionAuthority: string | null;
    nextAction: string | null;
    nextActionId: string | null;
    blockerSummary: string | null;
  };
  experiment: {
    experimentId: string | null;
    experimentStatus: string | null;
    baseModel: string | null;
    datasetVersion: string | null;
    method: string | null;
    engine: string | null;
    worker: string | null;
    packageId: string | null;
    runId: string | null;
    runStatus: string | null;
    attemptCount: number;
    evaluationState?: string | null;
    promotionBlockedReason: string | null;
    [key: string]: unknown;
  };
  gold: {
    datasetId: string | null;
    version: string | null;
    status: string | null;
    format: string | null;
    exampleCount: number | null;
    contentFrozen: boolean;
    train: number | null;
    validation: number | null;
    test: number | null;
    auditCohortSize: number | null;
    auditPass: number | null;
    auditNeedsReview: number | null;
    auditFail: number | null;
    auditedTestCount: number | null;
    datasetHash: string | null;
    testUsage: string | null;
    testPayloadIncluded: boolean | null;
  };
  model: {
    baseModelId: string | null;
    promotedModel: string | null;
    hasPromotedModel: boolean;
    evaluationState: string | null;
    derivedModels: Array<{ id: string; status: string; note: string }>;
    promotionTarget: string | null;
  };
  blockers: {
    summary: string | null;
    openBlockers: Array<{ id: string; title: string; status: string }>;
    nextActions: Array<{
      id: string;
      priority: string;
      action: string;
      requires: string;
    }>;
  };
  engine: {
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
  };
  lifecycle: {
    lifecycle: GovernanceLifecycle;
    rawStatus: string | null;
    hasStarted: boolean;
    invariantHolds: boolean;
    invariant: string | null;
    reason: string;
  };
  topbar: {
    label: string;
    variant: string;
  };
}

/** Fetch the governance read-model from the API boundary. */
export function useGovernanceState() {
  const [state, setState] = useState<GovernanceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/governance-state");
      const json = await res.json();
      if (json.code === 0) {
        setState(json.data as GovernanceState);
        setError(null);
      } else {
        setError(json.message ?? "Failed to load governance state");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load governance state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { state, loading, error, refresh };
}

/** Map a governed lifecycle to a semantic status variant (client-safe). */
export function lifecycleVariantClient(
  lifecycle: GovernanceLifecycle,
): "success" | "running" | "queued" | "authorized" | "failed" | "warning" | "not-started" | "neutral" {
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
    case "RESUMABLE":
      return "warning";
    case "NOT_STARTED":
      return "not-started";
    default:
      return "neutral";
  }
}
