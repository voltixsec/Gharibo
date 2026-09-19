/**
 * Repeats one arithmetic case several times so a model weakness is reported on
 * evidence rather than on a single answer.
 *
 * Usage: node repeat-arithmetic.mjs <baseUrl> [runs]
 */
import { setTimeout as sleep } from "node:timers/promises";

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const runs = Number(process.argv[3] ?? 3);

const PROMPT =
  "A product costs 42.50 per unit. We buy 240 units with a 7% volume discount. What is the total purchase cost? Show the arithmetic and end with the total.";
const CORRECT = 9486;

async function api(path, init) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function ask(conversationId, content) {
  const res = await fetch(`${base}/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (res.status !== 200) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const ev = JSON.parse(line);
        if (typeof ev.delta === "string") answer += ev.delta;
      } catch {
        /* ignore */
      }
    }
  }
  return answer;
}

const created = [];
let correct = 0;
const observed = [];

for (let i = 0; i < runs; i += 1) {
  const conv = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      title: `__arith_${i}__`,
      providerId: null,
      modelId: "GHARIBO-V1",
      temperature: 0.2,
      maxTokens: 256,
    }),
  });
  const id = conv.json?.data?.id;
  created.push(id);

  const t0 = Date.now();
  const answer = await ask(id, PROMPT);
  const ms = Date.now() - t0;

  // Every money figure the answer produced.
  const figures = [...answer.matchAll(/\$?\s?([\d,]+(?:\.\d+)?)/g)]
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((n) => n > 1000);

  const hit = figures.includes(CORRECT);
  if (hit) correct += 1;
  observed.push({ run: i + 1, ms, figures, hit });
  console.log(
    `run ${i + 1}: ${ms}ms  correct=${hit}  large-figures=${JSON.stringify(figures)}`,
  );
}

for (const id of created) {
  await api(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {});
}

console.log(`\n${correct}/${runs} produced the correct total (${CORRECT})`);
console.log("observed:", JSON.stringify(observed.map((o) => o.figures)));
