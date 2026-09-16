#!/usr/bin/env node
/**
 * build-dec0042-preflight.mjs — deterministic generator for the DEC-0042 LOCAL-SNAPSHOT preflight.
 *
 * DEC-0042 authorizes ONE NO-INFERENCE Kaggle preflight kernel push to prove a DETERMINISTIC
 * local-snapshot model-loading architecture. It explicitly states:
 * ATTEMPT #5 IS NOT AUTHORIZED.
 *
 * WHAT CHANGED FROM DEC-0041
 * --------------------------
 * DEC-0041 pre-downloaded the distribution at the immutable SHA via snapshot_download but
 * DISCARDED the returned local path. The production loader was then called with the repo id
 * `unsloth/gpt-oss-20b`, which allowed Unsloth/Transformers to perform Hub resolution again
 * and hit `tree/main/additional_chat_templates` (404 at `main`, fatal).
 *
 * DEC-0042 closes that gap: the actual model loader MUST receive the returned LOCAL SNAPSHOT
 * DIRECTORY, not a repo id. The primary invariant is:
 *
 *   THE LOADER RECEIVES A LOCAL DIRECTORY, NOT A REPO ID.
 *
 * ARCHITECTURE
 * ------------
 *   PHASE 1 — DOWNLOAD:  snapshot_download at the exact distribution repo + exact immutable SHA.
 *                          CAPTURE the returned path.
 *   PHASE 2 — SEAL:       HF_HUB_OFFLINE=1 + TRANSFORMERS_OFFLINE=1 (defense-in-depth, NOT primary).
 *   PHASE 3 — LOAD:      FastLanguageModel.from_pretrained(model_name=SNAPSHOT_DIR,
 *                          local_files_only=True, ...)
 *
 * This is NOT an evaluation authorization. It does not attach TEST, prompts, gold, adapters,
 * or any inference primitive. It proves ONLY:
 *   1. install succeeds;
 *   2. snapshot download succeeds and the returned path is a valid local directory;
 *   3. required config/tokenizer/model-index files exist in the snapshot;
 *   4. tokenizer loads;
 *   5. BASE model loads from the LOCAL SNAPSHOT PATH with local_files_only=True;
 *   6. no mutable `main` resolution is observed during or after the load;
 *   7. no TEST data is accessed;
 *   8. no inference is executed.
 *
 * Usage:
 *   node scripts/eval/build-dec0042-preflight.mjs          # write the notebook
 *   node scripts/eval/build-dec0042-preflight.mjs --check   # exit 1 if stale
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EVAL_PINS, buildNotebook as buildEvalNotebook } from "./build-eval-kernel.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "scripts/eval/kaggle/gharibo-preflight-002.ipynb";

/**
 * The immutable distribution revision proven by DEC-0037.
 * Same as DEC-0041 — the revision has not changed.
 */
const IMMUTABLE_DISTRIBUTION_REVISION = "093fba6992ef5a7152481afec0bdfca1ac486998";

/**
 * The exact distribution repo for the snapshot download.
 * This is `loaderModelId + "-unsloth-bnb-4bit"`, pinned explicitly so there is no ambiguity.
 */
const DISTRIBUTION_REPO = "unsloth/gpt-oss-20b-unsloth-bnb-4bit";

/**
 * The governed pins for the DEC-0042 preflight. A SUBSET of the eval pins — only what the
 * loader needs. No TEST, no evaluation, no adapter, no decoding.
 */
const PREFLIGHT3_PINS = Object.freeze({
  baseModel: EVAL_PINS.baseModel,
  baseModelRevision: EVAL_PINS.baseModelRevision,
  loaderModelId: EVAL_PINS.loaderModelId,
  distributionRepo: DISTRIBUTION_REPO,
  immutableDistributionRevision: IMMUTABLE_DISTRIBUTION_REVISION,
  maxSeqLength: EVAL_PINS.maxSeqLength,
  engineFreeze: EVAL_PINS.engineFreeze,
  engineDependencies: EVAL_PINS.engineDependencies,
  frozenNoDeps: EVAL_PINS.frozenNoDeps,
  supportNoDeps: EVAL_PINS.supportNoDeps,
  preservedCandidates: EVAL_PINS.preservedCandidates,
  skipWhenPreserved: EVAL_PINS.skipWhenPreserved,
  authorizationDecisionId: "DEC-0042",
  decision: "LOCAL_SNAPSHOT_PREFLIGHT_AUTHORIZATION",
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
 * It needs network access and runs BEFORE the network seal.
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
  const pinsJson = canonicalJson(PREFLIGHT3_PINS);
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
    "assert PINS['authorizationDecisionId'] == 'DEC-0042', 'unexpected authorization'",
    "assert PINS['decision'] == 'LOCAL_SNAPSHOT_PREFLIGHT_AUTHORIZATION', 'unexpected decision scope'",
    "assert PINS['maximumKernelPushes'] == 1, 'preflight is bounded to ONE kernel push'",
    "assert PINS['attempt5Authorized'] is False, 'ATTEMPT #5 IS NOT AUTHORIZED'",
    "assert PINS['immutableDistributionRevision'] == '093fba6992ef5a7152481afec0bdfca1ac486998', \\",
    "    'immutable distribution revision must be the DEC-0037 proven SHA'",
    "assert PINS['distributionRepo'] == 'unsloth/gpt-oss-20b-unsloth-bnb-4bit', \\",
    "    'distribution repo must be the exact bnb-4bit distribution'",
    "",
    "print('authorization :', PINS['authorizationDecisionId'], '-', PINS['decision'])",
    "print('attempt #5   : NOT AUTHORIZED')",
    "print('architecture  : LOCAL IMMUTABLE SNAPSHOT — loader receives a local directory, not a repo id')",
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
        "# GHARIBO — FINAL MODEL-LOAD PREFLIGHT: LOCAL IMMUTABLE SNAPSHOT (DEC-0042)",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Authorization | `DEC-0042` — LOCAL_SNAPSHOT_PREFLIGHT |",
        "| Attempt #5 | NOT AUTHORIZED |",
        "| Distribution repo | `unsloth/gpt-oss-20b-unsloth-bnb-4bit` |",
        "| Immutable revision | `093fba6992ef5a7152481afec0bdfca1ac486998` |",
        "| Base identity | `openai/gpt-oss-20b` @ `6cee5e81ee83917806bbde320786a8fb61efebee` |",
        "| Architecture | LOCAL IMMUTABLE SNAPSHOT — loader receives a local directory |",
        "",
        "**WHY THE PREVIOUS PREFLIGHT (DEC-0041) WAS INSUFFICIENT**",
        "",
        "DEC-0041 successfully executed `snapshot_download` at the immutable SHA but",
        "**discarded the returned local path**. The production loader was then called with",
        "the repo id `unsloth/gpt-oss-20b`, which allowed Hub resolution to occur again",
        "and hit `tree/main/additional_chat_templates` (404 at `main`, fatal).",
        "",
        "**THIS PREFLIGHT** closes that gap: the actual model loader receives the returned",
        "LOCAL SNAPSHOT DIRECTORY, not a repo id. The primary invariant is:",
        "",
        "> THE LOADER RECEIVES A LOCAL DIRECTORY, NOT A REPO ID.",
        "",
        "**This notebook does NOT run evaluation. It does NOT attach TEST data, prompts, gold,",
        "adapters, or any inference primitive. It proves ONLY that the local-snapshot architecture",
        "loads the distribution from a local path with no mutable `main` resolution.**",
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
        "    _forbidden_names = {'prompts.jsonl', 'gold.jsonl', 'test.jsonl', 'train.jsonl', 'validation.jsonl',",
        "                         'adapter_config.json', 'adapter_model.safetensors'}",
        "    for _root, _dirs, _files in os.walk(_input_dir):",
        "        for _f in _files:",
        "            assert _f not in _forbidden_names, \\",
        "                f'PREFLIGHT REFUSES: forbidden file {_f!r} found in /kaggle/input'",
        "else:",
        "    print('input isolation: /kaggle/input is empty or absent')",
        "print('PREFLIGHT3_TEST_ACCESS_NO')",
      ]),
    },
    // 4. Install — EXTRACTED FROM PRODUCTION EVAL KERNEL (same code)
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: installCell,
    },
    // 5. Version diagnostics
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- version diagnostic (recorded before load, never assumed) ---",
        "#",
        "# Print and record the exact package versions so the load result can be correlated.",
        "# Also print the exception MRO for RemoteEntryNotFoundError and HfHubHTTPError so",
        "# the exception hierarchy is diagnostic evidence, not a mystery.",
        "#",
        "# DO NOT change package versions in this task. DO NOT upgrade anything.",
        "import transformers",
        "import huggingface_hub",
        "",
        "print(f'transformers: {transformers.__version__}')",
        "print(f'huggingface_hub: {huggingface_hub.__version__}')",
        "",
        "try:",
        "    import unsloth",
        "    _unsloth_ver = getattr(unsloth, '__version__', 'unknown')",
        "    print(f'unsloth: {_unsloth_ver}')",
        "except Exception as e:",
        "    print(f'unsloth: import error: {e!r}')",
        "",
        "try:",
        "    import unsloth_zoo",
        "    _unsloth_zoo_ver = getattr(unsloth_zoo, '__version__', 'unknown')",
        "    print(f'unsloth_zoo: {_unsloth_zoo_ver}')",
        "except Exception as e:",
        "    print(f'unsloth_zoo: import error: {e!r}')",
        "",
        "# --- exception MRO diagnostic ---",
        "# HfHubHTTPError may be in huggingface_hub.errors, not re-exported at top level.",
        "_hf_hub_http_error = None",
        "for _mod_path in ['huggingface_hub', 'huggingface_hub.errors']:",
        "    try:",
        "        _mod = __import__(_mod_path, fromlist=['HfHubHTTPError'])",
        "        _hf_hub_http_error = getattr(_mod, 'HfHubHTTPError', None)",
        "        if _hf_hub_http_error is not None:",
        "            print(f'HfHubHTTPError MRO: {[c.__name__ for c in _hf_hub_http_error.__mro__]}')",
        "            break",
        "    except (ImportError, AttributeError):",
        "        continue",
        "if _hf_hub_http_error is None:",
        "    print('HfHubHTTPError: not importable from any known location')",
        "",
        "_remote_entry_not_found = None",
        "for _mod_path in ['huggingface_hub.utils', 'huggingface_hub.errors', 'huggingface_hub']:",
        "    try:",
        "        _mod = __import__(_mod_path, fromlist=['RemoteEntryNotFoundError'])",
        "        _remote_entry_not_found = getattr(_mod, 'RemoteEntryNotFoundError', None)",
        "        if _remote_entry_not_found is not None:",
        "            print(f'RemoteEntryNotFoundError MRO: {[c.__name__ for c in _remote_entry_not_found.__mro__]}')",
        "            break",
        "    except (ImportError, AttributeError):",
        "        continue",
        "if _remote_entry_not_found is None:",
        "    print('RemoteEntryNotFoundError: not importable from any known location')",
      ]),
    },
    // 6. Base revision assertion — EXTRACTED FROM PRODUCTION EVAL KERNEL (needs network)
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: baseRevisionCell,
    },
    // 7. PHASE 1 — DOWNLOAD: snapshot_download at immutable SHA, CAPTURE returned path
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- PHASE 1: download the distribution at the immutable revision ---",
        "#",
        "# CAPTURE the returned local snapshot path. Do NOT discard it.",
        "# The actual model loader in Phase 3 receives THIS path, not a repo id.",
        "#",
        "# HF_HUB_DISABLE_XET=1 is preventive hardening (recorded, not assumed causal).",
        "# It is NOT the primary fix. The primary invariant is the local path.",
        "os.environ['HF_HUB_DISABLE_XET'] = '1'",
        "print('HF_HUB_DISABLE_XET=1 (preventive hardening, recorded)')",
        "",
        "from huggingface_hub import snapshot_download",
        "",
        "_dist_repo = PINS['distributionRepo']",
        "_dist_rev = PINS['immutableDistributionRevision']",
        "print(f'downloading distribution: {_dist_repo} @ {_dist_rev}')",
        "",
        "SNAPSHOT_DIR = snapshot_download(",
        "    repo_id=_dist_repo,",
        "    revision=_dist_rev,",
        ")",
        "",
        "print(f'SNAPSHOT_DIR = {SNAPSHOT_DIR}')",
        "",
        "# --- assert the snapshot path is valid ---",
        "assert SNAPSHOT_DIR is not None, 'PREFLIGHT FAIL: snapshot_download returned None'",
        "assert isinstance(SNAPSHOT_DIR, str), f'PREFLIGHT FAIL: snapshot path is not a string: {type(SNAPSHOT_DIR)}'",
        "assert os.path.isdir(SNAPSHOT_DIR), f'PREFLIGHT FAIL: snapshot_dir is not a directory: {SNAPSHOT_DIR}'",
        "",
        "# --- assert the snapshot corresponds to the immutable revision ---",
        "_snapshot_basename = os.path.basename(SNAPSHOT_DIR.rstrip('/'))",
        "print(f'snapshot basename: {_snapshot_basename}')",
        "assert _snapshot_basename == _dist_rev, \\",
        "    f'PREFLIGHT FAIL: snapshot basename {_snapshot_basename!r} != immutable SHA {_dist_rev!r}'",
        "assert _snapshot_basename != 'main', 'PREFLIGHT FAIL: snapshot resolved to mutable ref main'",
        "",
        "# --- assert required config/tokenizer/model-index files exist ---",
        "_required_config = 'config.json'",
        "_required_tokenizer = ['tokenizer.json', 'tokenizer_config.json']",
        "_required_model_index = ['model.safetensors.index.json', 'model.safetensors', 'pytorch_model.bin.index.json']",
        "",
        "assert os.path.isfile(os.path.join(SNAPSHOT_DIR, _required_config)), \\",
        "    f'PREFLIGHT FAIL: {_required_config} missing from snapshot'",
        "",
        "_tok_found = [f for f in _required_tokenizer if os.path.isfile(os.path.join(SNAPSHOT_DIR, f))]",
        "assert len(_tok_found) > 0, \\",
        "    f'PREFLIGHT FAIL: no tokenizer file found ({_required_tokenizer})'",
        "print(f'tokenizer files found: {_tok_found}')",
        "",
        "_idx_found = [f for f in _required_model_index if os.path.isfile(os.path.join(SNAPSHOT_DIR, f))]",
        "assert len(_idx_found) > 0, \\",
        "    f'PREFLIGHT FAIL: no model-index file found ({_required_model_index})'",
        "print(f'model-index files found: {_idx_found}')",
        "",
        "# --- list snapshot contents for diagnostic evidence ---",
        "_snapshot_files = sorted(os.listdir(SNAPSHOT_DIR))",
        "print(f'snapshot file count: {len(_snapshot_files)}')",
        "print(f'snapshot files: {_snapshot_files}')",
        "",
        "print('PREFLIGHT3_SNAPSHOT_PASS')",
        "print('PREFLIGHT3_LOCAL_PATH_PASS')",
      ]),
    },
    // 8. PHASE 2 — SEAL network resolution
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- PHASE 2: seal network resolution ---",
        "#",
        "# After the complete snapshot exists, the MODEL-LOAD phase must NOT depend on",
        "# Hugging Face Hub resolution.",
        "#",
        "# HF_HUB_OFFLINE=1 and TRANSFORMERS_OFFLINE=1 are defense-in-depth.",
        "# They are NOT the primary fix.",
        "#",
        "# The primary invariant is: THE LOADER RECEIVES A LOCAL DIRECTORY, NOT A REPO ID.",
        "os.environ['HF_HUB_OFFLINE'] = '1'",
        "os.environ['TRANSFORMERS_OFFLINE'] = '1'",
        "print('HF_HUB_OFFLINE=1 (defense-in-depth)')",
        "print('TRANSFORMERS_OFFLINE=1 (defense-in-depth)')",
        "print('primary invariant: loader receives local snapshot directory, not a repo id')",
        "print(f'loader model_name will be: {SNAPSHOT_DIR}')",
      ]),
    },
    // 9. PHASE 3 — LOAD: model_name=SNAPSHOT_DIR, local_files_only=True
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- PHASE 3: load from the LOCAL SNAPSHOT DIRECTORY ---",
        "#",
        "# The loader receives the returned local snapshot path, NOT a repo id.",
        "# local_files_only=True prevents any network resolution.",
        "#",
        "# Do NOT pass 'unsloth/gpt-oss-20b' or 'unsloth/gpt-oss-20b-unsloth-bnb-4bit'",
        "# to the actual model-load call. The Hub repo id is permitted ONLY during the",
        "# download phase (Phase 1 above).",
        "#",
        "# Do not monkey-patch around exceptions merely to obtain PASS.",
        "# If the load fails, the traceback is recorded and the preflight stops.",
        "from unsloth import FastLanguageModel",
        "import torch",
        "",
        "print(f'loading BASE from local snapshot: {SNAPSHOT_DIR}')",
        "print(f'local_files_only=True')",
        "",
        "base_model, base_tok = FastLanguageModel.from_pretrained(",
        "    model_name=SNAPSHOT_DIR,",
        "    max_seq_length=PINS['maxSeqLength'],",
        "    dtype=None,",
        "    load_in_4bit=True,",
        "    local_files_only=True,",
        ")",
        "FastLanguageModel.for_inference(base_model)",
        "base_model.eval()",
        "",
        "print('PREFLIGHT3_TOKENIZER_PASS')",
        "print('PREFLIGHT3_MODEL_LOAD_PASS')",
        "",
        "# --- identity / revision assertions ---",
        "LOADER_NAME = getattr(getattr(base_model, 'config', None), '_name_or_path', None)",
        "print(f'base loaded from: {LOADER_NAME}')",
        "assert LOADER_NAME is not None, 'PREFLIGHT FAIL: could not read the loaded model identity'",
        "assert 'gpt-oss-20b' in str(LOADER_NAME), \\",
        "    f'PREFLIGHT FAIL: loader resolved to {LOADER_NAME!r}, which is not the accepted base'",
        "",
        "# The distribution revision must NOT be 'main'.",
        "# When loading from a local directory, _commit_hash may be None (no Hub resolution).",
        "# None is ACCEPTABLE — it proves no network resolution occurred.",
        "# 'main' is FATAL — it means the loader resolved to the mutable ref despite local_files_only=True.",
        "_loaded_revision = getattr(getattr(base_model, 'config', None), '_commit_hash', None)",
        "_tok_id = str(getattr(base_tok, 'name_or_path', ''))",
        "print(f'OBSERVED_DISTRIBUTION_ID={_tok_id}')",
        "print(f'OBSERVED_DISTRIBUTION_REVISION={_loaded_revision}')",
        "print(f'SNAPSHOT_DIR={SNAPSHOT_DIR}')",
        "print(f'ACTUAL_LOADER_INPUT={SNAPSHOT_DIR}')",
        "",
        "assert _loaded_revision != 'main', \\",
        "    'PREFLIGHT FAIL: resolved to mutable ref \"main\" — network resolution occurred despite local_files_only=True'",
        "",
        "print('PREFLIGHT3_DISTRIBUTION_REVISION_PASS')",
        "print('PREFLIGHT3_NO_MUTABLE_MAIN')",
        "",
        "# --- gradient check (no training) ---",
        "_grad_enabled = any(p.requires_grad for p in base_model.parameters())",
        "assert _grad_enabled is False, 'PREFLIGHT FAIL: gradients are enabled on BASE'",
        "",
        "# --- no inference, no generation ---",
        "# Structural: this notebook contains no model.generate() call, no prompts, no gold.",
        "print('PREFLIGHT3_TEST_ACCESS_NO')",
        "print('PREFLIGHT3_INFERENCE_NO')",
        "print('PREFLIGHT3_COMPLETE')",
      ]),
    },
  ];
}

/** Forbidden tokens for the preflight — no training, no inference, no evaluation. */
export const PREFLIGHT3_FORBIDDEN_TOKENS = Object.freeze([
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
        artifact: "gharibo-preflight-002",
        authorization_decision: "DEC-0042",
        decision: "LOCAL_SNAPSHOT_PREFLIGHT_AUTHORIZATION",
        attempt_5_authorized: false,
        maximum_kernel_pushes: 1,
        immutable_distribution_revision: IMMUTABLE_DISTRIBUTION_REVISION,
        distribution_repo: DISTRIBUTION_REPO,
        architecture: "LOCAL_IMMUTABLE_SNAPSHOT",
        primary_invariant: "THE LOADER RECEIVES A LOCAL DIRECTORY, NOT A REPO ID",
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

export { PREFLIGHT3_PINS, IMMUTABLE_DISTRIBUTION_REVISION, DISTRIBUTION_REPO };

function main() {
  const checkMode = process.argv.includes("--check");
  const out = resolve(ROOT, OUT_REL);
  const text = render();

  if (checkMode) {
    if (!existsSync(out)) {
      console.error(`build-dec0042-preflight --check: ${OUT_REL} does not exist`);
      process.exit(1);
    }
    if (readFileSync(out, "utf8") !== text) {
      console.error(`build-dec0042-preflight --check: ${OUT_REL} is stale — regenerate it`);
      process.exit(1);
    }
    console.log(`build-dec0042-preflight --check: ${OUT_REL} is current (sha256 ${notebookSha256().slice(0, 12)})`);
    process.exit(0);
  }

  writeFileSync(out, text, "utf8");
  console.log(`wrote ${OUT_REL}`);
  console.log(`  cells        : ${buildNotebook().cells.length}`);
  console.log(`  sha256       : ${notebookSha256()}`);
  console.log(`  authorization: DEC-0042 (LOCAL_SNAPSHOT_PREFLIGHT)`);
  console.log(`  attempt #5   : NOT AUTHORIZED`);
  console.log(`  immutable rev: ${IMMUTABLE_DISTRIBUTION_REVISION}`);
  console.log(`  dist repo    : ${DISTRIBUTION_REPO}`);
  console.log(`  architecture : LOCAL IMMUTABLE SNAPSHOT`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
