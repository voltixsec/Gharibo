/** Run from the repository root. Explicit --issue or read-only --check; no worker imports. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { closeDb, db } from "../../apps/web/lib/db/index";
import { experimentsRepository } from "../../apps/web/lib/db/repositories/experiments";
import { prepareGoldIssuance, issueGoldPackageAndRun, verifyGoldIssuance } from "../../apps/web/lib/training/gold-issuance";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const check = process.argv.includes("--check");
if (!check && !process.argv.includes("--issue")) throw new Error("Specify --issue or --check");
// Config is resolved lazily by db(); use the application database, not a second root-level DB.
if (path.resolve(process.env.DATABASE_PATH ?? "") !== path.join(root, "apps/web/data/gharibo.db")) {
  throw new Error("Set DATABASE_PATH to the absolute apps/web/data/gharibo.db application path");
}
try {
  const state = JSON.parse(fs.readFileSync(path.join(root, "governance/GHARIBO_MASTER_STATE.json"), "utf8"));
  const existing = experimentsRepository.get("GHARIBO-exp-001");
  if (check && !existing) throw new Error("No issuance exists");
  const planPath = path.join(root, "apps/web/data/dec0025-issuance-plan.json");
  let issuedAt = (existing?.provenance as any)?.issuedAt;
  if (!issuedAt) {
    if (fs.existsSync(planPath)) issuedAt = JSON.parse(fs.readFileSync(planPath, "utf8")).issuedAt;
    else {
      issuedAt = new Date().toISOString();
      fs.writeFileSync(planPath, JSON.stringify({ decisionId: "DEC-0025", issuedAt }), { flag: "wx" });
    }
  }
  const previewManifest = fs.readFileSync(path.join(root, "governance/DEC-0025-authorized-preview.json"), "utf8").trim();
  const dataDir = path.join(root, "data/processed/gharibo-research-gold-v0.1");
  const first = prepareGoldIssuance(state, previewManifest, issuedAt, dataDir);
  const second = prepareGoldIssuance(state, previewManifest, issuedAt, dataDir);
  if (first.manifest !== second.manifest || !Buffer.from(first.zip).equals(Buffer.from(second.zip))) {
    throw new Error("Independent issuance builds differ");
  }
  const receipt = check ? verifyGoldIssuance(first) :
    issueGoldPackageAndRun(first, path.join(root, "apps/web/data/training-packages"));
  closeDb();
  const reopened = verifyGoldIssuance(first);
  if (reopened.receiptHash !== receipt.receiptHash) throw new Error("Reopened persistence mismatch");
  if (state.training.issuance && JSON.stringify(state.training.issuance) !== JSON.stringify(receipt)) {
    // Canonical comparison below ignores object key order.
    const { canonicalJson } = await import("../../apps/web/lib/training/hash");
    if (canonicalJson(state.training.issuance) !== canonicalJson(receipt)) throw new Error("Governance receipt mismatch");
  }
  const integrity = db().pragma("integrity_check", { simple: true });
  if (integrity !== "ok" || db().pragma("foreign_key_check").length !== 0) throw new Error("Database integrity failed");
  console.log(JSON.stringify({ ...receipt, verified: true, independentBuilds: 2, reopened: true }, null, 2));
} finally {
  closeDb();
}
