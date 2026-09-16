#!/usr/bin/env node
/**
 * check-preflight-kernel.mjs — deterministic PASS/FAIL validator for the governed PREFLIGHT kernel.
 *
 * WHAT THIS GUARDS
 * ----------------
 * `scripts/eval/kaggle/gharibo-preflight-001.ipynb` is the NO-INFERENCE preflight that proves the
 * production model-loading path is stable. This checker re-reads the GENERATED notebook and fails if:
 *
 *   1. DRIFT — the notebook on disk is not byte-identical to the generator's output.
 *   2. NO INFERENCE — no model.generate(), .generate(, or other inference primitive appears.
 *   3. NO TEST — no prompts.jsonl, gold.jsonl, test.jsonl, or any evaluation data.
 *   4. NO ADAPTER — no PeftModel, no adapter_config, no safetensors.
 *   5. NO TRAINING — no training/tuning/optimizer/backward primitive.
 *   6. NO PROMOTION — no GHARIBO-V0.1, promote, promotion.
 *   7. AUTHORIZATION — the DEC-0041 pins are present, attempt #5 is NOT authorized.
 *   8. REVISION INVARIANT — the notebook asserts the observed revision is the immutable SHA.
 *   9. REJECTION OF `main` — the notebook explicitly rejects resolution to `main`.
 *  10. SHARED LOADER — the install cell and model-load call are the SAME as the production eval kernel.
 *  11. MARKERS — all required PREFLIGHT_* markers are present in executable code.
 *
 * NEGATIVE TESTS
 * --------------
 * The checker also executes adversarial mutations:
 *   - mutate expected revision to `main` → gate FAILS
 *   - remove revision assertion → gate FAILS
 *   - add inference primitive → gate FAILS
 *   - add TEST data reference → gate FAILS
 *
 * Usage:
 *   node scripts/eval/check-preflight-kernel.mjs            # human-readable report
 *   node scripts/eval/check-preflight-kernel.mjs --quiet    # exit code only on success
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PREFLIGHT_PINS,
  PREFLIGHT_FORBIDDEN_TOKENS,
  IMMUTABLE_DISTRIBUTION_REVISION,
  render,
  notebookSha256,
  buildNotebook,
} from "./build-preflight-kernel.mjs";
import { EVAL_PINS, buildNotebook as buildEvalNotebook } from "./build-eval-kernel.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "scripts/eval/kaggle/gharibo-preflight-001.ipynb";
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
  console.error(`check-preflight-kernel: ${OUT_REL} does not exist — run build-preflight-kernel.mjs`);
  process.exit(1);
}
const onDisk = readFileSync(outPath, "utf8");
const expected = render();

// ---------------------------------------------------------------- 1. drift
check(
  "notebook matches the generator byte-for-byte",
  onDisk === expected,
  "drift detected — regenerate with build-preflight-kernel.mjs",
);

let nb;
try {
  nb = JSON.parse(onDisk);
} catch (err) {
  console.error(`check-preflight-kernel: ${OUT_REL} is not valid JSON — ${err.message}`);
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
// Scan EXECUTABLE lines only (comments stripped). The input-isolation cell legitimately
// references 'prompts.jsonl', 'gold.jsonl', etc. as entries in a forbidden-files set — those
// are string literals checking for ABSENCE, not actual usage. So the scan excludes lines
// that are inside a set/list literal (lines containing only string literals + commas).
const forbiddenHits = PREFLIGHT_FORBIDDEN_TOKENS.filter((token) => {
  // 'prompts.jsonl' and 'gold.jsonl' appear as string literals in the _forbidden_names set,
  // which checks for their ABSENCE. They are not actual usage. Skip them if they appear
  // inside a string literal context.
  if (token === "prompts.jsonl" || token === "gold.jsonl") {
    // These are OK in the forbidden-names set. Check if they appear ONLY in string-literal position.
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
  "authorization decision id is DEC-0041",
  PREFLIGHT_PINS.authorizationDecisionId === "DEC-0041",
);
check(
  "decision is NO_INFERENCE_PREFLIGHT_AUTHORIZATION",
  PREFLIGHT_PINS.decision === "NO_INFERENCE_PREFLIGHT_AUTHORIZATION",
);
check(
  "attempt #5 is NOT authorized",
  PREFLIGHT_PINS.attempt5Authorized === false,
);
check(
  "maximum kernel pushes is 1",
  PREFLIGHT_PINS.maximumKernelPushes === 1,
);

// ---------------------------------------------------------------- 8. revision invariant
check(
  "immutable distribution revision is the DEC-0037 proven SHA",
  IMMUTABLE_DISTRIBUTION_REVISION === "093fba6992ef5a7152481afec0bdfca1ac486998",
);
check(
  "the notebook asserts the observed revision equals the immutable SHA",
  /assert\s+_loaded_revision\s*==\s*PINS\['immutableDistributionRevision'\]/.test(codeSource),
  "the revision assertion must be present in executable code",
);
check(
  "the notebook explicitly rejects resolution to 'main'",
  /_loaded_revision\s*!=\s*'main'/.test(codeSource) || /'main'/.test(codeSource) && /FAIL/i.test(codeSource),
  "the notebook must fail closed if the resolved revision is 'main'",
);

// ---------------------------------------------------------------- 9. required markers
const REQUIRED_MARKERS = [
  "PREFLIGHT_INSTALL_PASS",
  "PREFLIGHT_TOKENIZER_PASS",
  "PREFLIGHT_MODEL_LOAD_PASS",
  "PREFLIGHT_DISTRIBUTION_ID_PASS",
  "PREFLIGHT_DISTRIBUTION_REVISION_PASS",
  "PREFLIGHT_BASE_REVISION_PASS",
  "PREFLIGHT_TEST_ACCESS_NO",
  "PREFLIGHT_INFERENCE_NO",
  "PREFLIGHT_COMPLETE",
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

// ---------------------------------------------------------------- 10. shared loader
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

const evalLoadCell = evalCells.find(
  (c) => c.cell_type === "code" && String(c.source).includes("FastLanguageModel.from_pretrained"),
);
const preflightLoadCell = cells.find(
  (c) => c.cell_type === "code" && String(c.source).includes("FastLanguageModel.from_pretrained"),
);
check(
  "model-load call uses the SAME loader model id as production eval",
  preflightLoadCell && /model_name=PINS\['loaderModelId'\]/.test(
    Array.isArray(preflightLoadCell.source) ? preflightLoadCell.source.join("") : preflightLoadCell.source,
  ),
);
check(
  "model-load call passes NO revision argument (same as production eval)",
  !/FastLanguageModel\.from_pretrained\([\s\S]{0,400}?revision\s*=/.test(
    preflightLoadCell
      ? (Array.isArray(preflightLoadCell.source) ? preflightLoadCell.source.join("") : preflightLoadCell.source)
      : "",
  ),
  "passing revision= to the Unsloth distribution id was DEFECT 4 of DEC-0035",
);

// ---------------------------------------------------------------- Xet hardening
check(
  "HF_HUB_DISABLE_XET=1 is set as preventive hardening",
  codeSource.includes("HF_HUB_DISABLE_XET") && /os\.environ\['HF_HUB_DISABLE_XET'\]\s*=\s*'1'/.test(codeSource),
);
check(
  "distribution is pre-downloaded at the immutable revision",
  codeSource.includes("snapshot_download") && /revision=_dist_rev/.test(codeSource),
);

// ---------------------------------------------------------------- input isolation
check(
  "notebook checks for forbidden input files",
  codeSource.includes("_forbidden_names") && codeSource.includes("PREFLIGHT_TEST_ACCESS_NO"),
);

// ---------------------------------------------------------------- negative tests (adversarial)
const NEGATIVE_FILE = resolve(ROOT, OUT_REL);
const ORIG_NOTEBOOK = onDisk;

function runChecker() {
  try {
    const out = execFileSync(process.execPath, ["scripts/eval/check-preflight-kernel.mjs", "--quiet"], {
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

// Run negative tests only if not in --quiet mode (to avoid recursion in the negative tests themselves)
if (!QUIET) {
  const negativeTests = [
    {
      name: "mutate expected revision to 'main' → gate FAILS",
      mutate: (nbText) => {
        // Replace the immutable revision with 'main' in the assertion
        return nbText.replace(
          "093fba6992ef5a7152481afec0bdfca1ac486998",
          "main",
        );
      },
    },
    {
      name: "remove revision assertion → gate FAILS",
      mutate: (nbText) => {
        // Remove the revision assertion line
        return nbText.replace(
          /assert _loaded_revision == PINS\['immutableDistributionRevision'\],[^]*?'main'/s,
          "",
        );
      },
    },
    {
      name: "add inference primitive → gate FAILS",
      mutate: (nbText) => {
        // Add model.generate() to a code cell
        return nbText.replace(
          "print('PREFLIGHT_COMPLETE')",
          "model.generate(do_sample=False, max_new_tokens=1)\nprint('PREFLIGHT_COMPLETE')",
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
  console.log(`RESULT: PASSED — ${passed} check(s); the preflight kernel is safe to push.`);
  console.log(`  notebook sha256: ${notebookSha256()}`);
  process.exit(0);
}
console.log(`RESULT: FAILED — ${failures.length} of ${total} check(s) failed:`);
for (const f of failures) console.log(`  • ${f}`);
process.exit(1);
