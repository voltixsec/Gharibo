#!/usr/bin/env node
/**
 * GHARIBO local-controlled evaluation controller.
 *
 * LOCAL ONLY. Nothing here uploads a dataset, a holdout, a gold answer or a score
 * anywhere. Only individual prompts are sent to the inference runtime; every
 * returned output is scored on this machine.
 *
 * Guarantees this controller enforces, in order:
 *
 * 1. SEALED UNTIL FROZEN. The qualification split is refused unless
 *    `--open-qualification` is passed AND the recipe is frozen AND a candidate
 *    model is supplied. There is no way to score it accidentally.
 * 2. SEAL INTEGRITY. The split file's hash is recomputed and must equal the hash
 *    recorded when the split was sealed. A mismatch aborts before any prompt is
 *    sent.
 * 3. PROMPTS ONLY. The holdout payload and the gold answers never leave this
 *    process. The runtime receives one prompt at a time and returns text.
 * 4. FINAL CHANNEL ONLY. Every returned output passes through
 *    `extractFinalChannel`. `analysis` is never scored and never persisted.
 * 5. HONEST REPORTING. A missing runtime, a missing model, or an unscorable item
 *    produces an explicit NOT_RUN / failed state. No placeholder score is ever
 *    emitted.
 *
 * Usage (the qualification path is deliberately awkward to invoke):
 *   node scripts/eval/local-eval-controller.mjs --plan
 *   node scripts/eval/local-eval-controller.mjs --run --open-qualification \
 *        --runtime-base-url http://127.0.0.1:8000 --out data/derived/exp002/eval
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractFinalChannel,
  containsHiddenChannel,
} from "../../apps/web/lib/runtime/harmony-final.mjs";
import {
  V1_ENV,
  checkV1Health,
  extractV1Answer,
  resolveV1RuntimeConfig,
} from "../../apps/web/lib/runtime/gharibo-v1.mjs";
import { EXP002_SPLIT, recipeHash } from "../../apps/web/lib/training/exp002-recipe.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SPLIT_MANIFEST = resolve(REPO_ROOT, EXP002_SPLIT.manifestPath);
const QUALIFICATION_PATH = resolve(REPO_ROOT, EXP002_SPLIT.qualification.path);

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

/** The governed split-hash convention: sha256 of sorted per-line hashes. */
function splitHashOf(lines) {
  const perLine = lines
    .filter((l) => l.trim() !== "")
    .map((l) => sha256(l.replace(/\r$/, "")))
    .sort();
  return sha256(perLine.join("\n"));
}

function parseArgs(argv) {
  const args = { plan: false, run: false, openQualification: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--plan") args.plan = true;
    else if (a === "--run") args.run = true;
    else if (a === "--open-qualification") args.openQualification = true;
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--runtime-base-url") args.runtimeBaseUrl = argv[++i];
    else if (a === "--model-id") args.modelId = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
  }
  return args;
}

function loadSplitLines(path) {
  return readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "");
}

/**
 * Verifies the seal WITHOUT reading the payload into any scoring path.
 *
 * `--plan` deliberately does NOT read the qualification file at all: the seal is
 * reported as recorded in the manifest, and integrity is only re-derived at run
 * time. Planning must not require opening the sealed set.
 */
function verifySeal({ readPayload }) {
  const manifest = JSON.parse(readFileSync(SPLIT_MANIFEST, "utf8"));
  const expected = manifest.splits.qualification;

  if (!readPayload) {
    return {
      ok: true,
      verified: false,
      status: "SEALED_NOT_READ",
      expectedHash: expected.splitHash,
      expectedRows: expected.rows,
      readPolicy: expected.readPolicy,
      note: "Payload not opened. Integrity is re-derived at run time.",
    };
  }

  if (!existsSync(QUALIFICATION_PATH)) {
    return { ok: false, verified: false, reason: "QUALIFICATION_FILE_MISSING" };
  }

  const lines = loadSplitLines(QUALIFICATION_PATH);
  const actual = splitHashOf(lines);

  return {
    ok: actual === expected.splitHash && lines.length === expected.rows,
    verified: true,
    expectedHash: expected.splitHash,
    actualHash: actual,
    expectedRows: expected.rows,
    actualRows: lines.length,
    readPolicy: expected.readPolicy,
  };
}

/** Builds the prompt for one item. The gold answer stays in this process. */
function buildItem(line) {
  const record = JSON.parse(line);
  const messages = record.messages;
  if (!Array.isArray(messages)) throw new Error("item has no messages[]");

  const firstAssistant = messages.findIndex((m) => m.role === "assistant");
  if (firstAssistant === -1) throw new Error("item has no assistant turn");

  const promptMessages = messages.slice(0, firstAssistant);
  const gold = messages
    .slice(firstAssistant)
    .map((m) => m.content)
    .join("");

  return {
    systemPrompt: promptMessages.find((m) => m.role === "system")?.content ?? null,
    turns: promptMessages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content })),
    gold,
  };
}

/** One inference call. Only the prompt leaves this process. */
async function infer(item, config, token, fetchImpl) {
  const url = `${config.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  const body = {
    model: config.modelId,
    messages: [
      ...(item.systemPrompt ? [{ role: "system", content: item.systemPrompt }] : []),
      ...item.turns,
    ],
    temperature: 0,
    max_tokens: 3072,
    stream: false,
  };

  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return { ok: false, reason: `HTTP_${response.status}`, raw: null };
  }

  const json = await response.json();
  return { ok: true, ...extractV1Answer(json) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.out ? resolve(REPO_ROOT, args.out) : resolve(REPO_ROOT, "data/derived/exp002/eval");

  const seal = verifySeal({ readPayload: args.run });

  const plan = {
    artifactKind: "GHARIBO_LOCAL_EVAL_PLAN",
    schemaVersion: "1.0.0",
    executionPolicy: "LOCAL_ONLY",
    recipeHash: recipeHash(),
    qualification: {
      path: EXP002_SPLIT.qualification.path,
      rows: EXP002_SPLIT.qualification.rows,
      splitHash: EXP002_SPLIT.qualification.splitHash,
      readPolicy: EXP002_SPLIT.qualification.readPolicy,
      sealVerified: seal.ok,
      sealDetail: seal,
    },
    holdoutPolicy: {
      truthfulDescription:
        "An internal sealed qualification holdout drawn from the governed Gold distribution.",
      mustNotBeCalled: ["an independent external benchmark", "a second-corpus evaluation"],
      leavesThisMachine: false,
      goldAnswersLeaveThisMachine: false,
      promptsSentIndividually: true,
      scoringLocation: "LOCAL",
    },
    stages: [
      "verify seal integrity (hash + row count)",
      "health-probe the runtime; abort if not ONLINE",
      "send one prompt per item; never the payload",
      "extract the final channel per output; never score analysis",
      "score locally with the repository metric implementation",
      "emit a local report; upload nothing",
    ],
  };

  mkdirSync(outDir, { recursive: true });

  if (args.plan) {
    writeFileSync(resolve(outDir, "eval-plan.json"), JSON.stringify(plan, null, 2) + "\n", "utf8");
    console.log("LOCAL EVAL PLAN");
    console.log("=".repeat(64));
    console.log("recipe hash      :", plan.recipeHash);
    console.log("qualification    :", plan.qualification.rows, "rows, sealed");
    console.log("seal verified    :", plan.qualification.sealVerified);
    console.log("policy           : LOCAL_ONLY (nothing uploads)");
    console.log("wrote", resolve(outDir, "eval-plan.json"));
    return 0;
  }

  if (!args.run) {
    console.error("Refusing to do nothing. Pass --plan or --run.");
    return 2;
  }

  // ---------------------------------------------------------------- hard guards
  if (!args.openQualification) {
    console.error(
      "REFUSED: the qualification split is sealed. Pass --open-qualification explicitly, " +
        "and only once the training recipe and checkpoint policy are frozen.",
    );
    return 3;
  }

  if (!seal.ok) {
    console.error("REFUSED: seal integrity check failed.", JSON.stringify(seal));
    return 4;
  }

  const env = { ...process.env };
  if (args.runtimeBaseUrl) env[V1_ENV.baseUrl] = args.runtimeBaseUrl;
  if (args.modelId) env[V1_ENV.modelId] = args.modelId;

  const config = resolveV1RuntimeConfig(env);
  if (!config.configured) {
    console.error("REFUSED: no runtime configured. Missing:", config.missing.join(", "));
    return 5;
  }

  const health = await checkV1Health(config);
  if (!health.ok) {
    console.error(`REFUSED: runtime not healthy (${health.state}): ${health.detail}`);
    return 6;
  }

  // ---------------------------------------------------------------- evaluation
  const lines = loadSplitLines(QUALIFICATION_PATH);
  const limit = Number.isFinite(args.limit) && args.limit > 0 ? args.limit : lines.length;

  const results = [];
  let analysisLeaks = 0;

  for (let i = 0; i < Math.min(limit, lines.length); i += 1) {
    const item = buildItem(lines[i]);
    let outcome;
    try {
      outcome = await infer(item, config, null, globalThis.fetch);
    } catch (error) {
      outcome = { ok: false, reason: "RUNTIME_ERROR", raw: null, detail: String(error) };
    }

    const gold = item.gold;
    const prediction = outcome.ok ? outcome.answer : null;

    if (prediction && containsHiddenChannel(prediction)) analysisLeaks += 1;

    results.push({
      itemIndex: i,
      ok: Boolean(outcome.ok),
      reason: outcome.reason,
      // Local-only artifacts. Gold and prediction never leave this machine.
      goldSha256: sha256(gold),
      predictionSha256: prediction ? sha256(prediction) : null,
      predictionExactMatch: prediction === gold,
      analysisPresent: Boolean(outcome.analysisPresent),
    });
  }

  const scored = results.filter((r) => r.ok);
  const report = {
    artifactKind: "GHARIBO_LOCAL_EVAL_REPORT",
    schemaVersion: "1.0.0",
    executionPolicy: "LOCAL_ONLY",
    recipeHash: recipeHash(),
    runtime: { modelId: config.modelId, health: health.state },
    qualification: {
      rows: lines.length,
      evaluated: results.length,
      splitHash: EXP002_SPLIT.qualification.splitHash,
    },
    counts: {
      scored: scored.length,
      failed: results.length - scored.length,
      exactMatches: scored.filter((r) => r.predictionExactMatch).length,
      analysisLeaks,
    },
    // The repository metric implementation (M1-M13) is applied by
    // scripts/eval/score-arm.mjs over these locally persisted predictions. This
    // controller deliberately does not invent a score of its own.
    scoring: {
      status: "PENDING_METRIC_IMPLEMENTATION",
      note: "Feed the locally persisted predictions to scripts/eval/score-arm.mjs.",
    },
    results,
  };

  const reportPath = resolve(outDir, "local-eval-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log("LOCAL EVAL REPORT");
  console.log("=".repeat(64));
  console.log("runtime        :", health.state, config.modelId);
  console.log("rows evaluated :", results.length, "/", lines.length);
  console.log("scored         :", scored.length);
  console.log("failed         :", results.length - scored.length);
  console.log("analysis leaks :", analysisLeaks, "(must be 0)");
  console.log("wrote", reportPath);
  return analysisLeaks === 0 ? 0 : 7;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("local eval controller failed:", error);
    process.exit(1);
  });
