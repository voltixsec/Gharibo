#!/usr/bin/env node
/**
 * check-dec0042-preflight.mjs — deterministic PASS/FAIL validator for the governed PREFLIGHT-002 kernel.
 *
 * WHAT THIS GUARDS
 * ----------------
 * `scripts/eval/kaggle/gharibo-preflight-002.ipynb` is the NO-INFERENCE preflight that proves the
 * LOCAL-SNAPSHOT model-loading architecture. This checker re-reads the GENERATED notebook and fails if:
 *
 *   1. DRIFT — the notebook on disk is not byte-identical to the generator's output.
 *   2. NO INFERENCE — no model.generate(), .generate(, or other inference primitive appears.
 *   3. NO TEST — no prompts.jsonl, gold.jsonl, test.jsonl, or any evaluation data.
 *   4. NO ADAPTER — no PeftModel, no adapter_config, no safetensors.
 *   5. NO TRAINING — no training/tuning/optimizer/backward primitive.
 *   6. NO PROMOTION — no GHARIBO-V0.1, promote, promotion.
 *   7. AUTHORIZATION — the DEC-0042 pins are present, attempt #5 is NOT authorized.
 *   8. LOCAL-SNAPSHOT INVARIANT — the loader receives SNAPSHOT_DIR, not a repo id.
 *   9. local_files_only=True — the loader call passes local_files_only=True.
 *  10. NETWORK SEAL — HF_HUB_OFFLINE=1 and TRANSFORMERS_OFFLINE=1 are set after download.
 *  11. NO MUTABLE MAIN — the notebook asserts _loaded_revision != 'main'.
 *  12. SHARED INSTALL — the install cell is the SAME as the production eval kernel.
 *  13. MARKERS — all required PREFLIGHT3_* markers are present in executable code.
 *  14. VERSION DIAGNOSTICS — transformers/huggingface_hub/unsloth versions + MRO are printed.
 *
 * Usage:
 *   node scripts/eval/check-dec0042-preflight.mjs            # human-readable report
 *   node scripts/eval/check-dec0042-preflight.mjs --quiet     # exit code only on success
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PREFLIGHT3_PINS,
  PREFLIGHT3_FORBIDDEN_TOKENS,
  IMMUTABLE_DISTRIBUTION_REVISION,
  DISTRIBUTION_REPO,
  render,
  notebookSha256,
  buildNotebook,
} from "./build-dec0042-preflight.mjs";
import { buildNotebook as buildEvalNotebook } from "./build-eval-kernel.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "scripts/eval/kaggle/gharibo-preflight-002.ipynb";
const QUIET = process.argv.includes("--quiet");

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    if (!QUIET) console.log(`  PASS  ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const outPath = resolve(ROOT, OUT_REL);
if (!existsSync(outPath)) {
  console.error(`check-dec0042-preflight: ${OUT_REL} does not exist — run build-dec0042-preflight.mjs`);
  process.exit(1);
}
const onDisk = readFileSync(outPath, "utf8");
const expected = render();

// ---------------------------------------------------------------- 1. drift
check(
  "notebook matches the generator byte-for-byte",
  onDisk === expected,
  "drift detected — regenerate with build-dec0042-preflight.mjs",
);

let nb;
try {
  nb = JSON.parse(onDisk);
} catch (err) {
  console.error(`check-dec0042-preflight: ${OUT_REL} is not valid JSON — ${err.message}`);
  process.exit(1);
}

const cells = Array.isArray(nb.cells) ? nb.cells : [];
const allSource = cells
  .map((c) => (Array.isArray(c.source) ? c.source.join("") : String(c.source ?? "")))
  .join("\n");
const codeSource = cells
  .filter((c) => c.cell_type === "code")
  .map((c) => (Array.isArray(c.source) ? c.source.join("") : String(c.source ?? "")))
  .join("\n");

const executableLines = codeSource
  .split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

// ---------------------------------------------------------------- 2/3/4/5. forbidden primitives
const forbiddenHits = PREFLIGHT3_FORBIDDEN_TOKENS.filter((token) => {
  if (token === "prompts.jsonl" || token === "gold.jsonl") {
    return /['"]prompts\.jsonl['"]/.test(codeSource) && !executableLines.includes(token);
  }
  return executableLines.includes(token);
});
check(
  "no training, inference, evaluation, or artifact primitive present",
  forbiddenHits.length === 0,
  forbiddenHits.length ? `forbidden token(s): ${forbiddenHits.map((t) => JSON.stringify(t)).join(", ")}` : undefined,
);

// ---------------------------------------------------------------- 6. no promotion
const PROMOTION_WORDS = ["GHARIBO-V0.1", "promote", "promotion", "best_checkpoint"];
const promoHits = PROMOTION_WORDS.filter((w) => executableLines.includes(w));
check(
  "no promotion vocabulary in executable code",
  promoHits.length === 0,
  promoHits.length ? `found: ${promoHits.join(", ")}` : undefined,
);

// ---------------------------------------------------------------- 7. authorization
check(
  "authorization decision id is DEC-0042",
  PREFLIGHT3_PINS.authorizationDecisionId === "DEC-0042",
);
check(
  "decision is LOCAL_SNAPSHOT_PREFLIGHT_AUTHORIZATION",
  PREFLIGHT3_PINS.decision === "LOCAL_SNAPSHOT_PREFLIGHT_AUTHORIZATION",
);
check(
  "attempt #5 is NOT authorized",
  PREFLIGHT3_PINS.attempt5Authorized === false,
);
check(
  "maximum kernel pushes is 1",
  PREFLIGHT3_PINS.maximumKernelPushes === 1,
);

// ---------------------------------------------------------------- 8. local-snapshot invariant
check(
  "immutable distribution revision is the DEC-0037 proven SHA",
  IMMUTABLE_DISTRIBUTION_REVISION === "093fba6992ef5a7152481afec0bdfca1ac486998",
);
check(
  "distribution repo is the exact bnb-4bit distribution",
  DISTRIBUTION_REPO === "unsloth/gpt-oss-20b-unsloth-bnb-4bit",
);
check(
  "loader receives SNAPSHOT_DIR (not repo id)",
  /model_name=SNAPSHOT_DIR/.test(codeSource),
  "the loader must receive the local snapshot directory, not a repo id",
);
check(
  "local_files_only=True is passed to the loader",
  /local_files_only=True/.test(codeSource),
);
check(
  "snapshot_download captures the returned path",
  /SNAPSHOT_DIR\s*=\s*snapshot_download/.test(codeSource),
);
check(
  "no repo id passed to the actual loader call",
  !/model_name=PINS\['loaderModelId'\]/.test(codeSource),
  "the loader must NOT receive the repo id PINS['loaderModelId']",
);

// ---------------------------------------------------------------- 9. network seal
check(
  "HF_HUB_OFFLINE=1 is set after snapshot download",
  /os\.environ\['HF_HUB_OFFLINE'\]\s*=\s*'1'/.test(codeSource),
);
check(
  "TRANSFORMERS_OFFLINE=1 is set after snapshot download",
  /os\.environ\['TRANSFORMERS_OFFLINE'\]\s*=\s*'1'/.test(codeSource),
);
check(
  "HF_HUB_DISABLE_XET=1 is set as preventive hardening",
  /os\.environ\['HF_HUB_DISABLE_XET'\]\s*=\s*'1'/.test(codeSource),
);

// ---------------------------------------------------------------- 10. no mutable main
check(
  "the notebook asserts _loaded_revision != 'main'",
  /_loaded_revision\s*!=\s*'main'/.test(codeSource),
  "the notebook must fail closed if the resolved revision is 'main'",
);
check(
  "the notebook asserts snapshot basename equals immutable SHA",
  /_snapshot_basename\s*==\s*_dist_rev/.test(codeSource),
);

// ---------------------------------------------------------------- 11. shared install
const evalCells = buildEvalNotebook().cells;
const evalInstallCell = evalCells.find(
  (c) => c.cell_type === "code" && String(c.source).includes("# --- dependencies:"),
);
const preflightInstallCell = cells.find(
  (c) => c.cell_type === "code" && String(c.source).includes("# --- dependencies:"),
);
check(
  "install cell is the SAME as the production eval kernel",
  preflightInstallCell && evalInstallCell &&
    (Array.isArray(preflightInstallCell.source) ? preflightInstallCell.source.join("") : preflightInstallCell.source) ===
    (Array.isArray(evalInstallCell.source) ? evalInstallCell.source.join("") : evalInstallCell.source),
  "the preflight and production eval must share ONE install implementation",
);

// ---------------------------------------------------------------- 12. base revision assertion shared
const evalRevCell = evalCells.find(
  (c) => c.cell_type === "code" && String(c.source).includes("resolve_base_revision"),
);
const preflightRevCell = cells.find(
  (c) => c.cell_type === "code" && String(c.source).includes("resolve_base_revision"),
);
check(
  "base-revision assertion cell is the SAME as the production eval kernel",
  preflightRevCell && evalRevCell &&
    (Array.isArray(preflightRevCell.source) ? preflightRevCell.source.join("") : preflightRevCell.source) ===
    (Array.isArray(evalRevCell.source) ? evalRevCell.source.join("") : evalRevCell.source),
  "the preflight and production eval must share ONE base-revision assertion",
);

// ---------------------------------------------------------------- 13. markers
const REQUIRED_MARKERS = [
  "PREFLIGHT3_SNAPSHOT_PASS",
  "PREFLIGHT3_LOCAL_PATH_PASS",
  "PREFLIGHT3_TOKENIZER_PASS",
  "PREFLIGHT3_MODEL_LOAD_PASS",
  "PREFLIGHT3_DISTRIBUTION_REVISION_PASS",
  "PREFLIGHT3_NO_MUTABLE_MAIN",
  "PREFLIGHT3_TEST_ACCESS_NO",
  "PREFLIGHT3_INFERENCE_NO",
  "PREFLIGHT3_COMPLETE",
];
for (const marker of REQUIRED_MARKERS) {
  check(`marker ${marker} is present`, codeSource.includes(marker));
}
check(
  "notebook prints OBSERVED_DISTRIBUTION_ID=",
  codeSource.includes("OBSERVED_DISTRIBUTION_ID="),
);
check(
  "notebook prints OBSERVED_DISTRIBUTION_REVISION=",
  codeSource.includes("OBSERVED_DISTRIBUTION_REVISION="),
);
check(
  "notebook prints SNAPSHOT_DIR=",
  codeSource.includes("SNAPSHOT_DIR="),
);
check(
  "notebook prints ACTUAL_LOADER_INPUT=",
  codeSource.includes("ACTUAL_LOADER_INPUT="),
);

// ---------------------------------------------------------------- 14. version diagnostics
check(
  "version diagnostics print transformers.__version__",
  codeSource.includes("transformers.__version__"),
);
check(
  "version diagnostics print huggingface_hub.__version__",
  codeSource.includes("huggingface_hub.__version__"),
);
check(
  "version diagnostics print unsloth version",
  codeSource.includes("unsloth") && /print\(f'unsloth:/.test(codeSource),
);
check(
  "version diagnostics print unsloth_zoo version",
  codeSource.includes("unsloth_zoo") && /print\(f'unsloth_zoo:/.test(codeSource),
);
check(
  "MRO diagnostic for HfHubHTTPError is present",
  codeSource.includes("HfHubHTTPError") && codeSource.includes("__mro__"),
);
check(
  "MRO diagnostic for RemoteEntryNotFoundError is present",
  codeSource.includes("RemoteEntryNotFoundError"),
);

// ---------------------------------------------------------------- 15. input isolation
check(
  "notebook checks for forbidden input files",
  codeSource.includes("_forbidden_names") && codeSource.includes("PREFLIGHT3_TEST_ACCESS_NO"),
);

// ---------------------------------------------------------------- negative tests (adversarial)
const NEGATIVE_FILE = resolve(ROOT, OUT_REL);
const ORIG_NOTEBOOK = onDisk;

function runChecker() {
  try {
    const out = execFileSync(process.execPath, ["scripts/eval/check-dec0042-preflight.mjs", "--quiet"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { failed: false, out };
  } catch (e) {
    return { failed: true, out: (e.stdout || "") + (e.stderr || "") };
  }
}

function restoreNotebook() {
  for (let i = 0; i < 40; i++) {
    try {
      writeFileSync(NEGATIVE_FILE, ORIG_NOTEBOOK);
      return;
    } catch (e) {
      if (i === 39) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 75);
    }
  }
}

function writeRetry(text) {
  for (let i = 0; i < 40; i++) {
    try {
      writeFileSync(NEGATIVE_FILE, text);
      return;
    } catch (e) {
      if (i === 39) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 75);
    }
  }
}

if (!QUIET) {
  const negativeTests = [
    {
      name: "mutate loader to repo id → gate FAILS",
      mutate: (nbText) => {
        return nbText.replace("model_name=SNAPSHOT_DIR", "model_name=PINS['loaderModelId']");
      },
    },
    {
      name: "remove local_files_only=True → gate FAILS",
      mutate: (nbText) => {
        return nbText.replace("local_files_only=True", "local_files_only=False");
      },
    },
    {
      name: "add inference primitive → gate FAILS",
      mutate: (nbText) => {
        return nbText.replace(
          "print('PREFLIGHT3_COMPLETE')",
          "model.generate(do_sample=False, max_new_tokens=1)\nprint('PREFLIGHT3_COMPLETE')",
        );
      },
    },
  ];

  console.log("\n--- negative tests (adversarial mutations) ---");
  let negRejected = 0;
  const negSurvived = [];
  for (const test of negativeTests) {
    restoreNotebook();
    const mutated = test.mutate(ORIG_NOTEBOOK);
    writeRetry(mutated);
    const result = runChecker();
    if (result.failed) {
      negRejected++;
      console.log(`  REJECTED (good): ${test.name}`);
    } else {
      negSurvived.push(test.name);
      console.log(`  SURVIVED (HOLE): ${test.name}`);
    }
  }
  restoreNotebook();
  console.log(`  negative tests: ${negRejected}/${negativeTests.length} rejected, ${negSurvived.length} survived`);

  if (negSurvived.length > 0) {
    for (const s of negSurvived) failures.push(`NEGATIVE TEST SURVIVED: ${s}`);
  }
}

// ---------------------------------------------------------------- report
const total = passed + failures.length;
console.log("─".repeat(64));
if (failures.length === 0) {
  console.log(`RESULT: PASSED — ${passed} check(s); the preflight-002 kernel is safe to push.`);
  console.log(`  notebook sha256: ${notebookSha256()}`);
  process.exit(0);
}
console.log(`RESULT: FAILED — ${failures.length} of ${total} check(s) failed:`);
for (const f of failures) console.log(`  • ${f}`);
process.exit(1);
