/**
 * Live GHARIBO-V1 end-to-end inference check.
 *
 * Runs ONE small, synthetic prompt (never a governed held-out evaluation item)
 * against the real runtime, and verifies the whole application path:
 *   routing -> inference -> Harmony final-channel extraction -> persistence.
 *
 * Also verifies the privacy contract: the hidden `analysis` channel must never
 * appear in the streamed answer or in what was persisted.
 *
 * The conversation it creates is deleted afterwards.
 *
 * Usage: node live-check.mjs <baseUrl>
 */
const base = process.argv[2] ?? "http://localhost:3100";

const results = [];
const record = (name, pass, detail) =>
  results.push({ name, pass, detail }) && console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);

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

let conversationId = null;

try {
  // ---------------------------------------------------- runtime reachable?
  const runtime = await api("/api/runtime/v1");
  const state = runtime.json?.data?.health?.state;
  console.log(`runtime state: ${state}`);
  if (state !== "ONLINE") {
    console.log("SKIP  runtime is not ONLINE; no inference attempted (avoids waking a cold GPU).");
    process.exit(0);
  }

  // --------------------------------------------------------- create + send
  const created = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      title: "__live_check__",
      providerId: null,
      modelId: "GHARIBO-V1",
      systemPrompt: null,
      temperature: 0.2,
      maxTokens: 64,
    }),
  });
  conversationId = created.json?.data?.id;
  if (!conversationId) throw new Error(`could not create conversation: ${created.text.slice(0, 200)}`);

  record("a V1-routed conversation is created", true, `id=${conversationId.slice(0, 8)}…`);

  // A synthetic arithmetic prompt — never a governed evaluation item.
  const prompt = "What is 17 + 25? Reply with only the number.";
  const started = Date.now();
  const send = await fetch(`${base}/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: prompt }),
  });
  const ttfbMs = Date.now() - started;
  const raw = await send.text();
  const totalMs = Date.now() - started;

  record("the message endpoint accepted the request", send.status === 200, `status=${send.status}`);
  console.log(`timing: ttfb≈${ttfbMs}ms total=${totalMs}ms`);

  // ------------------------------------------------------- stream contract
  const events = raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const statusEvent = events.find((e) => e.status);
  const deltaEvents = events.filter((e) => typeof e.delta === "string");
  const errorEvent = events.find((e) => e.error);
  const answer = deltaEvents.map((e) => e.delta).join("");

  record("a truthful progress event precedes the answer", !!statusEvent, statusEvent?.status);
  record("exactly one terminal delta carries the answer", deltaEvents.length === 1, `deltas=${deltaEvents.length}`);
  record("no error event was emitted", !errorEvent, errorEvent?.error?.message);
  record("the answer is non-empty", answer.trim().length > 0, JSON.stringify(answer.slice(0, 80)));

  // ------------------------------------------------------- privacy contract
  const leaks = [
    "<|channel|>",
    "<|message|>",
    "<|start|>",
    "<|return|>",
    "<|end|>",
    "analysis",
    "commentary",
  ].filter((marker) => answer.includes(marker));
  record("the hidden Harmony channel never reaches the client", leaks.length === 0, `leaks=${leaks.join(",") || "none"}`);

  // ---------------------------------------------------------- persistence
  const loaded = await api(`/api/conversations/${conversationId}`);
  const messages = loaded.json?.data?.messages ?? [];
  record("the user turn was persisted once", messages.filter((m) => m.role === "user").length === 1, `count=${messages.filter((m) => m.role === "user").length}`);
  record("the assistant turn was persisted once", messages.filter((m) => m.role === "assistant").length === 1, `count=${messages.filter((m) => m.role === "assistant").length}`);
  record("messages are ordered user then assistant", messages[0]?.role === "user" && messages[1]?.role === "assistant", messages.map((m) => m.role).join(","));

  const persisted = messages.find((m) => m.role === "assistant");
  record("the persisted answer matches the streamed answer", persisted?.content === answer, `persisted=${JSON.stringify((persisted?.content ?? "").slice(0, 60))}`);
  record("the persisted answer carries the V1 model identity", persisted?.modelId === "GHARIBO-V1", `modelId=${persisted?.modelId}`);
  record("the persisted answer carries no provider FK for the sentinel runtime", persisted?.providerId === null, `providerId=${persisted?.providerId}`);

  // ------------------------------------------------------------ isolation
  const created2 = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ title: "__live_check_iso__", providerId: null, modelId: "GHARIBO-V1", maxTokens: 64 }),
  });
  const isoId = created2.json?.data?.id;
  const isoLoaded = await api(`/api/conversations/${isoId}`);
  record(
    "a new conversation starts with zero history",
    (isoLoaded.json?.data?.messages ?? []).length === 0,
    `messages=${isoLoaded.json?.data?.messages?.length}`,
  );
  await api(`/api/conversations/${isoId}`, { method: "DELETE" });

  console.log(`\nanswer: ${JSON.stringify(answer.slice(0, 200))}`);
} catch (error) {
  record("live check completed without throwing", false, error.message);
} finally {
  if (conversationId) {
    await api(`/api/conversations/${conversationId}`, { method: "DELETE" }).catch(() => {});
    console.log("cleanup: removed the live-check conversation");
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} live checks passed`);
process.exitCode = failed.length === 0 ? 0 : 1;
