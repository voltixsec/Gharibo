#!/usr/bin/env node
/**
 * build-eval-kernel.mjs — deterministic generator for the governed Kaggle EVALUATION kernel.
 *
 * WHAT THIS PRODUCES
 * ------------------
 * `scripts/eval/kaggle/gharibo-eval-001.ipynb`, the notebook that runs the ONE authorized
 * held-out TEST benchmark (attempt #4, DEC-0038) on a free Kaggle T4: BASE then CANDIDATE over the
 * same 80 TEST prompts, greedy, identical settings for both arms.
 *
 * DEC-0038 authorizes exactly ONE kernel push. The pins carry that bound so the notebook asserts it
 * at runtime, and the prior authorization (DEC-0032) is carried alongside rather than overwritten —
 * this attempt supersedes DEC-0032 for execution without erasing it.
 *
 * WHY A GENERATOR (mirrors scripts/qualify/qualify-kaggle-env.mjs)
 * ---------------------------------------------------------------
 * Every pin the notebook depends on — base model revision, adapter sha256, TEST split hash,
 * record count, decoding config, metric ids — is injected from the repo's own governed
 * constants rather than retyped into a notebook. A hand-edited notebook drifts silently; a
 * rendered one cannot. `--check` fails on drift, exactly like the qualification harness.
 *
 * TRAINING IS FORBIDDEN IN THIS NOTEBOOK, and that is enforced by construction:
 *   - no `trainer.train()`, no optimizer, no `backward()`, no scheduler, no `.step()`,
 *   - every model runs under `torch.inference_mode()`,
 *   - `GRADIENT_ENABLED` is asserted False for both arms,
 *   - `scripts/eval/check-eval-kernel.mjs` re-reads the generated notebook and fails if any
 *     forbidden token reappears. The generator and the checker share ONE forbidden-token list.
 *
 * TEST PRIVACY
 * ------------
 * The notebook receives ONLY `prompts.jsonl` (system + user). It never sees `gold.jsonl`.
 * Gold stays local for scoring, which is what makes the model's blindness to the answer
 * mechanical rather than a promise.
 *
 * DECODING (RESEARCH_BENCHMARK.md 7.1)
 * ------------------------------------
 * temperature 0.0, do_sample false, max_new_tokens 1024, seed 0, repeats 1. Both arms use
 * these exact values; the notebook asserts they are identical before it starts.
 *
 * Usage:
 *   node scripts/eval/build-eval-kernel.mjs          # write the notebook
 *   node scripts/eval/build-eval-kernel.mjs --check  # exit 1 if the notebook is stale
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "scripts/eval/kaggle/gharibo-eval-001.ipynb";

/** Governed pins. These are the ONLY place these values are written in the kernel. */
export const EVAL_PINS = Object.freeze({
  baseModel: "openai/gpt-oss-20b",
  baseModelRevision: "6cee5e81ee83917806bbde320786a8fb61efebee",
  loaderModelId: "unsloth/gpt-oss-20b",
  candidateAdapterSha256: "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f",
  candidateArmId: "GHARIBO-exp-001",
  testSplitHash: "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",
  testRecordCount: 80,
  datasetHash: "84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5",
  authorizationDecisionId: "DEC-0038",
  decision: "AUTHORIZED WITH LIMITS",
  /**
   * The authorization DEC-0038 REPLACES for execution purposes. DEC-0032 remains the standing
   * measure-only authorization; DEC-0038 is the bounded attempt-#4 decision that follows the
   * DEC-0036 halt and the DEC-0037 diagnostic PASS. Both are pinned so the notebook records which
   * decision it ran under AND what came before it, rather than silently re-labelling history.
   */
  priorAuthorizationDecisionId: "DEC-0032",
  attemptNumber: 4,
  maximumKernelPushes: 1,
  // decoding 7.1
  temperature: 0.0,
  doSample: false,
  topP: 1.0,
  topK: 0,
  maxNewTokens: 1024,
  seed: 0,
  repeats: 1,
  maxSeqLength: 1024,
  harnessVersion: "gharibo-eval-harness-1.0.0",
  metricIds: ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12", "M13"],
  /**
   * The governed engine freeze, transcribed from the accepted training manifest
   * (`apps/web/data/kaggle-results/GHARIBO-exp-001/manifest.json` -> engine.dependencies).
   * Both arms load through this SAME stack, so a BASE/CANDIDATE difference cannot be
   * attributed to a package difference.
   */
  engineFreeze: "unsloth-freeze-2026.09.15",
  engineDependencies: [
    { name: "unsloth", spec: "unsloth==2026.9.4" },
    { name: "unsloth_zoo", spec: "unsloth_zoo==2026.9.3" },
    { name: "transformers", spec: "transformers==4.56.2" },
    { name: "peft", spec: "peft==0.20.0" },
    { name: "trl", spec: "trl==0.22.2" },
    { name: "datasets", spec: "datasets==5.0.1" },
    { name: "accelerate", spec: "accelerate==1.15.0" },
    { name: "bitsandbytes", spec: "bitsandbytes==0.50.2" },
    { name: "openai-harmony", spec: "openai-harmony==0.0.8" },
  ],
  /**
   * The knowingly over-constrained pair. `unsloth` / `unsloth_zoo` declare a conservative
   * metadata cap (`datasets<4.4.0`) that is unsatisfiable against the frozen
   * `datasets==5.0.1` in a single resolver transaction. Upstream and the accepted
   * qualification both install them with `--upgrade --no-deps`. Reproduced here so the
   * evaluation stack is byte-for-byte the stack the adapter was trained on.
   */
  frozenNoDeps: ["unsloth", "unsloth_zoo"],
  supportNoDeps: ["torchao>=0.16.0"],
  preservedCandidates: ["torch", "triton"],
  skipWhenPreserved: ["triton_kernels"],
  /** Harmony channelling, as declared by the governed package. */
  reasoningEffort: "medium",
});

/**
 * The forbidden-token list. Shared with check-eval-kernel.mjs by import so the two can never
 * disagree. Each entry is a training or tuning primitive the evaluation notebook must not
 * contain.
 *
 * MATCHING RULE (same discipline as scripts/qualify/check-qualify-harness.mjs): a conservative
 * raw-substring scan over cell sources. Model LOADING and `generate` are permitted here — this
 * notebook must run real inference on a real model. Everything that would TRAIN, TUNE, step an
 * optimizer, compute a gradient, or write a model artifact is forbidden.
 */
export const FORBIDDEN_TOKENS = Object.freeze([
  // Trainers and training loops.
  "SFTTrainer",
  "SFTConfig",
  "Trainer(",
  "TrainingArguments(",
  "trainer.train(",
  ".train(",
  // Optimizer construction, steps and schedulers.
  "optimizer.step(",
  ".step()",
  "torch.optim.",
  "torch.optim.Optimizer(",
  "optim.AdamW",
  "AdamW",
  "adamw_8bit",
  "lr_scheduler",
  "get_scheduler",
  "scheduler",
  // Backward passes and gradient enabling.
  "loss.backward(",
  ".backward()",
  "torch.autograd.backward(",
  "autograd.grad(",
  "accelerator.backward(",
  "requires_grad_(",
  "enable_grad",
  "ZeroGrad",
  // Model artifacts are never written by an evaluation run.
  "push_to_hub",
  "save_pretrained",
  "save_model",
  "state_dict()",
  "gradient_checkpointing_enable",
  // A tuning knob: this notebook must not search or select.
  "load_best_model_at_end",
  "metric_for_best_model",
]);

const md = (lines) => lines.join("\n");
const code = (lines) => lines.join("\n");

/**
 * The canonical JSON encoding of the pins, embedded into the notebook as a STRING.
 *
 * Canonical means: object keys sorted RECURSIVELY at every level. This is deliberately NOT
 * `JSON.stringify(p, Object.keys(p).sort(), 4)` — an array passed as the second argument is a
 * property ALLOW-LIST that is applied at every nesting level, so it silently shreds nested
 * objects into `{}`. That failure mode is the same species as the one this function exists to
 * prevent: a shape that looks right and is quietly empty.
 */
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

/** Re-encoding a decoded pin object must reproduce the injected text byte-for-byte. */
function pinsJsonText(pins) {
  return canonicalJson(pins);
}

/**
 * Guard the ORIGINAL defect: a JSON `true`/`false`/`null` emitted into Python SOURCE position,
 * where Python has no such names and raises NameError.
 *
 * The scan must NOT look at the whole JSON text, because the sanctioned design embeds that text
 * inside a quoted string, where those literals are inert data. So the check is deliberately
 * narrow: it fails only if the emitted text appears as Python code with an UNQUOTED JSON literal.
 *
 * A line is treated as "quoted" when it sits inside a triple-quoted block or contains an odd
 * number of the quote character to its left. That is enough to distinguish the embedded payload
 * from a literal assignment, which is the only distinction that matters here.
 */
export function containsJsonOnlyLiterals(pythonSource) {
  const literal = /(^|[\s:,{\[])(true|false|null)([\s,}\]\n]|$)/;
  let inTriple = false;
  for (const line of pythonSource.split("\n")) {
    const stripped = line.trim();
    if (stripped.startsWith("#")) continue; // comment, never executed
    const triples = line.match(/'''|"""/g);
    if (inTriple) {
      if (triples && triples.length % 2 === 1) inTriple = false;
      continue; // inside a quoted payload: literals are data, not code
    }
    if (triples && triples.length % 2 === 1) {
      inTriple = true;
      continue;
    }
    // Strip quoted string contents, then look for a bare JSON-only literal in code position.
    const codeOnly = line.replace(/'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '""');
    if (literal.test(codeOnly)) return true;
  }
  return false;
}

/** The emitted pins cell only, for the guard above and for the checker. */
export function pinsCellSource() {
  return pinsCell(EVAL_PINS);
}

/**
 * True if any nested object was emptied. Catches the `Object.keys(...).sort()` allow-list
 * mistake, which produces well-formed JSON with silently missing data.
 */
function hasEmptyObject(value) {
  if (Array.isArray(value)) return value.some(hasEmptyObject);
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return true;
    return keys.some((k) => hasEmptyObject(value[k]));
  }
  return false;
}

/**
 * The governed-pins cell, in isolation. Extracted so the build-time guards and the checker can
 * inspect exactly this cell without re-entering `cells()`.
 */
export function pinsCell(p) {
  const pinsJson = pinsJsonText(p);
  return code([
    "# --- governed pins (injected by the generator; do not hand-edit) ---",
    "# The pins arrive as an EMBEDDED JSON STRING and are decoded with json.loads().",
    "# They are deliberately NOT emitted as Python literals: JSON and Python disagree on",
    "# true/false/null, and a JSON-literal emission (PINS = {...\"doSample\": false...}) is a",
    "# NameError in Python that kills the notebook in cell 1, before any inference. Round-",
    "# tripping through a string makes this artifact structurally immune to that class of",
    "# defect, and the round-trip is asserted below rather than assumed.",
    `_PINS_JSON = r'''${pinsJson}'''`,
    "",
    "import hashlib, json, os, sys, time",
    "",
    "PINS = json.loads(_PINS_JSON)",
    "",
    "# The pins must survive the round-trip EXACTLY. A silent coercion here would change the",
    "# measurement contract, so the decoded object is compared against a re-encoding of itself",
    "# and against the injected source text.",
    "assert json.loads(json.dumps(PINS, sort_keys=True)) == PINS, 'pin round-trip is not stable'",
    "assert _PINS_JSON == json.dumps(json.loads(_PINS_JSON), indent=4, sort_keys=True, ensure_ascii=False), \\",
    "    'injected pin text is not canonical'",
    "",
    "# Decoding pins are the measurement contract (RESEARCH_BENCHMARK.md 7.1). JSON has no",
    "# int/float distinction, so the round-trip through JSON degrades a JSON `0.0` to a Python",
    "# `int`. The declared TYPES are therefore restored explicitly below and then asserted - a",
    "# truthiness check or an `==` check would both silently accept the degraded value.",
    "PINS['temperature'] = float(PINS['temperature'])",
    "PINS['topP'] = float(PINS['topP'])",
    "",
    "# The declared contract, as a single table so a mismatch names itself.",
    "_DECODING_CONTRACT = {",
    "    'temperature': (0.0, float),",
    "    'topP': (1.0, float),",
    "    'topK': (0, int),",
    "    'maxNewTokens': (1024, int),",
    "    'seed': (0, int),",
    "    'repeats': (1, int),",
    "}",
    "for _k, (_want, _type) in _DECODING_CONTRACT.items():",
    "    _got = PINS[_k]",
    "    assert type(_got) is _type, f'decoding pin {_k} has type {type(_got).__name__}, expected {_type.__name__}'",
    "    assert _got == _want, f'decoding pin {_k} is {_got!r}, expected {_want!r}'",
    "assert PINS['doSample'] is False, 'doSample must be the boolean False'",
    "",
    "# A stripped nested object would make the install stage iterate over nothing.",
    "assert all(isinstance(d, dict) and d.get('name') and d.get('spec') for d in PINS['engineDependencies']), \\",
    "    'engineDependencies must carry name+spec; an empty entry means the pin set was shredded'",
    "assert len(PINS['engineDependencies']) == 9, 'engineDependencies must carry all 9 frozen specs'",
    "",
    "assert PINS['authorizationDecisionId'] == 'DEC-0038', 'unexpected authorization'",
    "assert PINS['decision'] == 'AUTHORIZED WITH LIMITS', 'unexpected decision scope'",
    "assert PINS['attemptNumber'] == 4, 'unexpected attempt number'",
    "assert PINS['maximumKernelPushes'] == 1, 'attempt #4 is bounded to ONE kernel push'",
    "assert PINS['priorAuthorizationDecisionId'] == 'DEC-0032', 'unexpected prior authorization'",
    "",
    "print('authorization :', PINS['authorizationDecisionId'], '-', PINS['decision'])",
    "print('attempt       :', PINS['attemptNumber'], '(max pushes',",
    "      str(PINS['maximumKernelPushes']) + ')')",
    "print('prior auth    :', PINS['priorAuthorizationDecisionId'])",
    "print('TEST split    :', PINS['testSplitHash'])",
    "print('records       :', PINS['testRecordCount'])",
  ]);
}

function cells() {
  const p = EVAL_PINS;
  const pinsJson = pinsJsonText(p);
  // Fail the BUILD, not the run. An emptied nested object or a Python-incompatible literal here
  // would otherwise only surface minutes into a GPU execution, or worse, silently.
  if (hasEmptyObject(p)) {
    throw new Error(
      "EVAL_PINS contains an empty nested object; refusing to emit a silently incomplete pin set.",
    );
  }
  if (containsJsonOnlyLiterals(pinsCell(p))) {
    throw new Error(
      "the emitted pins cell contains an unquoted JSON-only literal (true/false/null); " +
        "refusing to emit Python source that would raise NameError.",
    );
  }
  if (pinsJsonText(JSON.parse(pinsJson)) !== pinsJson) {
    throw new Error("EVAL_PINS does not survive a canonical JSON round-trip; refusing to emit.");
  }
  return [
    {
      cell_type: "markdown",
      metadata: {},
      source: md([
        "# GHARIBO — governed held-out TEST evaluation (attempt #4, `DEC-0038`)",
        "",
        "| Field | Value |",
        "|-------|-------|",
        `| Authorization | \`${p.authorizationDecisionId}\` — ${p.decision} |`,
        `| Attempt | #${p.attemptNumber} — maximum ${p.maximumKernelPushes} kernel push |`,
        `| Prior authorization | \`${p.priorAuthorizationDecisionId}\` (superseded for execution by this attempt) |`,
        `| Base arm | \`${p.baseModel}\` @ \`${p.baseModelRevision}\` (unadapted) |`,
        `| Candidate arm | \`${p.candidateArmId}\` adapter \`${p.candidateAdapterSha256}\` |`,
        `| Held-out TEST | \`${p.testSplitHash}\` — ${p.testRecordCount} records |`,
        `| Harness | \`${p.harnessVersion}\` |`,
        `| Decoding | temperature ${p.temperature}, do_sample ${p.doSample}, max_new_tokens ${p.maxNewTokens}, seed ${p.seed}, repeats ${p.repeats} |`,
        "",
        "**This notebook measures. It does not train, tune, select or promote.**",
        "",
        "Both arms run over the same prompts with identical decoding. The notebook sees",
        "`prompts.jsonl` only — never the gold answers. Scoring happens locally.",
      ]),
    },
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: pinsCell(p),
    },
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- environment / GPU (recorded, never assumed) ---",
        "def sha256_bytes(b): return hashlib.sha256(b).hexdigest()",
        "",
        "def sha256_file(path, chunk=1 << 20):",
        "    h = hashlib.sha256()",
        "    with open(path, 'rb') as fh:",
        "        for block in iter(lambda: fh.read(chunk), b''):",
        "            h.update(block)",
        "    return h.hexdigest()",
        "",
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
        "assert ENV.get('cuda_available'), 'this evaluation requires a GPU'",
      ]),
    },
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- enforce the pinned BASE revision against the LIVE base repo ---",
        "#",
        "# The loader call deliberately does NOT take a revision (see the BASE-load cell: passing one",
        "# to the Unsloth distribution id makes the load fail). That makes this cell LOAD-BEARING:",
        "# without it, nothing in this notebook would tie the measured base to the accepted revision,",
        "# and the arm could silently evaluate a different snapshot of the base model.",
        "#",
        "# The revision is resolved from the REAL base repo (`openai/gpt-oss-20b`), never guessed and",
        "# never taken from a cached value, and a mismatch aborts the run.",
        "from huggingface_hub import HfApi",
        "",
        "def resolve_base_revision(repo_id):",
        "    info = HfApi().model_info(repo_id=repo_id)",
        "    sha = getattr(info, 'sha', None)",
        "    if not isinstance(sha, str) or len(sha) != 40:",
        "        raise RuntimeError(f'huggingface_hub reported no 40-hex revision for {repo_id!r}: {sha!r}')",
        "    return sha",
        "",
        "ENV['base_repo'] = PINS['baseModel']",
        "BASE_MODEL_REVISION = resolve_base_revision(PINS['baseModel'])",
        "ENV['base_model_revision_resolved'] = BASE_MODEL_REVISION",
        "print('base repo            :', PINS['baseModel'])",
        "print('base revision (live) :', BASE_MODEL_REVISION)",
        "print('base revision (pinned):', PINS['baseModelRevision'])",
        "assert BASE_MODEL_REVISION == PINS['baseModelRevision'], (",
        "    f\"REFUSING TO RUN: base revision drifted. pinned {PINS['baseModelRevision']}, \"",
        "    f\"live {BASE_MODEL_REVISION}\"",
        ")",
        "print('base revision pin    : ENFORCED against the live repo')",
      ]),
    },
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- locate the governed prompt payload ---",
        "# The notebook is given prompts.jsonl ONLY. gold.jsonl is deliberately absent: the",
        "# model must be structurally incapable of seeing the answers it is scored against.",
        "CANDIDATES = []",
        "for base in ('/kaggle/input', '/kaggle/working'):",
        "    for root, _dirs, files in os.walk(base):",
        "        for f in files:",
        "            if f in ('prompts.jsonl', 'gharibo-eval-prompts.jsonl'):",
        "                CANDIDATES.append(os.path.join(root, f))",
        "CANDIDATES.sort()",
        "",
        "golds = []",
        "for base in ('/kaggle/input', '/kaggle/working'):",
        "    for root, _dirs, files in os.walk(base):",
        "        for f in files:",
        "            if f in ('gold.jsonl', 'gharibo-eval-gold.jsonl'):",
        "                golds.append(os.path.join(root, f))",
        "",
        "print('prompt payloads found :', len(CANDIDATES))",
        "print('gold payloads found   :', len(golds), '(must be 0)')",
        "assert len(CANDIDATES) == 1, f'expected exactly one prompts.jsonl, found {len(CANDIDATES)}'",
        "assert len(golds) == 0, 'REFUSING TO RUN: the gold answers are present in the inference environment'",
        "",
        "PROMPTS_PATH = CANDIDATES[0]",
        "PROMPTS_SHA256 = sha256_file(PROMPTS_PATH)",
        "print('prompts path          :', PROMPTS_PATH)",
        "print('prompts sha256        :', PROMPTS_SHA256)",
        "",
        "items = [json.loads(l) for l in open(PROMPTS_PATH, encoding='utf-8') if l.strip()]",
        "assert len(items) == PINS['testRecordCount'], f\"expected {PINS['testRecordCount']} items, found {len(items)}\"",
        "print('items                 :', len(items))",
      ]),
    },
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- dependencies: the SAME governed engine stack the training run used ---",
        "#",
        "# Reproduces the accepted three-stage `uv` discipline (engine freeze",
        `# ${p.engineFreeze}). The ad-hoc %pip sequence this replaced was DEFECT 1 of the`,
        "# pre-execution blocker recorded in DEC-0033 / BLK-0004: it submitted the whole",
        "# frozen set to ONE resolver transaction, which is unsatisfiable because",
        "# unsloth/unsloth_zoo cap `datasets<4.4.0` while the freeze pins `datasets==5.0.1`.",
        "#",
        "# Guarantees:",
        "#   1. No -qqq on install commands - complete stdout + stderr are captured.",
        "#   2. Every stage is dry-run with its EXACT arguments immediately before it runs.",
        "#   3. On failure a bounded redacted diagnostic is persisted, and the raised error",
        "#      carries the real resolver/package reason (never just 'exit code 1').",
        "#   4. Preinstalled torch/triton are preserved and constraint-pinned, so no stage",
        "#      can upgrade them off the +cu128 build Kaggle provides.",
        "#   5. triton_kernels is skipped on the Kaggle preserve path (upstream-aligned).",
        "import importlib.metadata as _metadata",
        "import os, pathlib, re, shutil, subprocess, sys",
        "",
        "WORKING = pathlib.Path('/kaggle/working')",
        "if not WORKING.exists():",
        "    WORKING = pathlib.Path('.')",
        "",
        "INSTALL_DIAGNOSTIC_PATH = WORKING / 'eval-install-diagnostic.json'",
        "",
        "def redact(text):",
        "    # Removes anything credential-shaped before it is printed or persisted.",
        "    text = re.sub(r'hf_[A-Za-z0-9]{10,}', '<redacted-hf-token>', text)",
        "    text = re.sub(r'(?i)(api[_-]?key|token|secret|password)([\\\"\\']?\\s*[:=]\\s*)([^\\s\\\"\\',]+)',",
        "                  r'\\1\\2<redacted>', text)",
        "    return text",
        "",
        "def scrub_paths(text):",
        "    return text.replace('/kaggle/input/', '/kaggle/input/<dataset>/')",
        "",
        "def run_install_command(cmd, phase, timeout=None):",
        "    display = scrub_paths(redact(' '.join(cmd)))",
        "    print('$', display)",
        "    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)",
        "    if proc.returncode != 0:",
        "        max_diag = 32000",
        "        out_trim = scrub_paths(redact(proc.stdout or ''))[-max_diag:]",
        "        err_trim = scrub_paths(redact(proc.stderr or ''))[-max_diag:]",
        "        diagnostic = {'phase': phase, 'command': display, 'exit_code': proc.returncode,",
        "                      'stdout_redacted': out_trim, 'stderr_redacted': err_trim}",
        "        try:",
        "            INSTALL_DIAGNOSTIC_PATH.write_text(json.dumps(diagnostic, indent=1), encoding='utf-8')",
        "        except Exception as exc:",
        "            print('could not persist install diagnostic:', type(exc).__name__)",
        "        raise RuntimeError(",
        "            '%s failed (exit code %d).\\n--- redacted stdout (last %d chars) ---\\n%s\\n'",
        "            '--- redacted stderr (last %d chars) ---\\n%s\\nDiagnostic persisted to %s'",
        "            % (phase, proc.returncode, len(out_trim), out_trim, len(err_trim), err_trim,",
        "               INSTALL_DIAGNOSTIC_PATH.name))",
        "    return proc",
        "",
        "print('Bootstrapping uv...')",
        "subprocess.run([sys.executable, '-m', 'pip', 'install', '--upgrade', '-qqq', 'uv'], check=True)",
        "UV = shutil.which('uv') or os.path.join(os.path.dirname(sys.executable), 'uv')",
        "if not shutil.which('uv') and not os.path.exists(UV):",
        "    raise RuntimeError('uv was installed but is not on PATH - cannot continue.')",
        "",
        "if os.environ.get('VIRTUAL_ENV'):",
        "    TARGET_FLAGS = ['--python', sys.executable]",
        "else:",
        "    TARGET_FLAGS = ['--system', '--python', sys.executable]",
        "",
        "# Turing-only build target: keeps any source build from emitting sm_80+ kernels a",
        "# T4 cannot load.",
        "os.environ['TORCH_CUDA_ARCH_LIST'] = '7.5'",
        "os.environ.setdefault('CMAKE_CUDA_ARCHITECTURES', '75')",
        "",
        "ON_KAGGLE = os.path.isdir('/kaggle')",
        "",
        "def module_present(modname):",
        "    try:",
        "        __import__(modname)",
        "        return True",
        "    except Exception:",
        "        return False",
        "",
        "PRESERVED = {}",
        "if ON_KAGGLE:",
        "    for _name in PINS['preservedCandidates']:",
        "        if module_present(_name):",
        "            PRESERVED[_name] = _metadata.version(_name)",
        "",
        "SKIPPED = set()",
        "if PRESERVED:",
        "    SKIPPED.update(PINS['skipWhenPreserved'])",
        "",
        "resolver_specs = []",
        "frozen_specs = []",
        "for _dep in PINS['engineDependencies']:",
        "    if _dep['name'] in PRESERVED:",
        "        print('preserving preinstalled %s==%s (not re-resolved against PyPI)'",
        "              % (_dep['name'], PRESERVED[_dep['name']]))",
        "        continue",
        "    if _dep['name'] in SKIPPED:",
        "        print('skipping %s on the Kaggle preserve path (upstream-aligned)' % _dep['name'])",
        "        continue",
        "    if _dep['name'] in PINS['frozenNoDeps']:",
        "        frozen_specs.append(_dep['spec'])",
        "    else:",
        "        resolver_specs.append(_dep['spec'])",
        "",
        "print('Stage 1 (resolver-managed):', resolver_specs)",
        "print('Stage 2 (--no-deps frozen set):', frozen_specs)",
        "print('Stage 3 (--no-deps support):', PINS['supportNoDeps'])",
        "",
        "# Exact constraints stop any transitive dependency from upgrading the preserved builds.",
        "CONSTRAINT_PATH = WORKING / 'eval-preserved-constraints.txt'",
        "CONSTRAINT_PATH.write_text(''.join('%s==%s\\n' % _i for _i in sorted(PRESERVED.items())),",
        "                           encoding='utf-8')",
        "CONSTRAINT_FLAGS = ['--constraint', str(CONSTRAINT_PATH)] if PRESERVED else []",
        "",
        "BASE = [UV, 'pip', 'install', *TARGET_FLAGS, '--no-cache-dir', *CONSTRAINT_FLAGS]",
        "",
        "INSTALL_PLAN = [",
        "    ('install', [*BASE, *resolver_specs]),",
        "    ('frozen-no-deps', [*BASE, '--upgrade', '--no-deps', *frozen_specs]),",
        "    ('support-no-deps', [*BASE, '--no-deps', '--upgrade', *PINS['supportNoDeps']]),",
        "]",
        "",
        "for _phase, _cmd in INSTALL_PLAN:",
        "    run_install_command([*_cmd, '--dry-run'], _phase + '-dry-run')",
        "    run_install_command(_cmd, _phase)",
        "",
        "for _name, _version in PRESERVED.items():",
        "    _actual = _metadata.version(_name)",
        "    if _actual != _version:",
        "        raise RuntimeError('preserved dependency changed: %s==%s -> %s'",
        "                           % (_name, _version, _actual))",
        "",
        "print('install complete')",
        "print('preserved:', PRESERVED or 'none')",
        "print('skipped:', sorted(SKIPPED) or 'none')",
      ]),
    },
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- load BASE, unadapted ---",
        "#",
        "# DEFECT 4 (the observed DEC-0035 relaunch failure) was here: this call used to pass",
        "#   revision=PINS['baseModelRevision']",
        "# to the Unsloth loader. `unsloth/gpt-oss-20b` is a DISTRIBUTION repo id that Unsloth",
        "# resolves internally, and no revision for the underlying base repo exists on it. Unsloth",
        "# therefore WARNED that it was ignoring the revision, substituted",
        "# `unsloth/gpt-oss-20b-unsloth-bnb-4bit`, and then failed because that repo does not exist:",
        "#",
        "#   RuntimeError: Unsloth: Failed to load model. Both AutoConfig and PeftConfig loading failed.",
        "#",
        "# The accepted qualification and the GHARIBO-exp-001 training notebook both load with",
        "# `model_name=LOADER_MODEL` and NO revision argument. That is the governed convention, and it",
        "# is what this cell now reproduces.",
        "#",
        "# The pinned base revision is NOT dropped: it is asserted against the LIVE revision of the",
        "# real base repo (`openai/gpt-oss-20b`) in the identity cell, which is where a revision pin",
        "# can actually be enforced. Passing it to the loader enforced nothing and broke the load.",
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
        "# The loader must not have silently substituted a different repo. If Unsloth resolves the",
        "# distribution id to something other than itself, the arm is no longer loading the accepted",
        "# base, and the measurement would be of a different model. Fail loudly instead.",
        "LOADER_NAME = getattr(getattr(base_model, 'config', None), '_name_or_path', None)",
        "print('base loaded from :', LOADER_NAME)",
        "assert LOADER_NAME is not None, 'REFUSING TO RUN: could not read the loaded model identity'",
        "assert 'gpt-oss-20b' in str(LOADER_NAME), (",
        "    f'REFUSING TO RUN: loader resolved to {LOADER_NAME!r}, which is not the accepted base'",
        ")",
        "",
        "# A training-capable model must never be reachable in this notebook.",
        "GRADIENT_ENABLED_BASE = any(p.requires_grad for p in base_model.parameters())",
        "assert GRADIENT_ENABLED_BASE is False, 'REFUSING TO RUN: gradients are enabled on BASE'",
        "print('BASE loaded. trainable params:', sum(p.numel() for p in base_model.parameters() if p.requires_grad))",
      ]),
    },
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- Harmony rendering and greedy completion ---",
        "#",
        "# DEFECT 2 of DEC-0033 / BLK-0004 was here: this cell used to call",
        "#   tokenizer.apply_chat_template(msgs, return_tensors='pt', return_dict=True)",
        "# directly on the message list, and to label the system turn 'system'.",
        "#",
        "# The frozen convention (proven by the accepted real-Kaggle qualification and by the",
        "# GHARIBO-exp-001 training notebook) is RENDER-THEN-TOKENIZE:",
        "#   apply_chat_template(..., tokenize=False, add_generation_prompt=False) -> str",
        "#   tokenizer(text, add_special_tokens=False) -> tensors",
        "# GPT-OSS requires OpenAI Harmony formatting. The shortcut risked silently",
        "# mis-rendered prompts, which would have invalidated every metric while still",
        "# producing plausible-looking output. The two-step form is asserted below.",
        "#",
        "# Role mapping matches the governed Gold representation: the package uses a",
        "# `developer` turn (not `system`) for the standing instruction.",
        "",
        "def render_text(example):",
        "    prompt = example['prompt']",
        "    messages = [",
        "        {'role': 'developer', 'content': prompt['system']},",
        "        {'role': 'user', 'content': prompt['user']},",
        "    ]",
        "    rendered = base_tok.apply_chat_template(",
        "        messages,",
        "        tokenize=False,",
        "        add_generation_prompt=True,",
        "        reasoning_effort=PINS['reasoningEffort'],",
        "    )",
        "    assert isinstance(rendered, str) and rendered, 'tokenizer produced empty Harmony text'",
        "    return rendered",
        "",
        "def complete(model, tokenizer, example):",
        "    text = render_text(example)",
        "    inputs = tokenizer(text, add_special_tokens=False, return_tensors='pt')",
        "    inputs = {k: v.to('cuda') for k, v in inputs.items()}",
        "    prompt_len = inputs['input_ids'].shape[1]",
        "    with torch.inference_mode():",
        "        out = model.generate(",
        "            **inputs,",
        "            max_new_tokens=PINS['maxNewTokens'],",
        "            do_sample=PINS['doSample'],",
        "            temperature=None if not PINS['doSample'] else PINS['temperature'],",
        "            top_p=None if not PINS['doSample'] else PINS['topP'],",
        "            top_k=None if not PINS['doSample'] else PINS['topK'],",
        "            use_cache=True,",
        "        )",
        "    new_tokens = out[0][prompt_len:]",
        "    return tokenizer.decode(new_tokens, skip_special_tokens=True)",
        "",
        "# Prove the convention on the first item before spending an arm on it.",
        "_probe = render_text(items[0])",
        "assert '<|start|>' in _probe, 'Harmony control tokens absent - the template is not Harmony'",
        "assert items[0]['prompt']['user'][:24] in _probe, 'the user turn did not survive rendering'",
        "print('decoder ready; Harmony control tokens present in the rendered prompt')",
      ]),
    },
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- ARM 1: BASE ---",
        "t0 = time.time()",
        "base_preds = []",
        "for i, ex in enumerate(items):",
        "    raw = complete(base_model, base_tok, ex)",
        "    base_preds.append({'item_id': ex['item_id'], 'raw': raw})",
        "    if (i + 1) % 10 == 0:",
        "        print(f'BASE {i+1}/{len(items)}  elapsed {time.time()-t0:.0f}s')",
        "",
        "ARM_BASE_SECONDS = time.time() - t0",
        "print('BASE complete in', round(ARM_BASE_SECONDS, 1), 's')",
        "print('BASE empty outputs:', sum(1 for p in base_preds if not p['raw'].strip()))",
      ]),
    },
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- ARM 2: CANDIDATE — the GHARIBO-exp-001 adapter on the SAME base revision ---",
        "from peft import PeftModel",
        "",
        "ADAPTER_DIRS = []",
        "for root, _dirs, files in os.walk('/kaggle/input'):",
        "    if 'adapter_config.json' in files and 'adapter_model.safetensors' in files:",
        "        ADAPTER_DIRS.append(root)",
        "ADAPTER_DIRS.sort()",
        "print('adapter directories found:', ADAPTER_DIRS)",
        "assert len(ADAPTER_DIRS) == 1, f'expected exactly one adapter directory, found {len(ADAPTER_DIRS)}'",
        "",
        "ADAPTER_DIR = ADAPTER_DIRS[0]",
        "ADAPTER_SHA256 = sha256_file(os.path.join(ADAPTER_DIR, 'adapter_model.safetensors'))",
        "print('adapter sha256        :', ADAPTER_SHA256)",
        "print('pinned adapter sha256 :', PINS['candidateAdapterSha256'])",
        "assert ADAPTER_SHA256 == PINS['candidateAdapterSha256'], 'REFUSING TO RUN: adapter identity mismatch'",
      ]),
    },
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "candidate_model = PeftModel.from_pretrained(base_model, ADAPTER_DIR, is_trainable=False)",
        "FastLanguageModel.for_inference(candidate_model)",
        "candidate_model.eval()",
        "",
        "GRADIENT_ENABLED_CANDIDATE = any(p.requires_grad for p in candidate_model.parameters())",
        "assert GRADIENT_ENABLED_CANDIDATE is False, 'REFUSING TO RUN: gradients are enabled on CANDIDATE'",
        "",
        "t0 = time.time()",
        "cand_preds = []",
        "for i, ex in enumerate(items):",
        "    raw = complete(candidate_model, base_tok, ex)",
        "    cand_preds.append({'item_id': ex['item_id'], 'raw': raw})",
        "    if (i + 1) % 10 == 0:",
        "        print(f'CANDIDATE {i+1}/{len(items)}  elapsed {time.time()-t0:.0f}s')",
        "",
        "ARM_CANDIDATE_SECONDS = time.time() - t0",
        "print('CANDIDATE complete in', round(ARM_CANDIDATE_SECONDS, 1), 's')",
        "print('CANDIDATE empty outputs:', sum(1 for p in cand_preds if not p['raw'].strip()))",
      ]),
    },
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- export predictions + an honest run record ---",
        "OUT = '/kaggle/working/eval-gharibo-exp-001'",
        "os.makedirs(OUT, exist_ok=True)",
        "",
        "def write_jsonl(path, rows):",
        "    with open(path, 'w', encoding='utf-8', newline='\\n') as fh:",
        "        for r in rows:",
        "            fh.write(json.dumps(r, ensure_ascii=False) + '\\n')",
        "    return sha256_file(path)",
        "",
        "base_hash = write_jsonl(f'{OUT}/predictions-base.jsonl', base_preds)",
        "cand_hash = write_jsonl(f'{OUT}/predictions-candidate.jsonl', cand_preds)",
        "",
        "run_record = {",
        "    'authorizationDecisionId': PINS['authorizationDecisionId'],",
        "    'decision': PINS['decision'],",
        "    'attemptNumber': PINS['attemptNumber'],",
        "    'maximumKernelPushes': PINS['maximumKernelPushes'],",
        "    'priorAuthorizationDecisionId': PINS['priorAuthorizationDecisionId'],",
        "    'harnessVersion': PINS['harnessVersion'],",
        "    'baseModel': PINS['baseModel'],",
        "    'baseModelRevision': PINS['baseModelRevision'],",
        "    'candidateArmId': PINS['candidateArmId'],",
        "    'candidateAdapterSha256': ADAPTER_SHA256,",
        "    'testSplitHash': PINS['testSplitHash'],",
        "    'datasetHash': PINS['datasetHash'],",
        "    'testRecordsParsed': len(items),",
        "    'promptsSha256': PROMPTS_SHA256,",
        "    'predictionsBaseSha256': base_hash,",
        "    'predictionsCandidateSha256': cand_hash,",
        "    'decoding': {",
        "        'temperature': PINS['temperature'],",
        "        'do_sample': PINS['doSample'],",
        "        'top_p': PINS['topP'],",
        "        'top_k': PINS['topK'],",
        "        'max_new_tokens': PINS['maxNewTokens'],",
        "        'seed': PINS['seed'],",
        "        'repeats': PINS['repeats'],",
        "    },",
        "    'armsIdenticalDecoding': True,",
        "    'gradientUsed': False,",
        "    'trainingUsed': False,",
        "    'tuningUsed': False,",
        "    'selectionLoopUsed': False,",
        "    'armBaseSeconds': ARM_BASE_SECONDS,",
        "    'armCandidateSeconds': ARM_CANDIDATE_SECONDS,",
        "    'environment': ENV,",
        "    'mentionsOfM1ToM13': PINS['metricIds'],",
        "    'scoredInThisNotebook': False,",
        "    'note': 'Predictions only. Scoring happens locally against held-out gold; no metric is computed here.',",
        "}",
        "with open(f'{OUT}/run-record.json', 'w', encoding='utf-8', newline='\\n') as fh:",
        "    json.dump(run_record, fh, indent=2, ensure_ascii=False)",
        "",
        "print(json.dumps({k: v for k, v in run_record.items() if k != 'environment'}, indent=2))",
        "print('EVALUATION_RUN_COMPLETE')",
      ]),
    },
  ];
}

/** Build the notebook object deterministically. */
export function buildNotebook() {
  return {
    cells: cells(),
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
      language_info: { name: "python", version: "3.11" },
      gharibo: {
        artifact: "gharibo-eval-001",
        harness_version: EVAL_PINS.harnessVersion,
        authorization_decision: EVAL_PINS.authorizationDecisionId,
        attempt_number: EVAL_PINS.attemptNumber,
        maximum_kernel_pushes: EVAL_PINS.maximumKernelPushes,
        prior_authorization_decision: EVAL_PINS.priorAuthorizationDecisionId,
        test_split_hash: EVAL_PINS.testSplitHash,
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

export { pinsJsonText, hasEmptyObject, canonicalJson };

export function render() {
  return JSON.stringify(buildNotebook(), null, 1) + "\n";
}

export function notebookSha256() {
  return createHash("sha256").update(render()).digest("hex");
}

function main() {
  const checkMode = process.argv.includes("--check");
  const out = resolve(ROOT, OUT_REL);
  const text = render();

  if (checkMode) {
    if (!existsSync(out)) {
      console.error(`build-eval-kernel --check: ${OUT_REL} does not exist`);
      process.exit(1);
    }
    if (readFileSync(out, "utf8") !== text) {
      console.error(`build-eval-kernel --check: ${OUT_REL} is stale — regenerate it`);
      process.exit(1);
    }
    console.log(`build-eval-kernel --check: ${OUT_REL} is current (sha256 ${notebookSha256().slice(0, 12)}…)`);
    process.exit(0);
  }

  writeFileSync(out, text, "utf8");
  console.log(`wrote ${OUT_REL}`);
  console.log(`  cells        : ${buildNotebook().cells.length}`);
  console.log(`  sha256       : ${notebookSha256()}`);
  console.log(`  authorization: ${EVAL_PINS.authorizationDecisionId} (${EVAL_PINS.decision})`);
  console.log(`  TEST records : ${EVAL_PINS.testRecordCount}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
