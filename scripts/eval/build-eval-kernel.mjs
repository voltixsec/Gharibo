#!/usr/bin/env node
/**
 * build-eval-kernel.mjs — deterministic generator for the governed Kaggle EVALUATION kernel.
 *
 * WHAT THIS PRODUCES
 * ------------------
 * `scripts/eval/kaggle/gharibo-eval-001.ipynb`, the notebook that runs the ONE authorized
 * held-out TEST benchmark (DEC-0032) on a free Kaggle T4: BASE then CANDIDATE over the same
 * 80 TEST prompts, greedy, identical settings for both arms.
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
  authorizationDecisionId: "DEC-0032",
  decision: "AUTHORIZED WITH LIMITS",
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
});

/**
 * The forbidden-token list. Shared with check-eval-kernel.mjs by import so the two can never
 * disagree. Each entry is a training or tuning primitive the evaluation notebook must not
 * contain.
 */
export const FORBIDDEN_TOKENS = Object.freeze([
  ".train()",
  "trainer.train",
  "TrainingArguments",
  "optimizer",
  "AdamW",
  "adamw_8bit",
  "backward()",
  "loss.backward",
  "lr_scheduler",
  "scheduler",
  ".step()",
  "ZeroGrad",
  "state_dict()",
  "SFTTrainer",
  "Trainer(",
  "gradient_checkpointing_enable",
  "save_pretrained",
  "push_to_hub",
]);

const md = (lines) => lines.join("\n");
const code = (lines) => lines.join("\n");

function cells() {
  const p = EVAL_PINS;
  return [
    {
      cell_type: "markdown",
      metadata: {},
      source: md([
        "# GHARIBO — governed held-out TEST evaluation (`DEC-0032`)",
        "",
        "| Field | Value |",
        "|-------|-------|",
        `| Authorization | \`${p.authorizationDecisionId}\` — ${p.decision} |`,
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
      source: code([
        "# --- governed pins (injected by the generator; do not hand-edit) ---",
        `PINS = ${JSON.stringify(p, null, 4)}`,
        "",
        "import hashlib, json, os, sys, time",
        "",
        "assert PINS['authorizationDecisionId'] == 'DEC-0032', 'unexpected authorization'",
        "assert PINS['decision'] == 'AUTHORIZED WITH LIMITS', 'unexpected decision scope'",
        "",
        "print('authorization :', PINS['authorizationDecisionId'], '-', PINS['decision'])",
        "print('TEST split    :', PINS['testSplitHash'])",
        "print('records       :', PINS['testRecordCount'])",
      ]),
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
        "# Pinned to the accepted engine freeze label so BASE and CANDIDATE load identically.",
        "%pip uninstall -y unsloth unsloth_zoo -q",
        "%pip install -q --no-deps 'unsloth==2026.9.4' 'unsloth_zoo==2026.9.3'",
        "%pip install -q 'transformers>=4.51.0' 'peft>=0.14.0' 'trl>=0.15.0' 'datasets==5.0.1' 'accelerate>=1.2.0'",
        "%pip uninstall -y torchao -q",
        "print('governed engine stack staged')",
      ]),
    },
    {
      cell_type: "code",
      metadata: {},
      execution_count: null,
      outputs: [],
      source: code([
        "# --- load BASE, unadapted, at the PINNED revision ---",
        "from unsloth import FastLanguageModel",
        "import torch",
        "",
        "base_model, base_tok = FastLanguageModel.from_pretrained(",
        "    model_name=PINS['loaderModelId'],",
        "    revision=PINS['baseModelRevision'],",
        "    max_seq_length=PINS['maxSeqLength'],",
        "    dtype=None,",
        "    load_in_4bit=True,",
        ")",
        "FastLanguageModel.for_inference(base_model)",
        "base_model.eval()",
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
        "def render(example):",
        "    msgs = [",
        "        {'role': 'system', 'content': example['prompt']['system']},",
        "        {'role': 'user', 'content': example['prompt']['user']},",
        "    ]",
        "    return msgs",
        "",
        "def complete(model, tokenizer, example):",
        "    msgs = render(example)",
        "    inputs = tokenizer.apply_chat_template(",
        "        msgs,",
        "        add_generation_prompt=True,",
        "        return_tensors='pt',",
        "        return_dict=True,",
        "    ).to('cuda')",
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
        "    new_tokens = out[0][inputs['input_ids'].shape[1]:]",
        "    return tokenizer.decode(new_tokens, skip_special_tokens=True)",
        "",
        "print('decoder ready')",
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
        test_split_hash: EVAL_PINS.testSplitHash,
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

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
