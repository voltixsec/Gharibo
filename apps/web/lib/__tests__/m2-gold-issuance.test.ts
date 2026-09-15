import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const scratch = vi.hoisted(() => {
  const dir = `${process.env.TEMP || process.cwd()}/gharibo-issuance-test-${Date.now()}`;
  process.env.DATABASE_PATH = `${dir}/test.db`;
  return dir;
});
import { closeDb, db } from "@/lib/db/index";
import { issueGoldPackageAndRun, prepareGoldIssuance, verifyGoldIssuance } from "@/lib/training/gold-issuance";
import { trainingRunsRepository } from "@/lib/db/repositories/training-runs";
import { trainingPackagesRepository } from "@/lib/db/repositories/training-packages";
import { isIssuedGoldState } from "@/lib/training/gold-authorization.mjs";
import { canonicalJson, sha256Canonical } from "@/lib/training/hash";
import { parseManifest } from "@/lib/training/package";
import * as gold from "@/lib/training/governed-gold";

const root = path.resolve(__dirname, "../../../..");
const state = JSON.parse(execFileSync("git", ["show", "6810a63e42a939858a6cbb2cfb6775c1091adbfe:governance/GHARIBO_MASTER_STATE.json"], { cwd: root, encoding: "utf8" }));
const manifest = fs.readFileSync(path.join(root, "governance/DEC-0025-authorized-preview.json"), "utf8").trim();
const candidate = parseManifest(manifest);
const p = candidate.dataset.splitPolicy as any;
// Fixture contents are synthetic; production prepare uses the physical hash-verifying reader.
const source: gold.GovernedGoldSource = {
  datasetId: gold.GOVERNED_GOLD_DATASET_ID,
  datasetVersion: gold.GOVERNED_GOLD_DATASET_VERSION,
  recordFormat: gold.GOVERNED_GOLD_RECORD_FORMAT,
  recordCount: 800,
  counts: { train: 640, validation: 80, test: 80 },
  datasetHash: candidate.dataset.datasetHash, splitHashes: candidate.dataset.splitHashes,
  splitPolicy: { ...p, declaredMinimumRecordsPerSplit: p.minimumRecordsPerSplit },
  contents: {
    train: ['{"fixture":"train"}'],
    validation: ['{"fixture":"validation"}'],
  },
};
delete (source.splitPolicy as any).minimumRecordsPerSplit;
Object.defineProperty(source.contents, "test", { get() { throw new Error("TEST payload accessed"); } });
const reader = vi.spyOn(gold, "loadGovernedGoldSource").mockReturnValue(source);
const prepared = () => prepareGoldIssuance(state, manifest, "2026-09-15T20:00:00.000Z", "fixture");
let receipt: any;
afterAll(() => { closeDb(); vi.restoreAllMocks(); fs.rmSync(scratch, { recursive: true, force: true }); });

describe("DEC-0025 immutable issuance", () => {
  it("builds deterministically from the pinned preview without TEST or executable payload", () => {
    const a = prepared(); const b = prepared();
    expect(a.zip).toEqual(b.zip);
    expect(a.pkg.preview).toBeUndefined();
    expect(a.pkg.packageId).not.toBe(candidate.packageId);
    expect(a.pkg.gitCommitSha).toBe(state.training.authorization.authorizedCodeSnapshot);
    expect(a.files.some((f) => /test.jsonl|ipynb/.test(f.relativePath))).toBe(false);
    expect(reader).toHaveBeenCalledTimes(2);
  });
  it("fails before persistence for changed authorization, preview, recipe or dataset", () => {
    const bad = structuredClone(state); bad.training.authorization.scope = "EXECUTION";
    expect(() => prepareGoldIssuance(bad, manifest, "2026-09-15T20:00:00.000Z", "fixture")).toThrow(/DEC-0025/);
    expect(() => prepareGoldIssuance(state, manifest.replace('"seed":42', '"seed":43'), "2026-09-15T20:00:00.000Z", "fixture")).toThrow(/preview mismatch/);
    reader.mockReturnValueOnce({ ...source, datasetHash: "0".repeat(64) });
    expect(prepared).toThrow(/physical dataset/);
  });
  it("atomically creates one package and DRAFT run; a retry and reopen preserve them", () => {
    const a = prepared();
    // An injected failure after run/package inserts must roll back both.
    db().exec("CREATE TRIGGER fail_issuance BEFORE INSERT ON experiments BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
    expect(() => issueGoldPackageAndRun(a, scratch)).toThrow(/injected failure/);
    expect(trainingRunsRepository.list()).toHaveLength(0);
    expect(trainingPackagesRepository.list()).toHaveLength(0);
    db().exec("DROP TRIGGER fail_issuance");
    receipt = issueGoldPackageAndRun(a, scratch);
    expect(issueGoldPackageAndRun(a, scratch)).toEqual(receipt);
    closeDb();
    expect(verifyGoldIssuance(a)).toEqual(receipt);
    expect(trainingRunsRepository.list()).toHaveLength(1);
    expect(trainingPackagesRepository.list()).toHaveLength(1);
  });
  it("locks persistence, queuing, execution, linkage and receipt mutations", () => {
    expect(() => trainingRunsRepository.transition(receipt.runId, "QUEUED", { source: "test" })).toThrow(/execution not authorized/);
    expect(() => trainingRunsRepository.update(receipt.runId, { status: "RUNNING" })).toThrow(/execution not authorized/);
    expect(() => trainingRunsRepository.setPackage(receipt.runId, "changed")).toThrow(/execution not authorized/);
    expect(() => trainingPackagesRepository.remove(receipt.packageId)).toThrow(/immutable/);
    expect(() => trainingPackagesRepository.setBundlePath(receipt.packageId, "changed")).toThrow(/immutable/);
    expect(() => db().prepare("UPDATE experiments SET provenance='{}' WHERE id=?").run("GHARIBO-exp-001")).toThrow(/immutable/);
    const issued = structuredClone(state);
    issued.masterStateVersion = "1.6.0";
    Object.assign(issued.training.authorization, { status: "ISSUED_AWAITING_EXPLICIT_EXECUTION_AUTHORIZATION", packageIssued: true, runIssued: true });
    Object.assign(issued.experiments["GHARIBO-exp-001"], { readinessStatus: issued.training.authorization.status,
      packageId: receipt.packageId, trainingRunId: receipt.runId, runStatus: "DRAFT" });
    issued.training.issuance = receipt;
    expect(isIssuedGoldState(issued)).toBe(true);
    for (const mutate of [
      (s: any) => { s.training.authorization.authorizedCodeSnapshot = "0".repeat(40); },
      (s: any) => { s.training.issuance.executionStarted = true; },
      (s: any) => { s.experiments["GHARIBO-exp-001"].packageId = "0".repeat(64); },
      (s: any) => { s.training.issuance.binding.testUsage = "TUNING"; },
    ]) {
      const bad = structuredClone(issued); mutate(bad);
      const { receiptHash: _hash, ...body } = bad.training.issuance;
      bad.training.issuance.receiptHash = sha256Canonical(body);
      expect(isIssuedGoldState(bad)).toBe(false);
    }
    expect(canonicalJson(verifyGoldIssuance(prepared()))).toBe(canonicalJson(receipt));
  });
});
