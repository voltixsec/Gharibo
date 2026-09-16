#!/usr/bin/env node
/**
 * check-eval-kernel.mjs — deterministic PASS/FAIL validator for the governed EVALUATION kernel.
 *
 * WHAT THIS GUARDS
 * ----------------
 * `scripts/eval/kaggle/gharibo-eval-001.ipynb` is the ONLY thing permitted to run the single
 * authorized held-out TEST benchmark (DEC-0032). This checker re-reads the GENERATED notebook
 * and fails if any of the guarantees the authorization depends on has been broken.
 *
 * It exists because the generator alone is not enough. A generator proves the notebook was
 * produced from the pins; it does not prove the pins themselves are still safe, that the
 * notebook has not been hand-edited afterwards, or that a forbidden primitive did not sneak
 * into a cell. This checker is the second, independent lock.
 *
 * CONTRACT
 * --------
 *   1. DRIFT        — the notebook on disk is byte-identical to the generator's output.
 *   2. NO TRAINING  — no training/tuning/optimizer/backward primitive appears (shared list
 *                     imported from the generator, so the two can never disagree).
 *   3. NO ARTIFACT  — no `save_pretrained` / `push_to_hub`: the notebook may not write weights.
 *   4. NO PROMOTION — no promotion, checkpoint-selection or tuning vocabulary.
 *   5. TEST PRIVACY — the notebook reads `prompts.jsonl` only and REFUSES to run if any gold
 *                     payload is present in the inference environment.
 *   6. AUTHORIZATION— the DEC-0032 pins are present and the decision string is exact.
 *   7. IDENTITY     — the adapter sha256 and base revision pins are the accepted values.
 *   8. DECODING     — the section 7.1 decoding values are exact and shared by both arms.
 *   9. INFERENCE-MODE — model.generate is reached only under torch.inference_mode().
 *  10. HONESTY      — the run record declares it did not score, train, tune or select.
 *
 * Usage:
 *   node scripts/eval/check-eval-kernel.mjs            # human-readable report
 *   node scripts/eval/check-eval-kernel.mjs --quiet    # exit code only on success
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EVAL_PINS,
  FORBIDDEN_TOKENS,
  render,
  notebookSha256,
  pinsCellSource,
  pinsJsonText,
  containsJsonOnlyLiterals,
  hasEmptyObject,
} from "./build-eval-kernel.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "scripts/eval/kaggle/gharibo-eval-001.ipynb";
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

// ---------------------------------------------------------------- 1. drift
const outPath = resolve(ROOT, OUT_REL);
if (!existsSync(outPath)) {
  console.error(`check-eval-kernel: ${OUT_REL} does not exist — run build-eval-kernel.mjs`);
  process.exit(1);
}
const onDisk = readFileSync(outPath, "utf8");
const expected = render();

check(
  "notebook matches the generator byte-for-byte",
  onDisk === expected,
  onDisk === expected
    ? undefined
    : "drift detected — a hand-edit or a stale pin. Regenerate with build-eval-kernel.mjs"
);

let nb;
try {
  nb = JSON.parse(onDisk);
} catch (err) {
  console.error(`check-eval-kernel: ${OUT_REL} is not valid JSON — ${err.message}`);
  process.exit(1);
}

// A notebook is a list of cells; the scan is over the concatenated SOURCE of every cell.
const cells = Array.isArray(nb.cells) ? nb.cells : [];
const allSource = cells.map((c) => (Array.isArray(c.source) ? c.source.join("") : String(c.source ?? ""))).join("\n");
const codeSource = cells
  .filter((c) => c.cell_type === "code")
  .map((c) => (Array.isArray(c.source) ? c.source.join("") : String(c.source ?? "")))
  .join("\n");

// ---------------------------------------------------------------- 2/3. forbidden primitives
// The forbidden-token list is imported from the generator, so this checker and the generator
// begin from ONE definition. A token added there is enforced here immediately.
//
// MATCHING RULE (same discipline as check-qualify-harness.mjs): a conservative raw-substring
// scan over cell sources. Safe to be strict because the notebook's prose and its runtime
// tripwires are authored to avoid these literal forms.
const hits = FORBIDDEN_TOKENS.filter((token) => allSource.includes(token));
check(
  "no training, tuning, optimizer or artifact primitive present",
  hits.length === 0,
  hits.length ? `forbidden token(s): ${hits.map((t) => JSON.stringify(t)).join(", ")}` : undefined
);

// ---------------------------------------------------------------- 4. no promotion vocabulary
const PROMOTION_WORDS = ["GHARIBO-V0.1", "promote", "promotion", "checkpoint-150", "checkpoint-160", "best_checkpoint"];
const promoHits = PROMOTION_WORDS.filter((w) => codeSource.includes(w));
check(
  "no promotion or checkpoint-selection vocabulary in executable code",
  promoHits.length === 0,
  promoHits.length ? `found: ${promoHits.join(", ")}` : undefined
);

// ---------------------------------------------------------------- 5. TEST privacy
check(
  "reads the prompt payload",
  codeSource.includes("prompts.jsonl"),
  "the notebook must consume prompts.jsonl"
);
check(
  "actively refuses to run when a gold payload is present",
  codeSource.includes("gold.jsonl") && /REFUSING TO RUN[\s\S]{0,120}gold/i.test(codeSource),
  "there must be a hard abort if gold answers are reachable at inference time"
);
check(
  "asserts gold payload count is zero",
  /assert\s+len\(golds\)\s*==\s*0/.test(codeSource),
  "the gold-absence assertion is the mechanism; it must be present and exact"
);
check(
  "never reads a gold file for scoring",
  !/open\([^)]*gold[^)]*\)/.test(codeSource),
  "the notebook must not open any gold path"
);

// ---------------------------------------------------------------- 6. authorization pins
check("authorization decision id is DEC-0032", EVAL_PINS.authorizationDecisionId === "DEC-0032");
check(
  "authorization decision is AUTHORIZED WITH LIMITS",
  EVAL_PINS.decision === "AUTHORIZED WITH LIMITS",
  `found ${JSON.stringify(EVAL_PINS.decision)}`
);
check(
  "the notebook asserts its own authorization before doing any work",
  /assert\s+PINS\['authorizationDecisionId'\]\s*==\s*'DEC-0032'/.test(codeSource),
  "a runtime authorization assertion must guard the run"
);

// ---------------------------------------------------------------- 7. identities
const SHA256_RE = /^[0-9a-f]{64}$/;
check(
  "candidate adapter sha256 pin is a full sha256",
  SHA256_RE.test(EVAL_PINS.candidateAdapterSha256),
  `found ${JSON.stringify(EVAL_PINS.candidateAdapterSha256)}`
);
check(
  "test split hash pin is a full sha256",
  SHA256_RE.test(EVAL_PINS.testSplitHash),
  `found ${JSON.stringify(EVAL_PINS.testSplitHash)}`
);
check(
  "dataset hash pin is a full sha256",
  SHA256_RE.test(EVAL_PINS.datasetHash),
  `found ${JSON.stringify(EVAL_PINS.datasetHash)}`
);
check(
  "base model revision pin is a full 40-hex revision",
  /^[0-9a-f]{40}$/.test(EVAL_PINS.baseModelRevision),
  `found ${JSON.stringify(EVAL_PINS.baseModelRevision)}`
);
check(
  "the notebook re-verifies the adapter bytes against the pin",
  /assert\s+ADAPTER_SHA256\s*==\s*PINS\['candidateAdapterSha256'\]/.test(codeSource),
  "the identity assertion must exist in the kernel, not only in the generator"
);
check(
  "the notebook refuses to run on an adapter identity mismatch",
  /REFUSING TO RUN: adapter identity mismatch/.test(codeSource)
);
check("TEST record count pin is 80", EVAL_PINS.testRecordCount === 80, `found ${EVAL_PINS.testRecordCount}`);

// ---------------------------------------------------------------- 8. decoding 7.1
check("decoding temperature is 0.0", EVAL_PINS.temperature === 0.0);
check("decoding do_sample is false", EVAL_PINS.doSample === false);
check("decoding top_p is 1.0", EVAL_PINS.topP === 1.0);
check("decoding top_k is 0", EVAL_PINS.topK === 0);
check("decoding max_new_tokens is 1024", EVAL_PINS.maxNewTokens === 1024, `found ${EVAL_PINS.maxNewTokens}`);
check("decoding seed is 0", EVAL_PINS.seed === 0);
check("decoding repeats is 1", EVAL_PINS.repeats === 1);
check(
  "generate() draws sampling params from PINS, not literals",
  /do_sample=PINS\['doSample'\]/.test(codeSource) && /max_new_tokens=PINS\['maxNewTokens'\]/.test(codeSource),
  "both arms must read the same frozen values; literals would allow silent divergence"
);
check(
  "both arms call the SAME completion function",
  (codeSource.match(/complete\(/g) || []).length >= 3 && codeSource.includes("complete(base_model, base_tok") && codeSource.includes("complete(candidate_model, base_tok"),
  "BASE and CANDIDATE must share one code path and one tokenizer"
);

// ---------------------------------------------------------------- 9. inference mode
const genUnderInference = /torch\.inference_mode\(\)[\s\S]{0,600}?generate\(/.test(codeSource);
check(
  "model.generate is reached only under torch.inference_mode()",
  genUnderInference,
  "every forward pass must be inference-only"
);
check(
  "gradients are asserted disabled for both arms",
  codeSource.includes("GRADIENT_ENABLED_BASE") && codeSource.includes("GRADIENT_ENABLED_CANDIDATE"),
  "both arms need an explicit requires_grad tripwire"
);

// ---------------------------------------------------------------- 10. honesty
check(
  "the run record declares no scoring happened in the notebook",
  /'scoredInThisNotebook':\s*False/.test(codeSource),
  "scoring is local; the kernel only produces predictions"
);
check(
  "the run record declares no training, tuning or selection",
  /'trainingUsed':\s*False/.test(codeSource) &&
    /'tuningUsed':\s*False/.test(codeSource) &&
    /'selectionLoopUsed':\s*False/.test(codeSource) &&
    /'gradientUsed':\s*False/.test(codeSource)
);
check(
  "the run record carries the real adapter hash it measured",
  /'candidateAdapterSha256':\s*ADAPTER_SHA256/.test(codeSource),
  "the recorded identity must be the recomputed one, not a copy of the pin"
);
check(
  "the run record carries the recomputed prompt-payload hash",
  /'promptsSha256':\s*PROMPTS_SHA256/.test(codeSource)
);

// ---------------------------------------------------------------- install discipline
const hasThreeStages =
  codeSource.includes("'install', [*BASE, *resolver_specs]") &&
  codeSource.includes("'frozen-no-deps', [*BASE, '--upgrade', '--no-deps', *frozen_specs]") &&
  codeSource.includes("'support-no-deps', [*BASE, '--no-deps', '--upgrade', *PINS['supportNoDeps']]");
check(
  "uses the governed three-stage uv install discipline",
  hasThreeStages,
  "the ad-hoc %pip sequence was DEFECT 1 of DEC-0033 / BLK-0004"
);
// The scan is over EXECUTABLE lines only: a comment may legitimately describe the defect it
// replaced (the generator's prose quotes the forbidden shapes), so comments are stripped first.
const executableLines = codeSource
  .split("\n")
  .filter((line) => {
    const t = line.trim();
    return !t.startsWith("#");
  })
  .join("\n");

check(
  "no -qqq on any governed install stage",
  // The ONLY permitted -qqq is the `uv` bootstrap, which installs a tool rather than a
  // governed dependency and whose failure surface is a missing binary, not a resolver
  // conflict. Every stage in INSTALL_PLAN must be fully observable.
  !/--no-cache-dir[\s\S]{0,400}?-qqq/.test(executableLines),
  "-qqq on a governed stage previously hid a real resolver failure"
);
check(
  "every install stage is dry-run with its exact arguments first",
  /run_install_command\(\[\*_cmd, '--dry-run'\], _phase \+ '-dry-run'\)/.test(codeSource) &&
    /run_install_command\(_cmd, _phase\)/.test(codeSource)
);
check(
  "preinstalled torch/triton are preserve-probed and constraint-pinned",
  codeSource.includes("PINS['preservedCandidates']") &&
    codeSource.includes("--constraint") &&
    codeSource.includes("triton_kernels")
);
check(
  "install failures raise the real resolver reason, not a bare exit code",
  codeSource.includes("stdout_redacted") && codeSource.includes("stderr_redacted")
);

// ---------------------------------------------------------------- harmony rendering
check(
  "render-then-tokenize, not a direct apply_chat_template tensor call",
  // Executable code must render to a STRING first and then tokenize; the direct
  // `apply_chat_template(..., return_tensors='pt')` form must not appear in executable code.
  // (Comments are stripped above: the generator's prose quotes the removed shape on purpose.)
  /apply_chat_template\([\s\S]{0,240}?tokenize=False/.test(executableLines) &&
    !/apply_chat_template\([\s\S]{0,300}?return_tensors\s*=\s*'pt'/.test(executableLines) &&
    /tokenizer\(text,\s*add_special_tokens=False,\s*return_tensors='pt'\)/.test(executableLines),
  "the direct tensor form was DEFECT 2 of DEC-0033 / BLK-0004"
);
check(
  "rendered Harmony text is asserted non-empty",
  /assert\s+isinstance\(rendered,\s*str\)\s+and\s+rendered/.test(codeSource)
);
check(
  "the developer/user role mapping matches the governed representation",
  codeSource.includes("'role': 'developer'") && codeSource.includes("'role': 'user'"),
  "the governed Gold representation uses a developer turn, not a system turn"
);
check(
  "Harmony control tokens are probed before either arm runs",
  /'<\|start\|>' in _probe/.test(codeSource),
  "a mis-rendered template must fail loudly instead of producing plausible garbage"
);

// ---------------------------------------------------------------- pins must be (a) decodable
// These checks exist because of the DEC-0035 launch failure: the pins were emitted as raw JSON
// into Python source, so the notebook died with `NameError: name 'false' is not defined` at
// 9.58 s, in cell 1. All 41 pre-existing checks PASSED on that broken notebook, because every
// one of them inspected the pins object in Node rather than the Python that was actually
// emitted. A checker that never runs the artifact cannot see a runtime error in it.
check(
  "pins are injected as an embedded JSON string, not as Python literals",
  /_PINS_JSON = r'''.*?'''/s.test(codeSource) && /PINS = json\.loads\(_PINS_JSON\)/.test(codeSource),
  "the DEC-0035 defect: a raw JSON literal in Python source is a NameError"
);
check(
  "no unquoted JSON-only literal appears in Python code position",
  !containsJsonOnlyLiterals(pinsCellSource()),
  "true/false/null in code position would raise NameError before any inference"
);
check(
  "the pin set survives a canonical JSON round-trip",
  pinsJsonText(JSON.parse(pinsJsonText(EVAL_PINS))) === pinsJsonText(EVAL_PINS)
);
check(
  "no nested pin object is empty",
  !hasEmptyObject(EVAL_PINS),
  "an Object.keys() allow-list silently shreds nested objects into {}"
);
check(
  "engineDependencies carries all 9 frozen specs with name+spec",
  Array.isArray(EVAL_PINS.engineDependencies) &&
    EVAL_PINS.engineDependencies.length === 9 &&
    EVAL_PINS.engineDependencies.every((d) => d && d.name && d.spec),
  "a shredded list would make the install stage iterate over nothing"
);
check(
  "the notebook asserts engineDependencies is non-empty before installing",
  /assert all\(isinstance\(d, dict\) and d\.get\('name'\) and d\.get\('spec'\)/.test(codeSource)
);
check(
  "the notebook restores JSON-degraded float pins before asserting types",
  /PINS\['temperature'\] = float\(/.test(executableLines) &&
    /PINS\['topP'\] = float\(/.test(executableLines),
  "JSON has no int/float distinction, so 0.0 round-trips to int 0"
);
check(
  "the decoding contract is asserted with exact types, not truthiness",
  /_DECODING_CONTRACT/.test(executableLines) &&
    /type\(_got\) is _type/.test(executableLines),
  "truthiness and == both accept the degraded int 0 for a float 0.0"
);

// ---------------------------------------------------------------- loader invocation
// These checks exist because of the DEC-0035 RELAUNCH failure: the loader call passed
// `revision=<base repo sha>` to `FastLanguageModel.from_pretrained`. `unsloth/gpt-oss-20b` is a
// DISTRIBUTION repo id that Unsloth resolves internally, so the revision was ignored, a substitute
// repo (`...-unsloth-bnb-4bit`) was chosen, and the load failed outright:
//
//   RuntimeError: Unsloth: Failed to load model. Both AutoConfig and PeftConfig loading failed.
//
// The accepted qualification and the GHARIBO-exp-001 training notebook both load with a model_name
// and NO revision. Reproducing that is the point; the pin is enforced elsewhere.
check(
  "the loader call passes NO revision argument",
  !/FastLanguageModel\.from_pretrained\([\s\S]{0,400}?revision\s*=/.test(executableLines),
  "DEFECT 4 of DEC-0035: a revision on the Unsloth distribution id makes the load fail"
);
check(
  "the loader call uses the pinned loader model id",
  /model_name=PINS\['loaderModelId'\]/.test(executableLines)
);
check(
  "the pinned base revision is asserted against the LIVE base repo revision",
  // Strict: the pin must be ENFORCED, not merely carried into the run record. The earlier version
  // of this check passed on `codeSource.includes("baseModelRevision")`, which is satisfied by the
  // run-record line alone — a check that could never fail, guarding nothing.
  /resolve_base_revision|HfApi\(\)\.model_info/.test(executableLines) &&
    /BASE_MODEL_REVISION/.test(executableLines) &&
    /PINS\['baseModelRevision'\]/.test(executableLines) &&
    /assert[\s\S]{0,120}baseModelRevision/.test(executableLines),
  "dropping the loader argument is only safe because the pin is enforced against the live base repo"
);
check(
  "the notebook verifies the loader did not substitute a different repo",
  /LOADER_NAME/.test(executableLines) && /'gpt-oss-20b' in str\(LOADER_NAME\)/.test(executableLines),
  "a silent substitution would mean measuring a different model"
);

// ---------------------------------------------------------------- report
const total = passed + failures.length;
console.log("─".repeat(64));
if (failures.length === 0) {
  console.log(`RESULT: PASSED — ${passed} check(s); the evaluation kernel is safe to run.`);
  console.log(`  notebook sha256: ${notebookSha256()}`);
  process.exit(0);
}
console.log(`RESULT: FAILED — ${failures.length} of ${total} check(s) failed:`);
for (const f of failures) console.log(`  • ${f}`);
process.exit(1);
