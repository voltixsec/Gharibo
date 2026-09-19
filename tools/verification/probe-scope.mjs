/**
 * Regression area G: the GHARIBO runtime health probe must be scoped to the
 * Playground only.
 *
 * Waking a scaled-to-zero GPU container costs money and time. Visiting any other
 * dashboard route must not initiate the probe. This checks it at the network
 * level, which is the only place "did we call it?" can be observed honestly.
 *
 * Usage: node probe-scope.mjs <baseUrl> [theme]
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
const port = 8600 + Math.floor(Math.random() * 80);

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
    `--user-data-dir=${process.env.TEMP}/gharibo-probe-${port}`,
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

let ws;
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
  const requested = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      return;
    }
    // Record network requests as they are issued.
    if (m.method === "Network.requestWillBeSent") {
      const url = m.params?.request?.url ?? "";
      requested.push(url);
    }
  });
  const send = (method, params = {}) => {
    const id = nextId++;
    return new Promise((res, rej) => {
      pending.set(id, { resolve: res, reject: rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  await send("Page.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });

  const PROBE = "/api/runtime/v1";

  /** Navigates and returns whether the probe was requested during that visit. */
  async function visit(pathname, settleMs = 7000) {
    requested.length = 0;
    await send("Page.navigate", { url: `${base}${pathname}` });
    await sleep(settleMs);
    const hits = requested.filter((u) => u.includes(PROBE));
    return { count: hits.length, sample: hits[0] ?? null };
  }

  // These SHOULD probe: they are the Playground. Note `/` is a redirect to
  // /playground (app/page.tsx), so it is expected to probe too - asserting
  // otherwise would be a bug in this test, not in the app.
  for (const route of ["/playground", "/"]) {
    const r = await visit(route);
    check(
      `${route} DOES probe the runtime (control: it is the Playground)`,
      r.count > 0,
      `${r.count} request(s)${r.sample ? ` e.g. ${r.sample}` : ""}`,
    );
  }

  // Any genuinely non-Playground dashboard route must not.
  for (const route of ["/datasets", "/training", "/settings", "/system", "/models", "/evaluations"]) {
    const r = await visit(route);
    check(
      `${route} does NOT initiate the runtime health probe`,
      r.count === 0,
      r.count === 0 ? "no probe request" : `${r.count} request(s) e.g. ${r.sample}`,
    );
  }

  ws.close();
} catch (error) {
  console.log(`PROBE_SCOPE_ERROR: ${error.message}`);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} probe-scope checks passed`);
if (failed.length) for (const f of failed) console.log(`  ${f.name}  ${f.detail ?? ""}`);
process.exitCode = failed.length === 0 ? 0 : 1;
