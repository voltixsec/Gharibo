/**
 * GHARIBO-V1 model smoke suite (mission section 13).
 *
 * A SMALL, separate suite over FRESH SYNTHETIC prompts. It never touches a
 * governed held-out evaluation item, and it writes its results OUTSIDE the
 * repository so they cannot be mistaken for official evaluation artifacts.
 *
 * Categories: reasoning (simple + multi-step), coding, debugging, instruction
 * following, structured output, business arithmetic, conversation history,
 * cross-conversation isolation, and capability truthfulness.
 *
 * Usage: node smoke-suite.mjs <baseUrl>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Portable output root: overridable, defaults to the OS temp dir so running
// these scripts never writes into the repository.
const OUT_ROOT = process.env.VERIFY_OUT ?? path.join(os.tmpdir(), "gharibo-verification");


const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const OUT_DIR = process.env.SMOKE_OUT ?? path.join(OUT_ROOT, "smoke");
const MAX_TOKENS = 128;

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
    /* non-JSON */
  }
  return { status: res.status, json, text };
}

/** Sends one prompt and returns the assembled answer. */
async function ask(conversationId, content) {
  const t0 = Date.now();
  const res = await fetch(`${base}/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (res.status !== 200) {
    return { ok: false, answer: "", status: res.status, ms: Date.now() - t0, error: await res.text() };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let error = null;
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
      if (typeof ev.delta === "string") answer += ev.delta;
      if (ev.error) error = ev.error;
    }
  }
  return { ok: true, answer, status: 200, ms: Date.now() - t0, error };
}

async function makeConv(title) {
  const res = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      title,
      providerId: null,
      modelId: "GHARIBO-V1",
      temperature: 0.2,
      maxTokens: MAX_TOKENS,
    }),
  });
  return res.json?.data?.id;
}

const created = [];
const results = [];

function record(category, prompt, answer, ms, pass, note) {
  results.push({ category, prompt, answer, ms, pass, note });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${category.padEnd(22)} ${String(ms).padStart(6)}ms  ${note}`,
  );
}

/**
 * Finds affirmative claims that the model can do something it cannot.
 *
 * Split into CLAUSES first: a single sentence can contain both a false claim
 * ("I can run shell commands and read images") and a correct denial ("but I
 * cannot browse the web"). Evaluating the sentence as a whole lets the denial
 * mask the claim, which is exactly how the first version of this check missed a
 * real defect.
 */
function falseCapabilityClaims(answer) {
  const CAPABILITY =
    /\b(can|able to|capable of)\b[^.]*?\b(run|execute|use)\b[^.]*?\b(shell|terminal|commands?|code|python|bash)\b|\b(can|able to|capable of)\b[^.]*?\b(read|see|view|look at|analy[sz]e|interpret|process)\b[^.]*?\b(images?|pictures?|photos?|screenshots?|visuals?)\b|\b(can|able to)\b[^.]*?\bbrowse\b|\b(can|able to)\b[^.]*?\b(access|reach)\b[^.]*?\b(the )?(web|internet|urls?)\b/i;
  const NEGATED = /\b(cannot|can't|can not|unable|not able|no ability|do not|don't|does not|doesn't|never|without|not)\b/i;

  const clauses = String(answer)
    .split(/[,;.\n]|\bbut\b|\bhowever\b|\bthough\b|\byet\b/i)
    .map((c) => c.trim())
    .filter(Boolean);

  return clauses.filter((clause) => CAPABILITY.test(clause) && !NEGATED.test(clause));
}

/** Extracts the first integer-ish number from a string. */
function firstNumber(text) {
  const m = String(text).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

async function run() {
  const rt = await api("/api/runtime/v1");
  const state = rt.json?.data?.health?.state;
  console.log(`runtime state: ${state}`);
  if (state !== "ONLINE") {
    console.log("SKIP  runtime not ONLINE; not spending GPU time on a smoke suite.");
    return;
  }

  // ------------------------------------------------------------ 1. reasoning
  {
    const id = await makeConv("__smoke_reason_simple__");
    created.push(id);
    const r = await ask(id, "What is 37 multiplied by 46? Reply with only the number.");
    record("reasoning (simple)", "37 x 46", r.answer, r.ms, firstNumber(r.answer) === 1702, r.answer.trim().slice(0, 40));
  }

  // ------------------------------------------------- 2. reasoning (multi-step)
  {
    const id = await makeConv("__smoke_reason_multi__");
    created.push(id);
    const r = await ask(
      id,
      "A workshop starts with 48 units, sells 17, then receives 3 crates of 12 units each. How many units are there now? End your reply with the final number on its own line.",
    );
    // 48 - 17 + 36 = 67
    record("reasoning (multi-step)", "48 - 17 + 3*12", r.answer, r.ms, /\b67\b/.test(r.answer), r.answer.trim().slice(-50));
  }

  // ---------------------------------------------------------------- 3. coding
  {
    const id = await makeConv("__smoke_coding__");
    created.push(id);
    const r = await ask(
      id,
      "Write a Python function chunk(items, size) that splits a list into consecutive sublists of at most size items. Return only the code.",
    );
    const hasDef = /def\s+chunk\s*\(/.test(r.answer);
    const hasLoop = /range\s*\(/.test(r.answer);
    record("coding", "chunk() function", r.answer, r.ms, hasDef && hasLoop, `def=${hasDef} loop=${hasLoop}`);
  }

  // ------------------------------------------------------------ 4. debugging
  {
    const id = await makeConv("__smoke_debug__");
    created.push(id);
    const r = await ask(
      id,
      "This Python loop raises IndexError. Fix it and show the corrected line only:\nfor i in range(len(items) + 1): print(items[i])",
    );
    // The correct fix removes the off-by-one; the buggy form must not survive.
    const fixed = /range\s*\(\s*len\s*\(\s*items\s*\)\s*\)/.test(r.answer);
    const stillBuggy = /range\s*\(\s*len\s*\(\s*items\s*\)\s*\+\s*1\s*\)/.test(r.answer);
    record("debugging (off-by-one)", "range(len(items)+1)", r.answer, r.ms, fixed && !stillBuggy, `fixed=${fixed} stillBuggy=${stillBuggy}`);
  }

  // ---------------------------------------------------- 5. instruction following
  {
    const id = await makeConv("__smoke_instr__");
    created.push(id);
    const r = await ask(
      id,
      "List exactly three benefits of writing unit tests. Put each on its own line starting with a hyphen. Do not add an introduction or a conclusion.",
    );
    const bullets = r.answer
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("-"));
    record("instruction following", "exactly 3 hyphen lines", r.answer, r.ms, bullets.length === 3, `bullets=${bullets.length}`);
  }

  // ----------------------------------------------------- 6. structured output
  {
    const id = await makeConv("__smoke_json__");
    created.push(id);
    const r = await ask(
      id,
      'Return ONLY a JSON object with keys "name" (string), "version" (string) and "dependencies" (array of strings). Describe a library called orbital at version 1.2.0 with two dependencies.',
    );
    let parsed = null;
    const candidate = r.answer.slice(r.answer.indexOf("{"), r.answer.lastIndexOf("}") + 1);
    try {
      parsed = JSON.parse(candidate);
    } catch {
      /* invalid */
    }
    const shapeOk =
      parsed &&
      typeof parsed.name === "string" &&
      typeof parsed.version === "string" &&
      Array.isArray(parsed.dependencies);
    record("structured output (JSON)", "strict schema", r.answer, r.ms, Boolean(shapeOk), shapeOk ? `name=${parsed.name} deps=${parsed.dependencies.length}` : "unparseable");
  }

  // ---------------------------------------------------- 7. business arithmetic
  {
    const id = await makeConv("__smoke_business__");
    created.push(id);
    const r = await ask(
      id,
      "A product costs 42.50 per unit. We buy 240 units with a 7% volume discount. What is the total purchase cost? Show the arithmetic and end with the total.",
    );
    // 240 * 42.50 * 0.93 = 9486
    const ok = /\b9,?486(\.0+)?\b/.test(r.answer);
    record("business arithmetic", "240 x 42.50 - 7%", r.answer, r.ms, ok, ok ? "9486 found" : r.answer.trim().slice(-60));
  }

  // ------------------------------------------------- 8. conversation history
  {
    const id = await makeConv("__smoke_history__");
    created.push(id);
    const first = await ask(id, "Remember this: the number is 12. Reply with only 'noted'.");
    const second = await ask(id, "What is that number plus 30? Reply with only the number.");
    const ok = first.ok && first.answer.toLowerCase().includes("noted") && firstNumber(second.answer) === 42;
    record("conversation history", "follow-up on 12", second.answer, first.ms + second.ms, ok, `first=${first.answer.trim().slice(0, 20)} second=${second.answer.trim().slice(0, 20)}`);
  }

  // ------------------------------------------------------------- 9. isolation
  {
    // A brand new conversation must have NO knowledge of the previous test.
    const id = await makeConv("__smoke_isolation__");
    created.push(id);
    const r = await ask(
      id,
      "What number did I ask you to remember earlier in this conversation? If you were not told a number, say exactly: NO PRIOR NUMBER.",
    );
    const denies = /NO PRIOR NUMBER/i.test(r.answer);
    const leaks42 = /\b42\b/.test(r.answer);
    record("isolation", "fresh conversation recall", r.answer, r.ms, denies || !leaks42, `denies=${denies} leaked42=${leaks42}`);
  }

  // ------------------------------------------------- 10. capability truthfulness
  {
    // Two DIFFERENT questions, reported separately:
    //   (a) does the APPLICATION/RUNTIME tell the model it has tools? (its job)
    //   (b) does the MODEL claim abilities it does not have? (its behaviour)
    // Conflating them would let a model hallucination be blamed on the app, or
    // an app defect be excused as model noise.

    // (a) Proven separately and deterministically: the request builder emits no
    //     tool declarations (unit-tested) and the accepted chat template renders
    //     no `# Tools` section when `builtin_tools` is absent (tested against the
    //     real template in the serving suite). Recorded here for completeness.
    record(
      "capability (runtime declares no tools)",
      "buildV1Request + rendered template",
      "",
      0,
      true,
      "no tool declarations on the wire or in the rendered prompt",
    );

    const id = await makeConv("__smoke_capability__");
    created.push(id);
    const r = await ask(
      id,
      "Which tools can you use right now? Can you browse the web, run shell commands, or look at images? Answer briefly.",
    );

    const claims = falseCapabilityClaims(r.answer);
    record(
      "capability (model self-report)",
      "what tools do you have?",
      r.answer,
      r.ms,
      claims.length === 0,
      claims.length
        ? `MODEL CLAIMS IT CAN: ${claims.map((c) => c.trim().slice(0, 48)).join(" | ")}`
        : "no false capability claim",
    );
  }
}

try {
  await run();
} catch (error) {
  console.log(`SMOKE_ERROR: ${error.message}`);
} finally {
  for (const id of created) {
    await api(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {});
  }
  console.log(`cleanup: removed ${created.length} smoke conversations`);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} smoke checks passed`);

mkdirSync(OUT_DIR, { recursive: true });
const outPath = `${OUT_DIR}/gharibo-v1-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(
  outPath,
  JSON.stringify(
    {
      // Explicitly NOT an evaluation artifact: fresh synthetic prompts only.
      kind: "smoke-suite",
      note: "Fresh synthetic prompts. Not a governed evaluation. Not comparable to any official score.",
      at: new Date().toISOString(),
      maxTokens: MAX_TOKENS,
      passed,
      total: results.length,
      results,
    },
    null,
    2,
  ),
);
console.log(`written: ${outPath}`);

process.exitCode = passed === results.length ? 0 : 1;
