/**
 * Provider routing, proven through the UI (mission section 12, item E / L).
 *
 * The headline requirement: "No provider choice is cosmetic-only."
 *
 * This drives the real inspector control: create a conversation (defaults to
 * GHARIBO-V1), switch it to another configured provider, send a message, and read
 * the route's own `{"status":"generating","modelId":...}` event. That event is
 * emitted by the server AFTER the routing decision, so its `modelId` is direct
 * evidence of which provider was used — it cannot be faked by the client.
 *
 * Upstream availability is reported separately: on a machine where the provider's
 * model is not pulled (or an API key is absent) the generation itself may fail,
 * but the routing decision is still observable and still asserted. Verifying
 * "which provider was chosen" and "did it answer" as one check would silently
 * pass a failed request (this exact mistake was made earlier in api-checks, which
 * asserted only "not V1" on a call that had failed with GENERATION_FAILED).
 *
 * Costs no Modal GPU time: it targets a locally configured provider.
 *
 * Usage: node provider-routing.mjs <baseUrl> [theme]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].find((p) => existsSync(p));

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const theme = process.argv[3] ?? "dark";
const port = 8800 + Math.floor(Math.random() * 80);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${process.env.TEMP}/gharibo-prov-${port}`,
    "--no-first-run",
    "--no-proxy-server",
    "--proxy-bypass-list=*",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function waitForChrome() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  throw new Error("chrome did not start");
}

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

/**
 * Sends a message and returns BOTH the routed model id (from the server's own
 * status event) and whether the upstream actually produced an answer.
 */
async function ask(id, content) {
  const res = await fetch(`${base}/api/conversations/${id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  const out = { status: res.status, routedModelId: null, answered: false, answer: "", error: null };

  if (res.status !== 200) return out;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const ev = JSON.parse(line);
        // Emitted by the server after the routing decision.
        if (ev.status === "generating" && ev.modelId) out.routedModelId = ev.modelId;
        if (typeof ev.delta === "string") out.answer += ev.delta;
        if (ev.error) out.error = ev.error.code || "ERROR";
      } catch {
        /* ignore */
      }
    }
  }
  out.answered = out.answer.trim().length > 0 && !out.error;
  return out;
}

let ws;
let convId = null;

try {
  await waitForChrome();
  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })
  ).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener("open", r, { once: true });
    ws.addEventListener("error", j, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  });
  const send = (method, params = {}) => {
    const id = nextId++;
    return new Promise((res, rej) => {
      pending.set(id, { resolve: res, reject: rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    return r.result?.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });

  // Pick an active provider that is NOT the V1 runtime sentinel.
  const providers = ((await api("/api/providers")).json?.data || []).filter((p) => p.isActive);
  if (!providers.length) {
    console.log("SKIP: no active provider configured.");
    ws.close();
    chrome.kill();
    process.exit(0);
  }
  // Prefer one whose endpoint is local (no external API key needed).
  const provider =
    providers.find((p) => /localhost|127\.0\.0\.1/.test(p.baseUrl || "")) || providers[0];
  const label = provider.displayName || provider.modelId;
  console.log(`target provider: ${label} (${provider.provider} / ${provider.modelId} @ ${provider.baseUrl})\n`);

  // ------------------------------------------------- create via the UI
  await send("Page.navigate", { url: `${base}/playground` });
  await sleep(8000);

  await ev(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').includes('New conversation'));
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(2500);

  convId = (await api("/api/conversations")).json?.data?.[0]?.id;
  check("a conversation was created through the UI", Boolean(convId), convId ? convId.slice(0, 8) : "none");

  const initial = (await api(`/api/conversations/${convId}`)).json?.data;
  check(
    "a new conversation defaults to GHARIBO-V1",
    initial?.providerId === null && initial?.modelId === "GHARIBO-V1",
    `providerId=${initial?.providerId}, modelId=${initial?.modelId}`,
  );

  // ------------------------------------- switch provider via the inspector
  const opened = await ev(`(() => {
    const t = document.querySelector('[role="combobox"]');
    if (!t) return 'no-combobox';
    t.click();
    return 'opened';
  })()`);
  check("the inspector model selector opens", opened === "opened", opened);

  let chosen = "not-found";
  for (let attempt = 0; attempt < 3 && chosen !== "clicked"; attempt += 1) {
    chosen = await ev(`(() => {
      const opts = Array.from(document.querySelectorAll('[role="option"]'));
      const hit = opts.find((o) => (o.textContent || '').includes(${JSON.stringify(label)}));
      if (!hit) return 'not-found';
      hit.click();
      return 'clicked';
    })()`);
    if (chosen !== "clicked") await sleep(700);
  }
  check(`the "${label}" option can be selected`, chosen === "clicked", chosen);
  await sleep(2500);

  const switched = (await api(`/api/conversations/${convId}`)).json?.data;
  check(
    "the selection persists that provider's id (not the V1 sentinel)",
    switched?.providerId === provider.id,
    `providerId=${switched?.providerId}`,
  );
  check(
    "the model id follows the selection",
    switched?.modelId === provider.modelId,
    `modelId=${switched?.modelId}`,
  );

  // ------------------------------------------ send and read the routing
  const r = await ask(convId, "Reply with exactly: ROUTED_OK");

  check(
    "the request was accepted by the route",
    r.status === 200,
    `HTTP ${r.status}`,
  );
  check(
    "the server reports it routed to the SELECTED provider, not GHARIBO-V1",
    r.routedModelId !== null && r.routedModelId !== "GHARIBO-V1",
    `routedModelId=${r.routedModelId}`,
  );
  check(
    "the routed model matches the selected provider's model",
    r.routedModelId === provider.modelId,
    `routed=${r.routedModelId}, expected=${provider.modelId}`,
  );

  // Reported separately, and NOT asserted as a pass: whether the provider could
  // actually answer depends on the machine (model pulled / API key present).
  if (r.answered) {
    console.log(`INFO  the provider answered (${r.answer.trim().slice(0, 40)})`);
  } else {
    console.log(
      `INFO  the provider did not answer: ${r.error || "empty response"} — the routing decision above is still verified.`,
    );
    console.log("      (this does not depend on the app; check the provider's model/credentials)");
  }

  // ------------------------------------------- selection survives reload
  await send("Page.navigate", { url: `${base}/playground` });
  await sleep(8000);
  await ev(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => /just now|ago/.test(x.textContent || ''));
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(2500);

  const reloaded = (await api(`/api/conversations/${convId}`)).json?.data;
  const shown = await ev(`(() => {
    const t = document.querySelector('[role="combobox"]');
    return t ? (t.textContent || '').trim().slice(0, 40) : null;
  })()`);
  check(
    "the provider selection survives a reload",
    reloaded?.providerId === provider.id,
    `providerId=${reloaded?.providerId}, selector shows "${shown}"`,
  );

  ws.close();
} catch (error) {
  console.log(`PROVIDER_ROUTING_ERROR: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (convId) {
    await api(`/api/conversations/${convId}`, { method: "DELETE" }).catch(() => {});
    console.log("cleanup: removed the test conversation");
  }
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill();
}

const failed = results.filter((x) => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} provider-routing checks passed`);
if (failed.length) for (const f of failed) console.log(`  ${f.name}  ${f.detail ?? ""}`);
process.exitCode = failed.length === 0 ? 0 : 1;
