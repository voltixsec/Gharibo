import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  isAcceptedGoldGovernanceState,
  isKaggleStartAuthorizedGoldState,
} from "@/lib/training/gold-authorization.mjs";

const root = path.resolve(__dirname, "../../../..");

const state = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "governance/GHARIBO_MASTER_STATE.json",
    ),
    "utf8",
  ),
);

describe("DEC-0027 Kaggle start authorization", () => {
  it("accepts the exact safe queued start checkpoint", () => {
    expect(
      isKaggleStartAuthorizedGoldState(state),
    ).toBe(true);

    expect(
      isAcceptedGoldGovernanceState(state),
    ).toBe(true);

    expect(
      state.experiments["GHARIBO-exp-001"].runStatus,
    ).toBe("QUEUED");

    expect(
      state.training.kaggleStartAuthorization.startAuthorized,
    ).toBe(true);

    expect(
      state.training.kaggleStartAuthorization.launchAttempted,
    ).toBe(false);

    expect(
      state.training.kaggleStartAuthorization.executionStarted,
    ).toBe(false);

    expect(state.training.hasStarted).toBe(false);
  });

  it("fails closed for mutated launch or TEST state", () => {
    const mutations = [
      (s: any) => {
        s.training.kaggleStartAuthorization.launchBundleHash =
          "0".repeat(64);
      },
      (s: any) => {
        s.training.kaggleStartAuthorization.notebookSha256 =
          "0".repeat(64);
      },
      (s: any) => {
        s.training.kaggleStartAuthorization.testPayloadIncluded =
          true;
      },
      (s: any) => {
        s.training.kaggleStartAuthorization.testPayloadAccessed =
          true;
      },
      (s: any) => {
        s.training.kaggleStartAuthorization.launchAttempted =
          true;
      },
      (s: any) => {
        s.training.kaggleStartAuthorization.executionStarted =
          true;
      },
      (s: any) => {
        s.experiments["GHARIBO-exp-001"].runStatus =
          "RUNNING";
      },
      (s: any) => {
        s.training.hasStarted = true;
      },
    ];

    for (const mutate of mutations) {
      const bad = structuredClone(state);
      mutate(bad);

      expect(
        isKaggleStartAuthorizedGoldState(bad),
      ).toBe(false);
    }
  });
});
