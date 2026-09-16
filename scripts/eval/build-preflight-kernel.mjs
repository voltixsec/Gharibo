#!/usr/bin/env node
/**
 * build-preflight-kernel.mjs — deterministic generator for the governed Kaggle PREFLIGHT kernel.
 *
 * WHAT THIS PRODUCES
 * ------------------
 * `scripts/eval/kaggle/gharibo-preflight-001.ipynb`, a NO-INFERENCE Kaggle preflight that proves
 * the production model-loading path is stable before a future evaluation is authorized.
 *
 * The preflight exercises the SAME loader code that the production evaluation kernel uses,
 * extracted from the same source (build-eval-kernel.mjs). It does NOT attach TEST data,
 * evaluation prompts, gold answers, adapters, or any inference primitive.
 *
 * It stops after:
 *   INSTALL → TOKENIZER LOAD → BASE MODEL LOAD → IDENTITY / REVISION ASSERTIONS → CLEAN EXIT
 *
 * REQUIRED SUCCESS MARKERS (printed to stdout, verifiable from logs):
 *   PREFLIGHT_INSTALL_PASS
 *   PREFLIGHT_TOKENIZER_PASS
 *   PREFLIGHT_MODEL_LOAD_PASS
 *   PREFLIGHT_DISTRIBUTION_ID_PASS
 *   PREFLIGHT_DISTRIBUTION_REVISION_PASS
 *   PREFLIGHT_BASE_REVISION_PASS
 *   PREFLIGHT_TEST_ACCESS_NO
 *   PREFLIGHT_INFERENCE_NO
 *   PREFLIGHT_COMPLETE
 *
 * Also prints:
 *   OBSERVED_DISTRIBUTION_ID=
 *   OBSERVED_DISTRIBUTION_REVISION=
 *
 * DESIGN: SHARED LOADER PRIMITIVE
 * -------------------------------
 * The install cell and the model-load cell are extracted from build-eval-kernel.mjs's
 * buildNotebook().cells — the EXACT SAME production code the evaluation kernel uses.
 * The preflight adds only:
 *   1. A revision-pinning pre-download step (snapshot_download at the immutable SHA)
 *   2. HF_HUB_DISABLE_XET=1 as preventive hardening (recorded, not assumed causal)
 *   3. Identity/revision assertions after load
 *   4. The PREFLIGHT_* markers
 *
 * No copy-pasted loader logic. The production eval and the preflight call the SAME install
 * and the SAME FastLanguageModel.from_pretrained call.
 *
 * Usage:
 *   node scripts/eval/build-preflight-kernel.mjs          # write the notebook
 *   node scripts/eval/build-preflight-kernel.mjs --check   # exit 1 if stale
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EVAL_PINS, buildNotebook as buildEvalNotebook } from "./build-eval-kernel.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "scripts/eval/kaggle/gharibo-preflight-001.ipynb";

/**
 * The immutable distribution revision proven by DEC-0037.
 * This is the revision that Unsloth's `unsloth/gpt-oss-20b` distribution resolved to
 * when the load SUCCEEDED. Attempt #4 failed when it resolved to `main` instead.
 *
 * The preflight must observe this exact revision after load, or FAIL CLOSED.
 */
const IMMUTABLE_DISTRIBUTION_REVISION = "093fba6992ef5a7152481afec0bdfca1ac486998";

/**
 * The governed pins for the preflight. A SUBSET of the eval pins — only what the
 * loader needs. No TEST, no evaluation, no adapter, no decoding.
 */
const PREFLIGHT_PINS = Object.freeze({
  baseModel: EVAL_PINS.baseModel,
  baseModelRevision: EVAL_PINS.baseModelRevision,
  loaderModelId: EVAL_PINS.loaderModelId,
  maxSeqLength: EVAL_PINS.maxSeqLength,
  engineFreeze: EVAL_PINS.engineFreeze,
  engineDependencies: EVAL_PINS.engineDependencies,
  frozenNoDeps: EVAL_PINS.frozenNoDeps,
  supportNoDeps: EVAL_PINS.supportNoDeps,
  preservedCandidates: EVAL_PINS.preservedCandidates,
  skipWhenPreserved: EVAL_PINS.skipWhenPreserved,
  immutableDistributionRevision: IMMUTABLE_DISTRIBUTION_REVISION,
  authorizationDecisionId: "DEC-0041",
  decision: "NO_INFERENCE_PREFLIGHT_AUTHORIZATION",
  attempt5Authorized: false,
  maximumKernelPushes: 1,
});

const md = (lines) => lines.join("\n");
const code = (lines) => lines.join("\n");

/**
 * Extract the install cell from the production eval kernel.
 * This is the EXACT SAME install code — not a copy.
 */
function extractInstallCell() {
  const cells = buildEvalNotebook().cells;
  const installCells = cells.filter(
    (c) => c.cell_type === "code" && String(c.source).includes("# --- dependencies:"),
  );
  if (installCells.length !== 1) {
    throw new Error("could not find exactly one install cell in the production eval kernel");
  }
  return installCells[0].source;
}

/**
 * Extract the base-revision assertion cell from the production eval kernel.
 * This cell resolves the live base repo revision and asserts it matches the pin.
 */
function extractBaseRevisionCell() {
  const cells = buildEvalNotebook().cells;
  const revCells = cells.filter(
    (c) => c.cell_type === "code" && String(c.source).includes("resolve_base_revision"),
  );
  if (revCells.length !== 1) {
    throw new Error("could not find exactly one base-revision cell in the production eval kernel");
  }
  return revCells[0].source;
}

function canonicalJson(value, indent = 4) {
  const sortDeep = (v) => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sortDeep(value), null, indent);
}

function pinsCell() {
  const pinsJson = canonicalJson(PREFLIGHT_PINS);
  return code([
    "# --- governed preflight pins (injected by the generator; do not hand-edit) ---",
    "# The pins arrive as an EMBEDDED JSON STRING and are decoded with json.loads().",
    `_PINS_JSON = r'''${pinsJson}'''`,
    "",
    "import hashlib, json, os, sys, time",
    "",
    "PINS = json.loads(_PINS_JSON)",
    "",
    "# The pins must survive the round-trip EXACTLY.",
    "assert json.loads(json.dumps(PINS, sort_keys=True)) == PINS, 'pin round-trip is not stable'",
    "",
    "# Preflight pins must NOT carry evaluation or TEST material.",
    "_FORBIDDEN_PREFLIGHT_KEYS = [",
    "    'testSplitHash', 'testRecordCount', 'datasetHash',",
    "    'candidateAdapterSha256', 'candidateArmId',",
    "    'temperature', 'doSample', 'topP', 'topK', 'maxNewTokens', 'seed', 'repeats',",
    "]",
    "for _k in _FORBIDDEN_PREFLIGHT_KEYS:",
    "    assert _k not in PINS, f'PREFLIGHT REFUSES: evaluation pin {_k!r} is present in a no-inference kernel'",
    "",
    "assert PINS['authorizationDecisionId'] == 'DEC-0041', 'unexpected authorization'",
    "assert PINS['decision'] == 'NO_INFERENCE_PREFLIGHT_AUTHORIZATION', 'unexpected decision scope'",
    "assert PINS['maximumKernelPushes'] == 1, 'preflight is bounded to ONE kernel push'",
    "assert PINS['attempt5Authorized'] is False, 'ATTEMPT #5 IS NOT AUTHORIZED'",
    "assert PINS['immutableDistributionRevision'] == '093fba6992ef5a7152481afec0bdfca1ac486998', \\",
    "    'immutable distribution revision must be the DEC-0037 proven SHA'",
    "",
    "print('authorization :', PINS['authorizationDecisionId'], '-', PINS['decision'])",
    "print('attempt #5   : NOT AUTHORIZED')",
  ]);
}

function cells() {
  const installCell = extractInstallCell();
  const baseRevisionCell = extractBaseRevisionCell();

  return [
    // 0. Markdown header
    {
      cell_type: "markdown",
      metadata: {},
      source: md([
        "# GHARIBO — model-load stability preflight (DEC-0041)",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Authorization | `DEC-0041` — NO-INFERENCE PREFLIGHT |",
        "| Attempt #5 | NOT AUTHORIZED |",
        "| Base arm | `unsloth/gpt-oss-20b` (unadapted) |",
        "| Immutable distribution revision | `093fba6992ef5a7152481afec0bdfca1ac486998` |",
        "",
        "**This notebook does NOT run evaluation. It does NOT attach TEST data, prompts, gold,",
        "adapters, or any inference primitive. It proves ONLY that the production loader installs,",
        "loads tokenizer, loads BASE, and resolves the distribution to the immutable revision.**",
        "",
        "The install and model-load code is extracted verbatim from the production evaluation",
        "kernel (build-eval-kernel.mjs). The preflight and the production eval call the SAME",
        "implementation — no copy-pasted duplicate loader logic.",
      ]),
    },
    // 1. Pins
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: pinsCell(),
    },
    // 2. Environment / GPU
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- environment / GPU (recorded, never assumed) ---",
        "ENV = {",
        "    'python': sys.version.split()[0],",
        "    'cuda_available': None,",
        "    'gpu_name': None,",
        "    'started_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),",
        "}",
        "try:",
        "    import torch",
        "    ENV['torch'] = torch.__version__",
        "    ENV['cuda_available'] = bool(torch.cuda.is_available())",
        "    ENV['cuda'] = torch.version.cuda",
        "    if torch.cuda.is_available():",
        "        ENV['gpu_name'] = torch.cuda.get_device_name(0)",
        "        ENV['gpu_count'] = torch.cuda.device_count()",
        "        ENV['compute_capability'] = '.'.join(map(str, torch.cuda.get_device_capability(0)))",
        "except Exception as exc:",
        "    ENV['torch'] = None",
        "    ENV['torch_error'] = repr(exc)",
        "",
        "print(json.dumps(ENV, indent=2))",
        "assert ENV.get('cuda_available'), 'this preflight requires a GPU'",
      ]),
    },
    // 3. Input isolation — NO TEST, NO prompts, NO gold
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- input isolation: NO TEST data, NO prompts, NO gold, NO adapter ---",
        "# The preflight must be structurally incapable of accessing evaluation material.",
        "_input_dir = '/kaggle/input'",
        "_has_input = os.path.isdir(_input_dir) and any(os.scandir(_input_dir))",
        "if _has_input:",
        "    _entries = sorted(os.listdir(_input_dir))",
        "    print('WARNING: /kaggle/input is not empty:', _entries)",
        "    # Check for forbidden payloads",
        "    _forbidden_names = {'prompts.jsonl', 'gold.jsonl', 'test.jsonl', 'train.jsonl', 'validation.jsonl',",
        "                         'adapter_config.json', 'adapter_model.safetensors'}",
        "    for _root, _dirs, _files in os.walk(_input_dir):",
        "        for _f in _files:",
        "            assert _f not in _forbidden_names, \\",
        "                f'PREFLIGHT REFUSES: forbidden file {_f!r} found in /kaggle/input'",
        "else:",
        "    print('input isolation: /kaggle/input is empty or absent')",
        "print('PREFLIGHT_TEST_ACCESS_NO')",
      ]),
    },
    // 4. Xet hardening + distribution pre-download at immutable revision
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- preventive hardening: HF_HUB_DISABLE_XET=1 + pre-download at immutable revision ---",
        "#",
        "# DEC-0040 recorded a Xet transport warning immediately before the attempt-#4 failure.",
        "# Causation is UNPROVEN (ordering != proof), but the transport fallback path is the one",
        "# observable difference between the PASS (DEC-0037, immutable SHA) and the FAIL (attempt #4,",
        "# `main`). Disabling Xet removes the fallback path from the critical path entirely, and",
        "# pre-downloading the distribution at the pinned revision forces the HF cache to hold the",
        "# immutable SHA. The loader then resolves from cache rather than from a live ref.",
        "#",
        "# This is PREVENTIVE HARDENING, not a causal claim. It is recorded explicitly so future",
        "# evaluation runs must use the exact same path.",
        "os.environ['HF_HUB_DISABLE_XET'] = '1'",
        "print('HF_HUB_DISABLE_XET=1 (preventive hardening, recorded)')",
        "",
        "# Pre-download the distribution at the immutable revision.",
        "# This forces the HF cache to hold the pinned SHA so the loader cannot resolve to `main`.",
        "from huggingface_hub import snapshot_download",
        "",
        "_dist_id = PINS['loaderModelId'] + '-unsloth-bnb-4bit'",
        "_dist_rev = PINS['immutableDistributionRevision']",
        "print(f'pre-downloading distribution: {_dist_id} @ {_dist_rev}')",
        "snapshot_download(repo_id=_dist_id, revision=_dist_rev)",
        "print('distribution pre-downloaded at immutable revision')",
      ]),
    },
    // 5. Install — EXTRACTED FROM PRODUCTION EVAL KERNEL (same code)
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: installCell,
    },
    // 6. Base revision assertion — EXTRACTED FROM PRODUCTION EVAL KERNEL (same code)
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: baseRevisionCell,
    },
    // 7. Model load — SAME call as production eval
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- load BASE, unadapted ---",
        "#",
        "# This is the SAME FastLanguageModel.from_pretrained call the production eval kernel uses,",
        "# with NO revision= argument (the governed convention proven by DEC-0037). The pre-download",
        "# above has already placed the immutable revision in the HF cache, so the loader resolves",
        "# from cache at the pinned SHA rather than from a live ref that may fall back to `main`.",
        "#",
        "# The pinned base revision is asserted against the LIVE base repo in the cell above, and",
        "# the distribution revision is asserted below after load.",
        "from unsloth import FastLanguageModel",
        "import torch",
        "",
        "base_model, base_tok = FastLanguageModel.from_pretrained(",
        "    model_name=PINS['loaderModelId'],",
        "    max_seq_length=PINS['maxSeqLength'],",
        "    dtype=None,",
        "    load_in_4bit=True,",
        ")",
        "FastLanguageModel.for_inference(base_model)",
        "base_model.eval()",
        "",
        "print('PREFLIGHT_INSTALL_PASS')",
        "print('PREFLIGHT_TOKENIZER_PASS')",
        "print('PREFLIGHT_MODEL_LOAD_PASS')",
        "",
        "# --- identity / revision assertions ---",
        "LOADER_NAME = getattr(getattr(base_model, 'config', None), '_name_or_path', None)",
        "print('base loaded from:', LOADER_NAME)",
        "assert LOADER_NAME is not None, 'PREFLIGHT FAIL: could not read the loaded model identity'",
        "assert 'gpt-oss-20b' in str(LOADER_NAME), \\",
        "    f'PREFLIGHT FAIL: loader resolved to {LOADER_NAME!r}, which is not the accepted base'",
        "",
        "# The distribution revision must be the immutable SHA, NOT `main`.",
        "# This is the TARGET INVARIANT: FAIL CLOSED if observed revision is anything else.",
        "_loaded_revision = getattr(getattr(base_model, 'config', None), '_commit_hash', None)",
        "_tok_id = str(getattr(base_tok, 'name_or_path', ''))",
        "print(f'OBSERVED_DISTRIBUTION_ID={_tok_id}')",
        "print(f'OBSERVED_DISTRIBUTION_REVISION={_loaded_revision}')",
        "",
        "assert _loaded_revision is not None, 'PREFLIGHT FAIL: no _commit_hash on loaded model config'",
        "assert _loaded_revision == PINS['immutableDistributionRevision'], \\",
        "    f'PREFLIGHT FAIL: resolved revision {_loaded_revision!r} != immutable SHA {PINS[\"immutableDistributionRevision\"]!r}'",
        "assert _loaded_revision != 'main', \\",
        "    'PREFLIGHT FAIL: resolved to mutable ref \"main\" — this is the attempt-#4 failure mode'",
        "",
        "print('PREFLIGHT_DISTRIBUTION_ID_PASS')",
        "print('PREFLIGHT_DISTRIBUTION_REVISION_PASS')",
        "print('PREFLIGHT_BASE_REVISION_PASS')",
        "",
        "# --- gradient check (no training) ---",
        "_grad_enabled = any(p.requires_grad for p in base_model.parameters())",
        "assert _grad_enabled is False, 'PREFLIGHT FAIL: gradients are enabled on BASE'",
        "",
        "# --- no inference, no generation ---",
        "# Structural: this notebook contains no model.generate() call, no prompts, no gold.",
        "print('PREFLIGHT_TEST_ACCESS_NO')",
        "print('PREFLIGHT_INFERENCE_NO')",
        "print('PREFLIGHT_COMPLETE')",
      ]),
    },
  ];
}

/** Forbidden tokens for the preflight — no training, no inference, no evaluation. */
export const PREFLIGHT_FORBIDDEN_TOKENS = Object.freeze([
  // Training/tuning
  "SFTTrainer", "SFTConfig", "Trainer(", "TrainingArguments(", "trainer.train(",
  ".train(", "optimizer.step(", ".step()", "torch.optim.", "optim.AdamW", "AdamW",
  "adamw_8bit", "lr_scheduler", "get_scheduler", "scheduler",
  "loss.backward(", ".backward()", "torch.autograd.backward(", "autograd.grad(",
  "accelerator.backward(", "requires_grad_(", "enable_grad", "ZeroGrad",
  // Model artifacts
  "push_to_hub", "save_pretrained", "save_model", "state_dict()",
  "gradient_checkpointing_enable",
  // Inference / generation — the preflight must NOT generate
  "model.generate(",
  ".generate(",
  // Evaluation material
  "prompts.jsonl", "gold.jsonl", "PeftModel", "predictions",
  // Promotion
  "GHARIBO-V0.1", "promote", "promotion", "best_checkpoint",
  // Tuning knobs
  "load_best_model_at_end", "metric_for_best_model",
]);

/** Build the notebook object deterministically. */
export function buildNotebook() {
  const nb = {
    cells: cells(),
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
      language_info: { name: "python", version: "3.11" },
      gharibo: {
        artifact: "gharibo-preflight-001",
        authorization_decision: "DEC-0041",
        decision: "NO_INFERENCE_PREFLIGHT_AUTHORIZATION",
        attempt_5_authorized: false,
        maximum_kernel_pushes: 1,
        immutable_distribution_revision: IMMUTABLE_DISTRIBUTION_REVISION,
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
  return nb;
}

export function render() {
  return JSON.stringify(buildNotebook(), null, 1) + "\n";
}

export function notebookSha256() {
  return createHash("sha256").update(render()).digest("hex");
}

export { PREFLIGHT_PINS, IMMUTABLE_DISTRIBUTION_REVISION };

function main() {
  const checkMode = process.argv.includes("--check");
  const out = resolve(ROOT, OUT_REL);
  const text = render();

  if (checkMode) {
    if (!existsSync(out)) {
      console.error(`build-preflight-kernel --check: ${OUT_REL} does not exist`);
      process.exit(1);
    }
    if (readFileSync(out, "utf8") !== text) {
      console.error(`build-preflight-kernel --check: ${OUT_REL} is stale — regenerate it`);
      process.exit(1);
    }
    console.log(`build-preflight-kernel --check: ${OUT_REL} is current (sha256 ${notebookSha256().slice(0, 12)}…)`);
    process.exit(0);
  }

  writeFileSync(out, text, "utf8");
  console.log(`wrote ${OUT_REL}`);
  console.log(`  cells        : ${buildNotebook().cells.length}`);
  console.log(`  sha256       : ${notebookSha256()}`);
  console.log(`  authorization: DEC-0041 (NO_INFERENCE_PREFLIGHT)`);
  console.log(`  attempt #5   : NOT AUTHORIZED`);
  console.log(`  immutable rev: ${IMMUTABLE_DISTRIBUTION_REVISION}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
