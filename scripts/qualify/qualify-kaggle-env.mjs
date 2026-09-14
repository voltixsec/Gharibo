#!/usr/bin/env node
/**
 * qualify-kaggle-env.mjs — renders the Milestone 3A free-Kaggle environment
 * qualification harness (`qualify-kaggle-env.ipynb`).
 *
 * WHY A GENERATOR (mirrors the M2 `notebook-render.ts` pattern)
 * -------------------------------------------------------------
 * The harness must probe exactly the dependency set the repo actually pins, so the
 * inventory is derived from `PINNED_ENGINE_DEPENDENCIES` / `UNSLOTH_ENGINE_VERSION`
 * in `apps/web/lib/training/package.ts` and injected into the notebook through the
 * sentinels `__GHARIBO_QUALIFY_INVENTORY_JSON__` / `__GHARIBO_ENGINE_VERSION__` — the
 * same template+sentinel convention as
 * `apps/web/lib/workers/kaggle/notebook.template.ipynb`. A committed hand-edited
 * notebook would silently drift from the pins; a rendered one cannot.
 *
 * DETERMINISM
 * -----------
 * The renderer normalises the .ipynb exactly like `notebook-render.ts`:
 *   - fixed cell order, stable `id`s, `execution_count: null`, `outputs: []`,
 *   - 1-space JSON indent, trailing newline,
 *   - the notebook embeds its own content address (`HARNESS_CONTENT_SHA256`),
 *     computed over the notebook with that value blanked — the same
 *     `package_id=""` trick used by `computePackageId` in `package.ts`.
 * Same inputs -> byte-identical notebook.
 *
 * CONTRACT
 * --------
 * The emitted artifact is `env-qualification.json`, shaped by
 * `docs/ENV_QUALIFICATION_CONTRACT.md` v1.0.0 (§3 top level, §4 dependency records,
 * §5 environment, §6 reproducibility, §7 unknowns, §8 status, §9 content address,
 * §10 validation). The harness self-validates against §10 before it finishes.
 *
 * HARD CONSTRAINTS baked into the emitted notebook (see scripts/qualify/README.md):
 *   - never fabricates a version or a SHA (unknown => null + an `unknowns[]` entry),
 *   - no model weight download, no training, no SFT/QLoRA execution,
 *   - never prints, logs or writes a secret (all output passes through `redact`),
 *   - T4 = Turing (sm_75): fp16 only, no bf16, no FlashAttention-2.
 *
 * Usage:
 *   node scripts/qualify/qualify-kaggle-env.mjs           # write the notebook
 *   node scripts/qualify/qualify-kaggle-env.mjs --check   # exit 1 if stale
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const p = (...parts) => path.join(ROOT, ...parts);

const PACKAGE_TS = p("apps", "web", "lib", "training", "package.ts");
const NOTEBOOK_PATH = p("scripts", "qualify", "qualify-kaggle-env.ipynb");

/** Sentinel replaced by the injected inventory JSON. */
export const INVENTORY_SENTINEL = "__GHARIBO_QUALIFY_INVENTORY_JSON__";
/** Sentinel replaced by `UNSLOTH_ENGINE_VERSION` from package.ts. */
export const ENGINE_VERSION_SENTINEL = "__GHARIBO_ENGINE_VERSION__";
/** Sentinel replaced by the notebook's own content address. */
export const HARNESS_SHA_SENTINEL = "__GHARIBO_HARNESS_SHA256__";

// ---------------------------------------------------------------------------
// 1. Read the repo's real pin list (never retyped by hand).
// ---------------------------------------------------------------------------

const PINNED_ENTRY_RE =
  /\{\s*name:\s*"([^"]+)",\s*source:\s*"(pip|git)",\s*spec:\s*"([^"]*)",\s*resolvedVersion:\s*(null|"[^"]*"),\s*url:\s*(null|"[^"]*"),?\s*\}/g;

/**
 * Parses `PINNED_ENGINE_DEPENDENCIES` out of package.ts. Fails loudly if it can't.
 *
 * Whole-line `//` comments are stripped first so a note inside an entry cannot break
 * the parse. Only line-leading comments are removed — a naive `//` strip would eat the
 * `//` in every `https://` URL.
 */
export function readPinnedEngineDependencies() {
  const source = fs.readFileSync(PACKAGE_TS, "utf8");
  const block = source.match(
    /export const PINNED_ENGINE_DEPENDENCIES: EngineDependency\[\] = \[([\s\S]*?)\n\];/,
  );
  if (!block) {
    throw new Error(`could not locate the PINNED_ENGINE_DEPENDENCIES array in ${PACKAGE_TS}`);
  }
  const stripped = block[1].replace(/^[ \t]*\/\/[^\n]*$/gm, "");
  const out = [];
  for (const m of stripped.matchAll(PINNED_ENTRY_RE)) {
    out.push({
      name: m[1],
      source: m[2],
      spec: m[3],
      resolvedVersion: m[4] === "null" ? null : m[4].slice(1, -1),
      url: m[5] === "null" ? null : m[5].slice(1, -1),
    });
  }
  if (out.length === 0) {
    throw new Error(`could not parse any entries from PINNED_ENGINE_DEPENDENCIES in ${PACKAGE_TS}`);
  }
  return out;
}

/** Parses `UNSLOTH_ENGINE_VERSION` out of package.ts. */
export function readEngineVersion() {
  const source = fs.readFileSync(PACKAGE_TS, "utf8");
  const m = source.match(/export const UNSLOTH_ENGINE_VERSION\s*=\s*"([^"]+)"/);
  if (!m) throw new Error(`could not parse UNSLOTH_ENGINE_VERSION from ${PACKAGE_TS}`);
  return m[1];
}

const PINNED = readPinnedEngineDependencies();
const ENGINE_VERSION = readEngineVersion();

// ---------------------------------------------------------------------------
// 2. Inventory: how each pinned dependency is actually installed + probed.
//    `install` is the exact argument handed to `uv pip install`.
// ---------------------------------------------------------------------------

/** Per-dependency install detail, keyed by the package.ts name. */
const PINNED_INSTALL_DETAIL = {
  torch: { install: "torch>=2.8.0", modules: ["torch"] },
  triton: { install: "triton>=3.4.0", modules: ["triton"] },
  unsloth_zoo: {
    install: "git+https://github.com/unslothai/unsloth-zoo",
    modules: ["unsloth_zoo"],
  },
  unsloth: {
    install: "git+https://github.com/unslothai/unsloth",
    modules: ["unsloth"],
  },
  transformers: {
    install: "git+https://github.com/huggingface/transformers",
    modules: ["transformers"],
  },
  triton_kernels: {
    // The commit is the repo's pin; the fragment is required because the package
    // lives in a subdirectory of the triton monorepo (contract §4.4 frozen shape).
    install:
      "git+https://github.com/triton-lang/triton.git@05b2c186c1b6c9a08375389d5efe9cb4c401c075" +
      "#subdirectory=python/triton_kernels",
    fragment: "#subdirectory=python/triton_kernels",
    noBuildIsolation: true,
    modules: ["triton_kernels"],
  },
  // Direct recipe dependencies promoted into PINNED_ENGINE_DEPENDENCIES
  // (contract §4.5 promotion criterion). The spec is the bare package name
  // because the resolved version is not known until a real Kaggle T4 run;
  // the harness resolves it and records the frozen form (name==version).
  peft: { install: "peft", modules: ["peft"] },
  trl: { install: "trl", modules: ["trl"] },
  datasets: { install: "datasets", modules: ["datasets"] },
  accelerate: { install: "accelerate", modules: ["accelerate"] },
  bitsandbytes: { install: "bitsandbytes", modules: ["bitsandbytes"] },
  "openai-harmony": { install: "openai-harmony", modules: ["openai_harmony"] },
};

/**
 * Recipe-required packages that are NOT pinned in package.ts.
 *
 * After the §4.5 promotion, all six direct recipe deps (peft, trl, datasets,
 * accelerate, bitsandbytes, openai-harmony) are in PINNED_ENGINE_DEPENDENCIES
 * and are no longer listed here. This array is now empty. It is retained
 * for the `additional_dependencies[]` contract extension, which remains
 * available for transitive or optional packages discovered at run time.
 */
const UNPINNED_QUALIFICATION_ENTRIES = [];

/**
 * The Harmony package is DETERMINED at run time rather than assumed: the harness
 * probes for the import first and only installs a candidate if nothing provides it.
 * The resolved distribution name is what gets recorded.
 */
const HARMONY_CANDIDATES = [
  { module: "openai_harmony", dist: "openai-harmony" },
  { module: "harmony", dist: "openai-harmony" },
];

const PINNED_INVENTORY = PINNED.map((dep) => {
  const detail = PINNED_INSTALL_DETAIL[dep.name];
  if (!detail) {
    throw new Error(
      `package.ts pins "${dep.name}" but scripts/qualify has no install detail for it — ` +
        "add it to PINNED_INSTALL_DETAIL so the harness probes the right thing.",
    );
  }
  return {
    name: dep.name,
    source: dep.source,
    requested_spec: dep.spec,
    url: dep.url,
    install: detail.install,
    fragment: detail.fragment ?? null,
    no_build_isolation: detail.noBuildIsolation === true,
    modules: detail.modules,
    pinned_in_package_ts: true,
  };
});

const EXTRA_INVENTORY = UNPINNED_QUALIFICATION_ENTRIES.map((e) => ({
  name: e.name,
  source: "pip",
  requested_spec: e.name,
  url: null,
  install: e.install,
  fragment: null,
  no_build_isolation: false,
  modules: e.modules,
  pinned_in_package_ts: false,
}));

const IMPORT_SMOKE_MODULES = [
  "torch",
  "triton",
  "transformers",
  "peft",
  "trl",
  "datasets",
  "accelerate",
  "bitsandbytes",
  "unsloth",
  "unsloth_zoo",
  "triton_kernels",
  "openai_harmony",
];

const INVENTORY_JSON = JSON.stringify(
  {
    pinned_dependencies: PINNED_INVENTORY,
    additional_dependencies: EXTRA_INVENTORY,
    harmony_candidates: HARMONY_CANDIDATES,
    import_smoke_modules: IMPORT_SMOKE_MODULES,
    contract_schema_version: "1.0.0",
    harness_version: "1.0.0",
    experiment_id: "GHARIBO-exp-001",
  },
  null,
  2,
);

// ---------------------------------------------------------------------------
// 3. Notebook cells.
// ---------------------------------------------------------------------------

const CELLS = [
  String.raw`# --- Section 1: Purpose + policy (Milestone 3A) ---
# This notebook QUALIFIES a free-Kaggle T4 environment for the GHARIBO training
# engine. It resolves and records the EXACT dependency set so the pins in
# apps/web/lib/training/package.ts can be frozen to reproducible versions.
#
# The emitted artifact is /kaggle/working/env-qualification.json, shaped by
# docs/ENV_QUALIFICATION_CONTRACT.md v1.0.0 (contract_schema_version 1.0.0).
#
# IT DOES NOT TRAIN. It never downloads model weights, never loads a model and
# never runs SFT/QLoRA. It only installs the stack and records what it resolved.
#
# HARD RULES enforced by this notebook:
#   - no version and no git SHA is ever guessed: unknown is recorded as null AND
#     enumerated in unknowns[] (contract §7); a null with no unknowns[] entry is
#     a contract violation, not a silent gap;
#   - no secret is ever printed, logged or written (every echo passes redact());
#   - free Kaggle tier only; T4 = Turing (sm_75) -> fp16, no bf16, no FlashAttention-2.
#
# Operator: read scripts/qualify/README.md before running.

print('=' * 78)
print('GHARIBO AI LAB - Milestone 3A free-Kaggle environment qualification')
print('=' * 78)
print('QUALIFICATION ONLY: no model weights, no training, no evaluation metrics.')
print('')`,

  String.raw`# --- Section 2: Config + helpers ---
import datetime, hashlib, json, os, platform, pathlib, re, shutil, subprocess, sys, tempfile

INVENTORY = json.loads(r'''
__GHARIBO_QUALIFY_INVENTORY_JSON__
''')

# Contract §4.3 rule 1: dependencies[] must be EXACTLY the PINNED_ENGINE_DEPENDENCIES
# names. Anything else the recipe needs is recorded in additional_dependencies[].
PINNED_DEPENDENCIES = INVENTORY['pinned_dependencies']
ADDITIONAL_DEPENDENCIES = INVENTORY['additional_dependencies']
HARMONY_CANDIDATES = INVENTORY['harmony_candidates']
IMPORT_SMOKE_MODULES = INVENTORY['import_smoke_modules']
ALL_DEPENDENCIES = PINNED_DEPENDENCIES + ADDITIONAL_DEPENDENCIES

CONTRACT_SCHEMA_VERSION = INVENTORY['contract_schema_version']
HARNESS_VERSION = INVENTORY['harness_version']
EXPERIMENT_ID = INVENTORY['experiment_id']
ENGINE = 'unsloth'
ENGINE_VERSION = '__GHARIBO_ENGINE_VERSION__'

# Content address of THIS notebook file, over its bytes with the hash blanked
# (same convention as computePackageId() in apps/web/lib/training/package.ts).
HARNESS_CONTENT_SHA256 = '__GHARIBO_HARNESS_SHA256__'
HARNESS_PATH = 'scripts/qualify/qualify-kaggle-env.ipynb'

# Switches. Both are documented in scripts/qualify/README.md.
RUN_IMPORT_SMOKE_TEST = True        # imports the stack; downloads NO weights
RUN_FRESH_ENV_REPRODUCTION = True   # pass 2 of the reproducibility assertion (contract §6)
FRESH_ENV_MAX_SECONDS = 2400

# Free-Kaggle T4 budget gate.
MIN_VRAM_BYTES = 14 * 1024 ** 3
MIN_COMPUTE_CAPABILITY = (7, 5)

# ---- Redaction: no secret may ever reach stdout, a log file or the artifact ----
_CREDENTIALS_IN_URL = re.compile(r'([a-zA-Z][a-zA-Z0-9+.\-]*://)[^/@\s]+@')
_SECRET_QUERY = re.compile(r'(?i)([?&](?:access_token|token|auth|api_key|apikey|password|private_token|key)=)[^&\s\'"]+')
_BEARER_LIKE = re.compile(r'\b(?:hf_|ghp_|github_pat_|sk-)[A-Za-z0-9_\-]{12,}\b')

def redact(value):
    '''Strips credentials from any string that may be echoed or persisted.'''
    if value is None:
        return None
    text = value if isinstance(value, str) else str(value)
    text = _CREDENTIALS_IN_URL.sub(lambda m: m.group(1) + '***@', text)
    text = _SECRET_QUERY.sub(lambda m: m.group(1) + '***', text)
    text = _BEARER_LIKE.sub('***', text)
    return text

def utc_now():
    stamp = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
    return stamp.isoformat().replace('+00:00', 'Z')

def canonical_json(value):
    '''Contract §2/§9 canonical form: sorted keys, no insignificant whitespace.
    Byte-identical to canonicalJson() in apps/web/lib/training/hash.ts.'''
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

def sha256_canonical(value):
    return hashlib.sha256(canonical_json(value).encode('utf-8')).hexdigest()

def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(65536), b''):
            digest.update(chunk)
    return digest.hexdigest()

def working_dir():
    candidate = pathlib.Path('/kaggle/working')
    return candidate if candidate.is_dir() else pathlib.Path.cwd()

WORKING = working_dir()
QUALIFICATION_PATH = WORKING / 'env-qualification.json'
REPORT_PATH = WORKING / 'env-qualification.md'
TS_SNIPPET_PATH = WORKING / 'PINNED_ENGINE_DEPENDENCIES.frozen.ts'
INSTALL_ARGS_PATH = WORKING / 'qualification-install-args.json'

def abort(message):
    print('=' * 78)
    print('QUALIFICATION ABORTED - refusing to continue')
    print('=' * 78)
    print(redact(message))
    raise SystemExit(1)

def write_canonical(path, payload):
    '''Contract §2: UTF-8, no BOM, sorted keys, no insignificant whitespace.'''
    with open(path, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(canonical_json(payload) + '\n')

# ---- Subprocess probes -------------------------------------------------------
# Everything that inspects the environment runs in a FRESH interpreter: torch may
# be replaced by the install, and an already-imported module would be stale.

PROBE_SOURCE = r'''
import json, os, platform, sys
out = {"python_version": platform.python_version(), "python_executable": sys.executable,
       "os_name": os.name, "system": platform.system(), "platform": platform.platform(),
       "torch_version": None, "cuda_version": None, "cudnn_version": None,
       "cuda_available": False, "gpu_count": 0, "gpu_model": None,
       "compute_capability": None, "compute_capability_tuple": None,
       "vram_bytes": None, "bf16_supported": None, "fp16_supported": None,
       "fp16_api_present": False, "error": None}
try:
    import torch
    out["torch_version"] = torch.__version__
    out["cuda_version"] = torch.version.cuda
    try:
        out["cudnn_version"] = torch.backends.cudnn.version() if torch.backends.cudnn.is_available() else None
    except Exception:
        out["cudnn_version"] = None
    out["cuda_available"] = bool(torch.cuda.is_available())
    if out["cuda_available"]:
        major, minor = torch.cuda.get_device_capability(0)
        out["gpu_count"] = int(torch.cuda.device_count())
        out["gpu_model"] = torch.cuda.get_device_name(0)
        out["compute_capability"] = "sm_%d%d" % (major, minor)
        out["compute_capability_tuple"] = [int(major), int(minor)]
        out["vram_bytes"] = int(torch.cuda.get_device_properties(0).total_memory)
        try:
            out["bf16_supported"] = bool(torch.cuda.is_bf16_supported())
        except Exception:
            out["bf16_supported"] = None
        # torch has no cuda.is_fp16_supported() in any released build; probe defensively
        # and let the caller decide how to report the absence (contract 5 names it).
        fp16_probe = getattr(torch.cuda, "is_fp16_supported", None)
        out["fp16_api_present"] = callable(fp16_probe)
        if callable(fp16_probe):
            try:
                out["fp16_supported"] = bool(fp16_probe())
            except Exception:
                out["fp16_supported"] = None
except Exception as exc:
    out["error"] = "%s: %s" % (type(exc).__name__, exc)
print("__GHARIBO_PROBE_JSON__" + json.dumps(out))
'''

RESOLVE_SOURCE = r'''
import json, sys
from importlib import metadata as md

targets = json.loads(sys.argv[1])
try:
    module_to_dists = md.packages_distributions()
except Exception:
    module_to_dists = {}

def norm(name):
    return name.replace("_", "-").replace(".", "-").lower()

by_norm = {}
for dist in md.distributions():
    try:
        name = dist.metadata["Name"]
    except Exception:
        name = None
    if name:
        by_norm[norm(name)] = dist

results = {}
for target in targets:
    record = {"dist_name": None, "version": None, "commit_sha": None, "direct_url": None,
              "requested_revision": None, "vcs": None, "archive_hash": None, "found": False}
    dist = by_norm.get(norm(target["name"]))
    if dist is None:
        for module in target.get("modules", []):
            for candidate in module_to_dists.get(module, []):
                if norm(candidate) in by_norm:
                    dist = by_norm[norm(candidate)]
                    break
            if dist is not None:
                break
    if dist is not None:
        record["found"] = True
        try:
            record["dist_name"] = dist.metadata["Name"]
        except Exception:
            record["dist_name"] = target["name"]
        try:
            record["version"] = dist.version
        except Exception:
            record["version"] = None
        raw = None
        try:
            raw = dist.read_text("direct_url.json")
        except Exception:
            raw = None
        if raw:
            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = None
            if isinstance(parsed, dict):
                record["direct_url"] = parsed.get("url")
                vcs = parsed.get("vcs_info")
                if isinstance(vcs, dict):
                    record["vcs"] = vcs.get("vcs")
                    record["commit_sha"] = vcs.get("commit_id")
                    record["requested_revision"] = vcs.get("requested_revision")
                archive = parsed.get("archive_info")
                if isinstance(archive, dict):
                    hashes = archive.get("hashes")
                    if isinstance(hashes, dict) and hashes.get("sha256"):
                        record["archive_hash"] = hashes["sha256"]
                    elif isinstance(archive.get("hash"), str) and archive["hash"].startswith("sha256="):
                        record["archive_hash"] = archive["hash"].split("=", 1)[1]
    results[target["name"]] = record

print("__GHARIBO_RESOLVE_JSON__" + json.dumps(results))
'''

MODULE_PROBE_SOURCE = r'''
import importlib.util, json, sys
out = {}
for module in json.loads(sys.argv[1]):
    try:
        out[module] = importlib.util.find_spec(module) is not None
    except Exception:
        out[module] = False
print("__GHARIBO_MODULE_JSON__" + json.dumps(out))
'''

IMPORT_SMOKE_SOURCE = r'''
import importlib, json, sys, time
out = {}
for module in json.loads(sys.argv[1]):
    started = time.time()
    try:
        importlib.import_module(module)
        out[module] = {"ok": True, "error": None, "seconds": round(time.time() - started, 2)}
    except BaseException as exc:
        out[module] = {"ok": False, "error": "%s: %s" % (type(exc).__name__, exc),
                       "seconds": round(time.time() - started, 2)}
print("__GHARIBO_IMPORT_JSON__" + json.dumps(out))
'''

def _run_probe(python_executable, source, payload, marker, timeout=None):
    proc = subprocess.run([python_executable, '-c', source, json.dumps(payload)],
                          capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError('probe exited %d:\n%s' % (proc.returncode, redact((proc.stderr or '')[-2000:])))
    for line in proc.stdout.splitlines():
        if line.startswith(marker):
            return json.loads(line[len(marker):])
    raise RuntimeError('probe produced no %s line' % marker)

def probe_environment(python_executable):
    return _run_probe(python_executable, PROBE_SOURCE, [], '__GHARIBO_PROBE_JSON__')

def resolve_versions(python_executable, targets, timeout=None):
    return _run_probe(python_executable, RESOLVE_SOURCE, targets, '__GHARIBO_RESOLVE_JSON__', timeout)

def probe_modules(python_executable, modules):
    return _run_probe(python_executable, MODULE_PROBE_SOURCE, modules, '__GHARIBO_MODULE_JSON__')

def run_command(cmd, timeout=None):
    print('$', ' '.join(redact(part) for part in cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        tail = (proc.stdout or '')[-3000:] + (proc.stderr or '')[-3000:]
        raise RuntimeError('command failed with exit code %d:\n%s\n--- output (redacted) ---\n%s'
                           % (proc.returncode, ' '.join(redact(part) for part in cmd), redact(tail)))
    return proc

def first_version_token(text):
    '''Extracts just the version from e.g. "pip 24.1 from /opt/conda/... (python 3.11)".
    Contract 10 rule 13 forbids filesystem paths anywhere in the artifact.'''
    match = re.search(r'(\d+[0-9A-Za-z.\-+]*)', text or '')
    return match.group(1) if match else None

def nvidia_driver_version():
    try:
        proc = subprocess.run(['nvidia-smi', '--query-gpu=driver_version', '--format=csv,noheader'],
                              capture_output=True, text=True, timeout=60)
        if proc.returncode == 0:
            lines = [ln.strip() for ln in (proc.stdout or '').splitlines() if ln.strip()]
            if lines:
                return lines[0]
    except Exception:
        return None
    return None

print('contract        : env-qualification.json @ schema', CONTRACT_SCHEMA_VERSION)
print('harness         : v%s (content address %s)' % (HARNESS_VERSION, HARNESS_CONTENT_SHA256 or 'unset'))
print('experiment_id   :', EXPERIMENT_ID)
print('engine          :', ENGINE, ENGINE_VERSION)
print('pinned deps     :', ', '.join(d['name'] for d in PINNED_DEPENDENCIES))
print('additional deps :', ', '.join(d['name'] for d in ADDITIONAL_DEPENDENCIES))
print('output          :', QUALIFICATION_PATH)`,

  String.raw`# --- Section 3: Hardware detect + budget gate (BEFORE anything expensive) ---
def print_hardware(hw, label):
    print('--- %s ---' % label)
    print('python          :', hw['python_version'])
    print('interpreter     :', hw['python_executable'])
    print('platform        :', hw['platform'])
    print('torch           :', hw['torch_version'])
    print('cuda (torch)    :', hw['cuda_version'])
    print('cudnn           :', hw['cudnn_version'])
    print('gpu available   :', hw['cuda_available'])
    print('gpu count       :', hw['gpu_count'])
    print('gpu model       :', hw['gpu_model'])
    print('compute cap     :', hw['compute_capability'])
    print('vram bytes      :', hw['vram_bytes'])
    print('bf16 (reported) :', hw['bf16_supported'])
    if hw['error']:
        print('torch probe err :', redact(hw['error']))

def recipe_dtype(compute_capability):
    # T4 is Turing/sm_75: no native bf16 tensor-core path -> the recipe pins fp16.
    if compute_capability is None or compute_capability[0] < 8:
        return 'fp16'
    return 'bf16'

def enforce_gate(hw, phase):
    problems = []
    if not hw['cuda_available']:
        problems.append('no CUDA GPU visible - set Notebook Settings -> Accelerator -> GPU T4 x2 '
                        'and re-run from the top')
    capability = hw['compute_capability_tuple']
    if capability is None:
        problems.append('compute capability could not be read')
    elif tuple(capability) < MIN_COMPUTE_CAPABILITY:
        problems.append('compute capability %s < sm_75 - gpt-oss-20b 4-bit QLoRA is not '
                        'supported on this GPU' % hw['compute_capability'])
    vram = hw['vram_bytes']
    if vram is None or vram < MIN_VRAM_BYTES:
        problems.append('VRAM %s bytes < %d bytes required for gpt-oss-20b 4-bit QLoRA'
                        % (vram, MIN_VRAM_BYTES))
    if problems:
        abort('%s hardware gate failed:\n  - %s' % (phase, '\n  - '.join(problems)))
    dtype = recipe_dtype(capability)
    print('%s gate PASSED - recipe dtype = %s' % (phase, dtype))
    if capability is not None and capability[0] < 8 and hw['bf16_supported']:
        print('NOTE: torch.cuda.is_bf16_supported() reports True on %s. That flag is unreliable'
              % hw['compute_capability'])
        print('      below sm_80; the recipe stays on fp16 because Turing has no native bf16 path.')
    return dtype

hardware_before = probe_environment(sys.executable)
print_hardware(hardware_before, 'Hardware BEFORE install')
enforce_gate(hardware_before, 'pre-install')`,

  String.raw`# --- Section 4: Install the training stack via uv (reproducibility pass 1) ---
# A plain "pip install unsloth" does NOT work (known trap: the resolver picks a
# wheel set that breaks the gpt-oss path). uv is used instead, exactly as the M2
# notebook does.
PASS_1_STARTED_AT = utc_now()

def uv_executable():
    found = shutil.which('uv')
    if found:
        return found
    beside = os.path.join(os.path.dirname(sys.executable), 'uv')
    if os.path.exists(beside):
        return beside
    abort('uv was installed but is not on PATH - cannot continue.')

def uv_target_flags():
    # Kaggle has no active venv, so uv needs --system to touch the system
    # interpreter; if a venv IS active we must not bypass it.
    if os.environ.get('VIRTUAL_ENV'):
        return ['--python', sys.executable]
    return ['--system', '--python', sys.executable]

print('Bootstrapping uv...')
run_command([sys.executable, '-m', 'pip', 'install', '--upgrade', '-qqq', 'uv'])
UV = uv_executable()
print('uv:', UV)
TARGET_FLAGS = uv_target_flags()

# Turing-only build target: keeps any source build (triton_kernels) from emitting
# sm_80+ kernels the T4 cannot load.
os.environ['TORCH_CUDA_ARCH_LIST'] = '7.5'
os.environ.setdefault('CMAKE_CUDA_ARCHITECTURES', '75')

main_args = [d['install'] for d in ALL_DEPENDENCIES if not d['no_build_isolation']]
print('Installing %d specs in one resolved transaction:' % len(main_args))
for spec in main_args:
    print('  ', redact(spec))
run_command([UV, 'pip', 'install', *TARGET_FLAGS, '--no-cache-dir', '-qqq', *main_args])

# triton_kernels builds against the torch/triton already present -> no build isolation.
for dep in ALL_DEPENDENCIES:
    if not dep['no_build_isolation']:
        continue
    print('Installing (no build isolation):', redact(dep['install']))
    run_command([UV, 'pip', 'install', *TARGET_FLAGS, '--no-cache-dir', '-qqq',
                 '--no-build-isolation', dep['install']])

freeze_listing = run_command([UV, 'pip', 'freeze', '--python', sys.executable]).stdout
print('--- uv pip freeze (redacted) ---')
print(redact(freeze_listing))
print('install complete')`,

  String.raw`# --- Section 5: Environment AFTER install (contract 5) ---
# Re-probed in a fresh interpreter: the install may have replaced torch.
hardware_after = probe_environment(sys.executable)
print_hardware(hardware_after, 'Environment AFTER install (authoritative)')
recipe_dtype_after = enforce_gate(hardware_after, 'post-install')

capability = hardware_after['compute_capability_tuple']
flash_attention_2_supported = bool(capability is not None and capability[0] >= 8)
if recipe_dtype_after != 'fp16':
    abort('recipe dtype resolved to %s, but the frozen recipe targets a T4 (fp16). '
          'This notebook must be run on the free-T4 accelerator.' % recipe_dtype_after)
print('flash-attention-2 supported:', flash_attention_2_supported,
      '(T4 = False; the recipe must not request flash_attention_2)')
print('selected dtype:', recipe_dtype_after)

try:
    uv_version = first_version_token(run_command([UV, '--version']).stdout)
except Exception as exc:
    print('WARNING: could not read the uv version:', redact(str(exc)))
    uv_version = None
try:
    pip_version = first_version_token(run_command([sys.executable, '-m', 'pip', '--version']).stdout)
except Exception as exc:
    print('WARNING: could not read the pip version:', redact(str(exc)))
    pip_version = None
driver_version = nvidia_driver_version()

# Contract 5 names torch.cuda.is_fp16_supported() as the source of truth, but no
# released torch exposes it. If it is absent the value is DERIVED from the driver's
# compute capability (fp16 tensor cores need sm_70+) and the derivation is disclosed
# in warnings[] - it is never silently invented.
fp16_supported = hardware_after['fp16_supported']
fp16_derived = False
if fp16_supported is None and capability is not None:
    fp16_supported = bool(tuple(capability) >= (7, 0))
    fp16_derived = True

environment = {
    'python_version': hardware_after['python_version'],
    'cuda_version': hardware_after['cuda_version'],
    'gpu_model': hardware_after['gpu_model'],
    'compute_capability': hardware_after['compute_capability'],
    'vram_bytes': hardware_after['vram_bytes'],
    'os': hardware_after['system'],
    'platform': hardware_after['platform'],
    'torch_version': hardware_after['torch_version'],
    'driver_version': driver_version,
    'uv_version': uv_version,
    'pip_version': pip_version,
    'fp16_supported': fp16_supported,
    'bf16_supported': hardware_after['bf16_supported'],
}
print('')
print('environment block (contract 5):')
for key in sorted(environment):
    print('  %-18s %s' % (key, environment[key]))`,

  String.raw`# --- Section 6: Import smoke test (NO weights are downloaded) ---
# Importing the stack is not training and does not fetch model weights. It is the
# cheapest way to prove the resolved set is actually loadable on this hardware.
import_smoke = {}
if RUN_IMPORT_SMOKE_TEST:
    import_smoke = _run_probe(sys.executable, IMPORT_SMOKE_SOURCE, IMPORT_SMOKE_MODULES,
                              '__GHARIBO_IMPORT_JSON__')
    for module in IMPORT_SMOKE_MODULES:
        result = import_smoke.get(module, {})
        status = 'ok' if result.get('ok') else 'FAILED'
        detail = '' if result.get('ok') else ' <- %s' % redact(result.get('error'))
        print('%-18s %-7s %ss%s' % (module, status, result.get('seconds'), detail))
else:
    print('import smoke test disabled (RUN_IMPORT_SMOKE_TEST = False)')

def import_name_for(dep):
    '''The module actually imported for this dependency, or None if not proven.'''
    if not RUN_IMPORT_SMOKE_TEST:
        return None
    for module in dep['modules']:
        if import_smoke.get(module, {}).get('ok'):
            return module
    return None`,

  String.raw`# --- Section 7: Resolve dependencies -> contract 4 records ---
# PEP 610 (direct_url.json) is the authoritative source for a git install's commit;
# importlib.metadata.version() gives the installed version for everything.
def frozen_spec_for(dep, raw):
    '''Contract 4.0: the pin that SHIPS. pip -> name==version;
    git -> git+<url>@<40-hex>[#subdirectory=<path>].
    Returns None when the dependency could not be frozen, in which case the caller
    falls back to the verbatim requested_spec (4.0 fallback, enforced by rule 17).'''
    if dep['source'] == 'pip':
        version = raw.get('version')
        return '%s==%s' % (dep['name'], version) if version else None
    commit = raw.get('commit_sha')
    if not commit:
        return None
    return 'git+%s@%s%s' % (dep['url'] or '', commit, dep['fragment'] or '')

def build_dependency_records(dep_specs, resolution, mark_unpinned=False):
    records = []
    for dep in dep_specs:
        raw = resolution.get(dep['name'], {})
        frozen = frozen_spec_for(dep, raw)
        record = {
            'name': dep['name'],
            'source': dep['source'],
            # 4.0: frozen form when available, otherwise the verbatim request.
            'spec': frozen if frozen else dep['requested_spec'],
            # 4.1: exact installed version (pip) or the resolved commit SHA (git).
            'resolved_version': (raw.get('commit_sha') or None) if dep['source'] == 'git'
                                else (raw.get('version') or None),
            'url': dep['url'],
            # 4.1 required audit key: the verbatim origin, never normalized.
            'requested_spec': dep['requested_spec'],
            'installer': 'uv',
        }
        if dep['source'] == 'git':
            # 4.1: present on every git record, even when null.
            record['resolved_commit'] = raw.get('commit_sha') or None
            if raw.get('requested_revision'):
                record['resolved_ref'] = raw['requested_revision']
            if raw.get('version'):
                # Extra capture (3.1): the git package's own distribution version.
                record['distribution_version'] = raw['version']
        direct_url = redact(raw.get('direct_url'))
        if direct_url and not direct_url.startswith('file:'):
            record['resolved_url'] = direct_url
        if raw.get('archive_hash'):
            record['wheel_sha256'] = raw['archive_hash']
        import_name = import_name_for(dep)
        if import_name:
            record['import_name'] = import_name
        if mark_unpinned:
            # 4.5: discriminator for the non-pinned block.
            record['pinned_in_package_ts'] = False
        records.append(record)
    # 4.3 rule 5: records are sorted by name before hashing.
    return sorted(records, key=lambda item: item['name'])

pinned_targets = [{'name': d['name'], 'modules': d['modules']} for d in PINNED_DEPENDENCIES]
extra_targets = [{'name': d['name'], 'modules': d['modules']} for d in ADDITIONAL_DEPENDENCIES]

pinned_resolution = resolve_versions(sys.executable, pinned_targets)
extra_resolution = resolve_versions(sys.executable, extra_targets)

dependencies = build_dependency_records(PINNED_DEPENDENCIES, pinned_resolution)
additional_dependencies = build_dependency_records(ADDITIONAL_DEPENDENCIES, extra_resolution,
                                                   mark_unpinned=True)
PASS_1_FINISHED_AT = utc_now()

def print_records(records, title):
    print('--- %s ---' % title)
    print('%-18s %-5s %-24s %-42s %s' % ('NAME', 'SRC', 'RESOLVED_VERSION', 'RESOLVED_COMMIT', 'SPEC'))
    for record in records:
        print('%-18s %-5s %-24s %-42s %s'
              % (record['name'], record['source'],
                 record['resolved_version'] or '<UNRESOLVED>',
                 record.get('resolved_commit') or '-',
                 redact(record['spec'])))

print_records(dependencies, 'dependencies[] (contract 4.3 rule 1: exactly PINNED_ENGINE_DEPENDENCIES)')
print_records(additional_dependencies, 'additional_dependencies[] (contract 4.5: recipe-required, not pinned)')

PASS_1_DEPENDENCY_SET_HASH = sha256_canonical(dependencies)
print('')
print('pass 1 dependency_set_hash:', PASS_1_DEPENDENCY_SET_HASH)`,

  String.raw`# --- Section 8: Determine the Harmony package ---
# gpt-oss uses the Harmony format, but the harness does not assume the distribution
# name: it probes the imports first and only installs a candidate if nothing provides
# one. Whatever actually resolves is what gets recorded.
harmony_probe = probe_modules(sys.executable, [c['module'] for c in HARMONY_CANDIDATES])
print('harmony import probe:', harmony_probe)

harmony_dist = None
for candidate in HARMONY_CANDIDATES:
    if harmony_probe.get(candidate['module']):
        harmony_dist = candidate['dist']
        print('Harmony already present via module %s' % candidate['module'])
        break

if harmony_dist is None:
    harmony_dist = HARMONY_CANDIDATES[0]['dist']
    print('No Harmony module found; installing candidate %s' % harmony_dist)
    try:
        run_command([UV, 'pip', 'install', *TARGET_FLAGS, '--no-cache-dir', '-qqq', harmony_dist])
    except Exception as exc:
        print('WARNING: could not install %s: %s' % (harmony_dist, redact(str(exc))))
    harmony_probe = probe_modules(sys.executable, [c['module'] for c in HARMONY_CANDIDATES])

harmony_modules = [c['module'] for c in HARMONY_CANDIDATES if harmony_probe.get(c['module'])]
HARMONY_SPEC = {
    'name': harmony_dist,
    'source': 'pip',
    'requested_spec': harmony_dist,
    'url': None,
    'install': harmony_dist,
    'fragment': None,
    'no_build_isolation': False,
    'modules': harmony_modules or [HARMONY_CANDIDATES[0]['module']],
    'pinned_in_package_ts': False,
}

harmony_resolution = resolve_versions(sys.executable, [{'name': harmony_dist, 'modules': harmony_modules}])
harmony_records = build_dependency_records([HARMONY_SPEC], harmony_resolution, mark_unpinned=True)
additional_dependencies = sorted(additional_dependencies + harmony_records,
                                 key=lambda item: item['name'])
print_records(harmony_records, 'harmony dependency (contract 4.5)')

# Everything that must exist in the pass-2 environment.
REPRODUCIBILITY_SPECS = PINNED_DEPENDENCIES + ADDITIONAL_DEPENDENCIES + [HARMONY_SPEC]`,

  String.raw`# --- Section 9: Reproducibility assertion - pass 2 (contract 6) ---
# A pin is only a pin if a second, fresh environment resolves the same set.
# pass 1 = the primary install above; pass 2 = a throwaway venv with no cache.
def fresh_env_base_dir():
    for candidate in ('/kaggle/temp', tempfile.gettempdir()):
        if candidate and os.path.isdir(candidate):
            return pathlib.Path(candidate)
    return pathlib.Path.cwd()

def venv_python(venv_dir):
    for relative in (('Scripts', 'python.exe'), ('bin', 'python')):
        candidate = venv_dir.joinpath(*relative)
        if candidate.exists():
            return str(candidate)
    return None

def compare_records(left, right, label, mismatches):
    '''Contract 6.3: name sets equal; frozen spec string-equal; resolved_version
    string-equal (including both-null); resolved_commit string-equal for source git.'''
    left_by_name = {item['name']: item for item in left}
    right_by_name = {item['name']: item for item in right}
    for name in sorted(set(left_by_name) | set(right_by_name)):
        a = left_by_name.get(name)
        b = right_by_name.get(name)
        if a is None or b is None:
            mismatches.append('%s: %s present in only one pass' % (label, name))
            continue
        if a.get('spec') != b.get('spec'):
            mismatches.append('%s: %s frozen spec %s != pass-2 %s'
                              % (label, name, a.get('spec'), b.get('spec')))
        if a.get('resolved_version') != b.get('resolved_version'):
            mismatches.append('%s: %s resolved_version frozen %s != pass-2 %s'
                              % (label, name, a.get('resolved_version'), b.get('resolved_version')))
        if a['source'] == 'git' and a.get('resolved_commit') != b.get('resolved_commit'):
            mismatches.append('%s: %s resolved_commit frozen %s != pass-2 %s'
                              % (label, name, a.get('resolved_commit'), b.get('resolved_commit')))

install_args = [d['install'] for d in ALL_DEPENDENCIES] + [HARMONY_SPEC['install']]
write_canonical(INSTALL_ARGS_PATH, {
    'install_args': install_args,
    'no_build_isolation': [d['install'] for d in ALL_DEPENDENCIES if d['no_build_isolation']],
    'installer': 'uv',
})

reproducibility = {
    'assertion': 'NOT_RUN',
    'passes': [
        {'pass_index': 1, 'started_at': PASS_1_STARTED_AT, 'finished_at': PASS_1_FINISHED_AT,
         'dependency_set_hash': PASS_1_DEPENDENCY_SET_HASH,
         'base_python': hardware_after['python_version']},
    ],
    'comparison': 'exact-string-equality-per-name',
    'dependency_set_hash': PASS_1_DEPENDENCY_SET_HASH,
}

if not RUN_FRESH_ENV_REPRODUCTION:
    print('fresh-environment reproduction disabled (RUN_FRESH_ENV_REPRODUCTION = False)')
    print('contract 8: a single pass can only ever be PARTIAL')
else:
    PASS_2_STARTED_AT = utc_now()
    venv_dir = fresh_env_base_dir() / 'gharibo-qualify-venv'
    shutil.rmtree(venv_dir, ignore_errors=True)
    try:
        print('Creating a throwaway venv at', venv_dir)
        run_command([UV, 'venv', '--python', sys.executable, str(venv_dir)])
        fresh_python = venv_python(venv_dir)
        if fresh_python is None:
            raise RuntimeError('could not locate the python executable inside the fresh venv')

        main_fresh = [d['install'] for d in ALL_DEPENDENCIES if not d['no_build_isolation']]
        main_fresh.append(HARMONY_SPEC['install'])
        run_command([UV, 'pip', 'install', '--python', fresh_python, '--no-cache-dir', '-qqq',
                     *main_fresh], timeout=FRESH_ENV_MAX_SECONDS)
        for dep in ALL_DEPENDENCIES:
            if not dep['no_build_isolation']:
                continue
            run_command([UV, 'pip', 'install', '--python', fresh_python, '--no-cache-dir', '-qqq',
                         '--no-build-isolation', dep['install']], timeout=FRESH_ENV_MAX_SECONDS)

        fresh_targets = [{'name': d['name'], 'modules': d['modules']} for d in REPRODUCIBILITY_SPECS]
        fresh_resolution = resolve_versions(fresh_python, fresh_targets, timeout=FRESH_ENV_MAX_SECONDS)
        fresh_pinned = build_dependency_records(PINNED_DEPENDENCIES, fresh_resolution)
        fresh_additional = build_dependency_records(ADDITIONAL_DEPENDENCIES + [HARMONY_SPEC],
                                                    fresh_resolution, mark_unpinned=True)

        mismatches = []
        compare_records(dependencies, fresh_pinned, 'dependencies', mismatches)
        compare_records(additional_dependencies, fresh_additional, 'additional_dependencies', mismatches)

        reproducibility['passes'].append({
            'pass_index': 2,
            'started_at': PASS_2_STARTED_AT,
            'finished_at': utc_now(),
            'dependency_set_hash': sha256_canonical(fresh_pinned),
            'base_python': fresh_resolution.get('__base_python__', hardware_after['python_version']),
        })
        reproducibility['assertion'] = 'IDENTICAL' if not mismatches else 'MISMATCH'
        if mismatches:
            reproducibility['mismatches'] = mismatches
        print('reproducibility assertion:', reproducibility['assertion'])
        for item in mismatches:
            print('  MISMATCH', item)
    except Exception as exc:
        reproducibility['assertion'] = 'NOT_RUN'
        reproducibility['error'] = redact(str(exc))
        print('pass 2 did not complete:', redact(str(exc)))
        print('contract 6.4: NOT_RUN can only ever be PARTIAL')
    finally:
        shutil.rmtree(venv_dir, ignore_errors=True)`,

  String.raw`# --- Section 10: Assemble, self-validate and write env-qualification.json ---
RANGE_SPEC = re.compile(r'(>=|<=|~=|!=|>|<)')

def spec_is_range(spec):
    '''True when a spec floats. Contract 4.3 rule 6: this is evaluated on
    requested_spec (the request), never on the frozen spec, which is exact by
    construction.'''
    if not spec:
        return False
    if '==' in spec:
        return False
    if spec.startswith('@'):
        # A bare git ref is a moving target unless it is a full commit SHA.
        # The trailing #subdirectory= fragment is not part of the ref.
        ref = spec[1:].split('#', 1)[0]
        return not re.fullmatch(r'[0-9a-f]{40}', ref)
    return bool(RANGE_SPEC.search(spec)) or ('==' not in spec)

def build_warnings(record):
    warnings = []
    for dep in record['dependencies'] + record.get('additional_dependencies', []):
        # 4.3 rule 6: the request is what floats; the frozen spec is exact.
        if spec_is_range(dep['requested_spec']):
            warnings.append('spec is a range, not an exact pin: %s' % dep['requested_spec'])
    if record.get('additional_dependencies'):
        # 4.5 / rule 18: this entry is mandatory whenever the block is non-empty.
        warnings.append(
            '%d recipe-required package(s) are not in PINNED_ENGINE_DEPENDENCIES and are recorded '
            'under additional_dependencies[], not dependencies[] (contract 4.3 rule 1, 4.5): %s'
            % (len(record['additional_dependencies']),
               ', '.join(d['name'] for d in record['additional_dependencies'])))
    if fp16_derived:
        # 5: a derived fp16_supported must never be silent.
        warnings.append(
            'environment.fp16_supported was DERIVED from compute capability: no released torch '
            'exposes torch.cuda.is_fp16_supported(), which contract 5 names as the source of truth '
            '(contract 5 explicitly permits the derivation provided it is disclosed)')
    if record.get('git_commit_sha') == 'unknown':
        warnings.append(
            'git_commit_sha is the literal "unknown": the harness runs outside the repository '
            '(contract 3 permits this literal). Not enumerated in unknowns[] because contract 7.1 '
            'treats it as an admissible value rather than a null, and contract 11.4 requires a '
            'successful run to end with an empty unknowns[].')
    if record.get('package_id') is None:
        warnings.append(
            'package_id is null: qualification runs before package issuance (contract 3 documents '
            'this state). Not enumerated in unknowns[] for the same reason as git_commit_sha.')
    return sorted(warnings)

ENVIRONMENT_NULL_REASONS = {
    'cuda_version': 'torch.version.cuda is unavailable (no CUDA-enabled torch build)',
    'gpu_model': 'no CUDA GPU was visible',
    'compute_capability': 'no CUDA GPU was visible',
    'vram_bytes': 'no CUDA GPU was visible',
    'driver_version': 'nvidia-smi did not report a driver version',
    'uv_version': 'uv --version could not be read',
    'pip_version': 'pip --version could not be read',
    'fp16_supported': 'neither torch.cuda.is_fp16_supported() nor a compute capability was available',
    'bf16_supported': 'torch.cuda.is_bf16_supported() raised or is absent',
}

def collect_unknowns(record):
    '''Contract 7.2: every unresolved value is enumerated so a reader never has to
    diff the file. A null without a matching entry is a contract violation.

    Two fields are deliberately NOT enumerated, and both are disclosed in warnings[]
    instead (see README "Contract ambiguities"):

      - git_commit_sha: contract 7.1 gives the literal "unknown" its own admissible
        representation (it is not a "null in a nullable field"), and contract 3
        permits it explicitly.
      - package_id: contract 3 documents null as the legitimate pre-issuance state
        ("null when qualification runs before package issuance").

    Contract 11.4 requires a successful run to end with an EMPTY unknowns[], so
    neither can be a blocker for status = QUALIFIED.
    '''
    unknowns = []
    def note(field, reason):
        unknowns.append({'field': field, 'reason': reason})

    for key, container in (('dependencies', record['dependencies']),
                           ('additional_dependencies', record.get('additional_dependencies', []))):
        for dep in container:
            path = '%s[%s]' % (key, dep['name'])
            if dep.get('resolved_version') is None:
                note(path + '.resolved_version',
                     'the installer resolved no version for this package')
            if dep['source'] == 'git' and dep.get('resolved_commit') is None:
                note(path + '.resolved_commit',
                     'no PEP 610 vcs_info.commit_id was recorded for the git install')
    for key in sorted(record['environment']):
        if record['environment'][key] is None:
            note('environment.' + key,
                 ENVIRONMENT_NULL_REASONS.get(key, 'not reported by this environment'))
    return unknowns

def derive_status(assertion, unknowns, records):
    '''Contract 8.'''
    git_unresolved = any(d['source'] == 'git' and not d.get('resolved_commit') for d in records)
    install_failed = any(d.get('resolved_version') is None for d in records)
    if assertion == 'MISMATCH' or install_failed:
        return 'FAILED'
    if assertion == 'IDENTICAL' and not unknowns and not git_unresolved:
        return 'QUALIFIED'
    return 'PARTIAL'

record = {
    'contract_schema_version': CONTRACT_SCHEMA_VERSION,
    'harness_version': HARNESS_VERSION,
    'experiment_id': EXPERIMENT_ID,
    'git_commit_sha': 'unknown',
    'package_id': None,
    'engine': {'engine': ENGINE, 'engine_version': ENGINE_VERSION},
    'captured_at': utc_now(),
    'status': 'PARTIAL',
    'dependencies': dependencies,
    'additional_dependencies': additional_dependencies,
    'environment': environment,
    'reproducibility': reproducibility,
    'unknowns': [],
    'warnings': [],
    'harness': {'path': HARNESS_PATH, 'content_sha256': HARNESS_CONTENT_SHA256 or None},
    'qualification_hash': '',
}

record['unknowns'] = collect_unknowns(record)
record['warnings'] = build_warnings(record)
record['status'] = derive_status(reproducibility['assertion'], record['unknowns'], record['dependencies'])
record['qualification_hash'] = sha256_canonical(dict(record, qualification_hash=''))

def validate_qualification(candidate, pinned_names):
    '''Contract 10. Returns a list of {level, field, message}; any ERROR blocks the
    freeze. This runs inside the harness so a malformed artifact never leaves Kaggle.'''
    issues = []
    def error(field, message):
        issues.append({'level': 'ERROR', 'field': field, 'message': message})
    def warn(field, message):
        issues.append({'level': 'WARNING', 'field': field, 'message': message})

    # 1
    version = str(candidate.get('contract_schema_version', ''))
    if version.split('.')[0] != CONTRACT_SCHEMA_VERSION.split('.')[0]:
        error('contract_schema_version', 'unsupported major: %s' % version)
    # 2
    for field in ('contract_schema_version', 'harness_version', 'experiment_id', 'git_commit_sha',
                  'engine', 'captured_at', 'status', 'reproducibility', 'qualification_hash'):
        if candidate.get(field) in (None, '', {}, []):
            error(field, 'required top-level field is missing or empty')
    if candidate.get('status') not in ('QUALIFIED', 'PARTIAL', 'FAILED'):
        error('status', 'not one of QUALIFIED | PARTIAL | FAILED')
    # 3
    if not candidate.get('dependencies'):
        error('dependencies', 'dependencies[] is empty')
    # 4
    names = [d['name'] for d in candidate.get('dependencies', [])]
    if sorted(names) != sorted(pinned_names):
        error('dependencies', 'name set %s != PINNED_ENGINE_DEPENDENCIES %s'
              % (sorted(names), sorted(pinned_names)))
    # 5, 6, 7
    for dep in candidate.get('dependencies', []) + candidate.get('additional_dependencies', []):
        path = 'dependencies[%s]' % dep['name']
        if dep.get('source') not in ('pip', 'git'):
            error(path + '.source', 'source must be pip | git')
        if not dep.get('spec'):
            error(path + '.spec', 'spec must be present and non-empty')
        if dep.get('source') == 'git' and not dep.get('resolved_commit') and candidate.get('status') == 'QUALIFIED':
            error(path + '.resolved_commit', 'a QUALIFIED record must resolve every git commit')
    # 14
    for dep in candidate.get('dependencies', []) + candidate.get('additional_dependencies', []):
        if not isinstance(dep.get('requested_spec'), str) or not dep.get('requested_spec'):
            error('dependencies[%s].requested_spec' % dep['name'],
                  'required audit key is missing or is not a non-empty string')
    # 15, 16, 17
    git_frozen = re.compile(r'^git\+\S+@[0-9a-f]{40}(#subdirectory=\S+)?$')
    pip_frozen = re.compile(r'^[A-Za-z0-9._-]+==[^=]+$')
    qualified = candidate.get('status') == 'QUALIFIED'
    for dep in candidate.get('dependencies', []) + candidate.get('additional_dependencies', []):
        path = 'dependencies[%s].spec' % dep['name']
        spec = dep.get('spec') or ''
        requested = dep.get('requested_spec') or ''
        if qualified:
            if dep.get('source') == 'git' and not git_frozen.match(spec):
                error(path, 'QUALIFIED requires git+<url>@<40-hex>[#subdirectory=...], got %r' % spec)
            if dep.get('source') == 'pip' and not pip_frozen.match(spec):
                error(path, 'QUALIFIED requires <name>==<version>, got %r' % spec)
        if spec != requested and dep.get('resolved_version') is None:
            error(path, 'an unfrozen spec must fall back to the verbatim requested_spec (4.0)')
    # 8
    forbidden = ('', 'unknown', 'latest', 'N/A', 'TBD')
    nullable = ('resolved_version', 'cuda_version', 'gpu_model', 'compute_capability', 'vram_bytes',
                'resolved_commit', 'resolved_url', 'wheel_sha256', 'import_name', 'package_id')
    for dep in candidate.get('dependencies', []) + candidate.get('additional_dependencies', []):
        for key, value in dep.items():
            if key in nullable and isinstance(value, str) and value.strip() in forbidden:
                error('dependencies[%s].%s' % (dep['name'], key), 'placeholder value %r' % value)
    for key, value in candidate.get('environment', {}).items():
        if key in nullable and isinstance(value, str) and value.strip() in forbidden:
            error('environment.' + key, 'placeholder value %r' % value)
    vram = candidate.get('environment', {}).get('vram_bytes')
    if vram is not None and not isinstance(vram, int):
        error('environment.vram_bytes', 'must be null or an exact integer, got %r' % (vram,))
    # 9 - contract 7.1 enumerates exactly which nullable fields must be declared.
    # "url" is excluded: contract 11.3's worked example shows url: null for pip
    # dependencies with no unknowns[] entry, because a pip package has no git URL by
    # definition rather than by failure. package_id is excluded for the reason
    # documented in collect_unknowns(); it is surfaced as a WARNING instead.
    nullable_declared = ('resolved_version', 'cuda_version', 'gpu_model', 'compute_capability',
                         'vram_bytes', 'resolved_commit', 'resolved_url', 'wheel_sha256',
                         'import_name')
    declared = {entry['field'] for entry in candidate.get('unknowns', [])}

    def unknown_declared(container, name, field):
        if field is None:
            return ('environment.' + container) in declared or container in declared
        return ('%s[%s].%s' % (container, name, field)) in declared

    for container_key in ('dependencies', 'additional_dependencies'):
        for dep in candidate.get(container_key, []):
            for field in nullable_declared:
                if field in dep and dep[field] is None:
                    if not unknown_declared(container_key, dep['name'], field):
                        error('%s[%s].%s' % (container_key, dep['name'], field),
                              'null in a nullable field with no matching unknowns[] entry (rule 9)')
    for field in nullable_declared:
        value = candidate.get('environment', {}).get(field)
        if field in candidate.get('environment', {}) and value is None:
            if not unknown_declared(field, None, None):
                error('environment.' + field,
                      'null in a nullable field with no matching unknowns[] entry (rule 9)')
    if candidate.get('package_id') is None and 'package_id' not in declared:
        warn('package_id', 'null with no unknowns[] entry; contract 3 documents this pre-issuance state')
    # 10
    if candidate.get('status') == 'QUALIFIED':
        if candidate['reproducibility'].get('assertion') != 'IDENTICAL':
            error('status', 'QUALIFIED requires reproducibility.assertion = IDENTICAL')
        if candidate.get('unknowns'):
            error('status', 'QUALIFIED requires unknowns[] to be empty')
    # 11
    if candidate['reproducibility'].get('assertion') == 'IDENTICAL':
        passes = candidate['reproducibility'].get('passes', [])
        if len(passes) < 2:
            error('reproducibility.passes', 'IDENTICAL requires at least 2 passes')
        elif len({p.get('base_python') for p in passes}) != 1:
            error('reproducibility.passes', 'base_python must be identical across passes')
    # 12
    recomputed = sha256_canonical(dict(candidate, qualification_hash=''))
    if candidate.get('qualification_hash') != recomputed:
        error('qualification_hash', 'does not match the recomputed content address')
    # 13
    blob = canonical_json(candidate)
    for pattern, label in ((_BEARER_LIKE, 'token-shaped string'),
                           (_CREDENTIALS_IN_URL, 'inline credentials in a URL')):
        if pattern.search(blob):
            error('record', 'secret material found: %s' % label)
    for pattern in (r'/kaggle/', r'/home/', r'/Users/', r'/opt/conda', r'[A-Za-z]:\\'):
        if re.search(pattern, blob):
            error('record', 'filesystem path found in the artifact: %s' % pattern)
    # 18 - a non-empty additional_dependencies[] must be disclosed in warnings[].
    extra = candidate.get('additional_dependencies') or []
    if extra:
        names = [d['name'] for d in extra]
        if not any(all(name in entry for name in names) for entry in candidate.get('warnings', [])):
            error('warnings', 'additional_dependencies[] is non-empty but no warnings[] entry '
                              'names every package in it (4.5 / rule 18)')
    return issues

validation = validate_qualification(record, [d['name'] for d in PINNED_DEPENDENCIES])
errors = [issue for issue in validation if issue['level'] == 'ERROR']
warnings_found = [issue for issue in validation if issue['level'] == 'WARNING']

write_canonical(QUALIFICATION_PATH, record)
print('wrote', QUALIFICATION_PATH, '(canonical form, contract 2)')
print('')
print('status          :', record['status'])
print('assertion       :', reproducibility['assertion'])
print('unknowns        :', len(record['unknowns']))
print('warnings        :', len(record['warnings']))
print('validation      :', len(errors), 'error(s),', len(warnings_found), 'warning(s)')
for issue in validation:
    print('  %-7s %-46s %s' % (issue['level'], issue['field'], issue['message']))
print('')
print('=' * 78)
print('env-qualification.json (pretty form; the file on disk is canonical)')
print('=' * 78)
print(json.dumps(record, indent=2, sort_keys=True))

if errors:
    abort('the emitted record violates docs/ENV_QUALIFICATION_CONTRACT.md 10:\n  - %s'
          % '\n  - '.join('%s: %s' % (e['field'], e['message']) for e in errors))`,

  String.raw`# --- Section 11: Human-readable report + paste-ready TypeScript ---
def ts_literal(value):
    return 'null' if value is None else json.dumps(value)

snippet_lines = [
    '// GENERATED by scripts/qualify/qualify-kaggle-env.ipynb - do not hand-edit.',
    '// Paste over PINNED_ENGINE_DEPENDENCIES in apps/web/lib/training/package.ts.',
    '// Source: env-qualification.json @ %s (status %s)' % (record['captured_at'], record['status']),
    '// Contract 11.1: spec is the FROZEN pin (4.0); resolvedVersion comes from resolved_version.',
    'export const PINNED_ENGINE_DEPENDENCIES: EngineDependency[] = [',
]
for dep in record['dependencies']:
    snippet_lines.append('  { name: %s, source: %s, spec: %s, resolvedVersion: %s, url: %s },'
                         % (ts_literal(dep['name']), ts_literal(dep['source']),
                            ts_literal(dep['spec']), ts_literal(dep['resolved_version']),
                            ts_literal(dep['url'])))
snippet_lines.append('];')
snippet = '\n'.join(snippet_lines) + '\n'
with open(TS_SNIPPET_PATH, 'w', encoding='utf-8', newline='\n') as handle:
    handle.write(snippet)

def md_table(records):
    lines = ['| name | source | resolved_version | resolved_commit | spec |',
             '| --- | --- | --- | --- | --- |']
    for dep in records:
        lines.append('| %s | %s | %s | %s | %s |'
                     % (dep['name'], dep['source'],
                        dep['resolved_version'] or '**UNRESOLVED**',
                        dep.get('resolved_commit') or '-', dep['spec']))
    return lines

report_lines = [
    '# GHARIBO environment qualification report',
    '',
    '- Captured: %s' % record['captured_at'],
    '- Contract: env-qualification.json schema %s (docs/ENV_QUALIFICATION_CONTRACT.md)'
    % record['contract_schema_version'],
    '- Harness: %s v%s (content address %s)'
    % (HARNESS_PATH, record['harness_version'], HARNESS_CONTENT_SHA256 or 'unset'),
    '- Experiment: %s' % record['experiment_id'],
    '- Engine: %s %s' % (record['engine']['engine'], record['engine']['engine_version']),
    '- **Status: %s**  (freeze gate frozen_ok = %s)'
    % (record['status'], record['status'] == 'QUALIFIED' and not record['unknowns']),
    '- Scope: QUALIFICATION ONLY - no model weights downloaded, no training executed.',
    '',
    '## Environment',
    '',
    '| field | value |',
    '| --- | --- |',
]
for key in sorted(record['environment']):
    report_lines.append('| %s | %s |' % (key, record['environment'][key]))
report_lines += ['', '## dependencies[] (contract 4.3 rule 1)', ''] + md_table(record['dependencies'])
report_lines += ['', '## additional_dependencies[] (recipe-required, not pinned in package.ts)', '']
report_lines += md_table(record.get('additional_dependencies', []))
report_lines += [
    '',
    '## Reproducibility (contract 6)',
    '',
    '- assertion: **%s**' % record['reproducibility']['assertion'],
    '- comparison: %s' % record['reproducibility']['comparison'],
    '- dependency_set_hash: %s' % record['reproducibility']['dependency_set_hash'],
]
for entry in record['reproducibility']['passes']:
    report_lines.append('  - pass %s: %s -> %s, hash %s, python %s'
                        % (entry['pass_index'], entry['started_at'], entry['finished_at'],
                           entry['dependency_set_hash'], entry['base_python']))
for item in record['reproducibility'].get('mismatches', []):
    report_lines.append('  - MISMATCH %s' % item)
if record['reproducibility'].get('error'):
    report_lines.append('  - error: %s' % record['reproducibility']['error'])

report_lines += ['', '## Import smoke test (no weights downloaded)', '',
                 '| module | result | seconds | error |', '| --- | --- | --- | --- |']
for module in IMPORT_SMOKE_MODULES:
    result = import_smoke.get(module)
    if result is None:
        report_lines.append('| %s | not run | - | - |' % module)
    else:
        report_lines.append('| %s | %s | %s | %s |'
                            % (module, 'ok' if result.get('ok') else '**FAILED**',
                               result.get('seconds'), result.get('error') or ''))

report_lines += ['', '## unknowns[] (contract 7.2)', '']
if record['unknowns']:
    for entry in record['unknowns']:
        report_lines.append('- **%s**: %s' % (entry['field'], entry['reason']))
else:
    report_lines.append('- none')
report_lines += ['', '## warnings[]', '']
if record['warnings']:
    for entry in record['warnings']:
        report_lines.append('- %s' % entry)
else:
    report_lines.append('- none')
report_lines += ['', '## Validation (contract 10)', '']
if validation:
    for issue in validation:
        report_lines.append('- %s **%s**: %s' % (issue['level'], issue['field'], issue['message']))
else:
    report_lines.append('- no issues')
report_lines += [
    '',
    '## Next step',
    '',
    'frozen_ok = (status == "QUALIFIED") AND (unknowns is empty) - contract 7.3.',
    'Only when frozen_ok is true may PINNED_ENGINE_DEPENDENCIES.frozen.ts be pasted into',
    'apps/web/lib/training/package.ts. Otherwise the engine record stays UNQUALIFIED.',
    '',
]
report = '\n'.join(report_lines) + '\n'
with open(REPORT_PATH, 'w', encoding='utf-8', newline='\n') as handle:
    handle.write(report)

print('wrote', REPORT_PATH)
print('wrote', TS_SNIPPET_PATH)
print('')
print(report)
print('--- PINNED_ENGINE_DEPENDENCIES.frozen.ts ---')
print(snippet)`,

  String.raw`# --- Section 12: Final summary ---
def sha256_text(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

artifact_names = ['env-qualification.json', 'env-qualification.md',
                  'PINNED_ENGINE_DEPENDENCIES.frozen.ts', 'qualification-install-args.json']
lines = []
for name in artifact_names:
    path = WORKING / name
    if path.exists():
        lines.append('%s  %s' % (sha256_file(path), name))
rollup = sha256_text('\n'.join(sorted(lines)))
with open(WORKING / 'CHECKSUMS.sha256', 'w', encoding='utf-8', newline='\n') as handle:
    handle.write('\n'.join(lines) + '\n# rollup  ' + rollup + '\n')

frozen_ok = (record['status'] == 'QUALIFIED') and (len(record['unknowns']) == 0)

print('=' * 78)
print('QUALIFICATION SUMMARY')
print('=' * 78)
print('contract_schema_version :', record['contract_schema_version'])
print('status                  :', record['status'])
print('frozen_ok               :', frozen_ok, '(contract 7.3)')
print('reproducibility         :', record['reproducibility']['assertion'])
print('dependencies resolved   : %d/%d'
      % (len([d for d in record['dependencies'] if d['resolved_version']]), len(record['dependencies'])))
print('additional resolved     : %d/%d'
      % (len([d for d in record.get('additional_dependencies', []) if d['resolved_version']]),
         len(record.get('additional_dependencies', []))))
print('unknowns                :', len(record['unknowns']))
print('validation errors       :', len(errors))
print('qualification_hash      :', record['qualification_hash'])
print('artifact rollup         :', rollup)
print('')
if frozen_ok:
    print('RESULT: QUALIFIED - every dependency resolved to an exact version or commit SHA,')
    print('        two fresh environments agreed, and unknowns[] is empty.')
else:
    print('RESULT: %s - the freeze MUST NOT be applied yet (contract 7.3).' % record['status'])
    if record['unknowns']:
        print('        %d unresolved value(s) - see unknowns[] in env-qualification.json.'
              % len(record['unknowns']))
    if record['reproducibility']['assertion'] != 'IDENTICAL':
        print('        reproducibility assertion is %s.' % record['reproducibility']['assertion'])
print('Download env-qualification.json and env-qualification.md from the notebook Output.')
print('Run this notebook as a Save-Version / committed run so /kaggle/working persists.')`,
];

// ---------------------------------------------------------------------------
// 4. Deterministic .ipynb assembly (same normalisation as notebook-render.ts).
// ---------------------------------------------------------------------------

const NOTEBOOK_METADATA = {
  kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
  language_info: { name: "python", version: "3.11" },
};

/** Splits a source string into the canonical Jupyter line array. */
function toLines(source) {
  const normalized = source.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n");
  if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  return parts.map((line, i) => (i < parts.length - 1 ? line + "\n" : line));
}

function substitute(source, harnessSha) {
  return source
    .split(INVENTORY_SENTINEL)
    .join(INVENTORY_JSON)
    .split(ENGINE_VERSION_SENTINEL)
    .join(ENGINE_VERSION)
    .split(HARNESS_SHA_SENTINEL)
    .join(harnessSha);
}

function buildNotebook(harnessSha) {
  const cells = CELLS.map((source, i) => ({
    cell_type: "code",
    execution_count: null,
    id: `gharibo-qualify-cell-${i}`,
    metadata: {},
    outputs: [],
    source: toLines(substitute(source, harnessSha)),
  }));
  return { cells, metadata: NOTEBOOK_METADATA, nbformat: 4, nbformat_minor: 5 };
}

function serialize(notebook) {
  return JSON.stringify(notebook, null, 1) + "\n";
}

/** Content address: sha256 of the notebook with the harness hash blanked. */
export function renderHarnessNotebook() {
  const blank = serialize(buildNotebook(""));
  const sha = createHash("sha256").update(blank, "utf8").digest("hex");
  return { content: serialize(buildNotebook(sha)), sha256: sha };
}

// ---------------------------------------------------------------------------
// 5. CLI
// ---------------------------------------------------------------------------

function main() {
  const check = process.argv.includes("--check");
  const { content, sha256 } = renderHarnessNotebook();
  const existing = fs.existsSync(NOTEBOOK_PATH) ? fs.readFileSync(NOTEBOOK_PATH, "utf8") : null;

  if (check) {
    if (existing === content) {
      console.log(`qualify harness is up to date (${CELLS.length} cells, content address ${sha256})`);
      return;
    }
    console.error("qualify harness is STALE - run: node scripts/qualify/qualify-kaggle-env.mjs");
    process.exit(1);
  }

  if (existing === content) {
    console.log(`unchanged: ${path.relative(ROOT, NOTEBOOK_PATH)} (content address ${sha256})`);
    return;
  }
  fs.writeFileSync(NOTEBOOK_PATH, content, "utf8");
  console.log(`wrote ${path.relative(ROOT, NOTEBOOK_PATH)}`);
  console.log(`  cells             : ${CELLS.length}`);
  console.log(`  content address   : ${sha256}`);
  console.log(`  contract schema   : ${INVENTORY_JSON.match(/"contract_schema_version": "([^"]+)"/)[1]}`);
  console.log(`  engine version    : ${ENGINE_VERSION}`);
  console.log(`  dependencies[]    : ${PINNED_INVENTORY.map((d) => d.name).join(", ")}`);
  console.log(`  additional[]      : ${EXTRA_INVENTORY.map((d) => d.name).join(", ")} + harmony (run time)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
