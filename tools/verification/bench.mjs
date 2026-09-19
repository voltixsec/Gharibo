/**
 * GHARIBO-V1 serving benchmark.
 *
 * Measures what the application actually experiences: health probe latency and
 * warm inference latency across a small matrix of synthetic smoke prompts and
 * output-token budgets.
 *
 * Governance: these are FRESH SYNTHETIC prompts. No governed held-out
 * evaluation item is used for latency tuning (the repository forbids that).
 *
 * Usage: node bench.mjs <baseUrl> [label]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import os from "node:os";
import path from "node:path";

// Portable output root: overridable, defaults to the OS temp dir so running this
// never writes into the repository.
const OUT_ROOT = process.env.VERIFY_OUT ?? path.join(os.tmpdir(), "gharibo-verification");

const base = process.argv[2] ?? "http://localhost:3100";
const label = process.argv[3] ?? "run";
const outDir = process.env.BENCH_OUT ?? path.join(OUT_ROOT, "bench");

const PROMPTS = [
  {
    kind: "tiny",
    text: "What is 17 + 25? Reply with only the number.",
  },
  {
    kind: "reasoning",
    text: "A workshop starts with 48 units, sells 17, then receives 3 crates of 12. How many units are there now? Show the steps briefly.",
  },
  {
    kind: "code",
    text: "Write a Python function chunk(items, size) that splits a list into consecutive sublists of at most size items. Return only the code.",
  },
];

const TOKEN_BUDGETS = [64, 128, 256];

async function api(path, init) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text };
}

async function timeHealth() {
  const t0 = performance.now();
  const res = await api("/api/runtime/v1");
  const ms = Math.round(performance.now() - t0);
  return { ms, state: res.json?.data?.health?.state ?? "unknown" };
}

async function runOne(prompt, maxTokens) {
  const created = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      title: `__bench_${prompt.kind}_${maxTokens}__`,
      providerId: null,
      modelId: "GHARIBO-V1",
      temperature: 0.2,
      maxTokens,
    }),
  });
  const id = created.json?.data?.id;
  if (!id) return { kind: prompt.kind, maxTokens, ok: false, note: "create failed" };

  const t0 = performance.now();
  let status = 0;
  let ttfbMs = null;
  let answer = "";
  let errorCode = null;
  try {
    const res = await fetch(`${base}/api/conversations/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: prompt.text }),
    });
    status = res.status;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        if (ttfbMs === null && (ev.status || typeof ev.delta === "string")) {
          ttfbMs = Math.round(performance.now() - t0);
        }
        if (typeof ev.delta === "string") answer += ev.delta;
        if (ev.error) errorCode = ev.error.code ?? "ERROR";
      }
    }
  } catch (e) {
    errorCode = `TRANSPORT:${e.message}`;
  }
  const totalMs = Math.round(performance.now() - t0);

  // Confirm what was actually persisted.
  const loaded = await api(`/api/conversations/${id}`);
  const persisted = (loaded.json?.data?.messages ?? []).filter((m) => m.role === "assistant").length;

  await api(`/api/conversations/${id}`, { method: "DELETE" });

  return {
    kind: prompt.kind,
    maxTokens,
    ok: status === 200 && !errorCode && answer.trim().length > 0,
    status,
    ttfbMs,
    totalMs,
    answerChars: answer.length,
    persisted,
    errorCode,
  };
}

const rows = [];

console.log(`=== ${label} ===`);
const cold = await timeHealth();
console.log(`health probe #1: ${cold.ms}ms state=${cold.state}`);
const warm = await timeHealth();
console.log(`health probe #2: ${warm.ms}ms state=${warm.state}`);

if (warm.state !== "ONLINE") {
  console.log("runtime is not ONLINE — skipping inference benchmark to avoid waking a cold GPU");
  writeFileSync(
    `${outDir}/${label}.json`,
    JSON.stringify({ label, health: { cold, warm }, rows: [], note: "runtime not online" }, null, 2),
  );
  process.exit(0);
}

for (const prompt of PROMPTS) {
  for (const maxTokens of TOKEN_BUDGETS) {
    const row = await runOne(prompt, maxTokens);
    rows.push(row);
    console.log(
      `${row.kind.padEnd(10)} max=${String(row.maxTokens).padStart(3)}  ` +
        `status=${row.status}  ttfb=${row.ttfbMs ?? "-"}ms  total=${row.totalMs}ms  ` +
        `chars=${row.answerChars}  persisted=${row.persisted}  ${row.ok ? "OK" : `FAIL(${row.errorCode ?? row.status})`}`,
    );
  }
}

writeFileSync(
  `${outDir}/${label}.json`,
  JSON.stringify({ label, at: new Date().toISOString(), health: { cold, warm }, rows }, null, 2),
);
console.log(`\nwritten: ${outDir}/${label}.json`);
