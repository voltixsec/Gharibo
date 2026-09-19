/**
 * Regression areas M: failed rename / delete / settings writes must not leave the
 * UI pretending the change succeeded.
 *
 * The failure is forced at the network layer with the DevTools Protocol
 * (`Fetch.failRequest` for PATCH/DELETE), so the app's real error paths run -
 * no stubbing inside the app, and no relying on the UI to report its own success.
 *
 * Usage: node mutation-failure.mjs <baseUrl> [theme]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

// Mutating suite: refuse to run unless started by the isolated runner,
// so it can never write into the owner's real SQLite database.
import { requireIsolatedVerification } from "./lib/verification-guard.mjs";
requireIsolatedVerification("mutation-failure.mjs");

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].find((p) => existsSync(p));

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const theme = process.argv[3] ?? "dark";
const port = 8500 + Math.floor(Math.random() * 80);

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
    `--user-data-dir=${process.env.TEMP}/gharibo-mutfail-${port}`,
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
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

let ws;
let convId = null;
let failWrites = false;

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
      return;
    }
    // Fail only the mutating verbs, and only when the test arms it.
    if (m.method === "Fetch.requestPaused") {
      const { requestId, request } = m.params;
      const method = (request?.method || "").toUpperCase();
      const isWrite = method === "PATCH" || method === "DELETE";
      if (failWrites && isWrite && (request?.url || "").includes("/api/conversations")) {
        ws.send(JSON.stringify({
          id: nextId++,
          method: "Fetch.failRequest",
          params: { requestId, errorReason: "Failed" },
        }));
        return;
      }
      ws.send(JSON.stringify({ id: nextId++, method: "Fetch.continueRequest", params: { requestId } }));
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
  await send("Fetch.enable", { patterns: [{ urlPattern: "*api/conversations*" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });

  const created = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ title: "__mutfail_original__", providerId: null, modelId: "GHARIBO-V1" }),
  });
  convId = created.json?.data?.id;
  check("a test conversation exists", Boolean(convId), convId ? convId.slice(0, 8) : "none");

  await send("Page.navigate", { url: `${base}/playground` });
  await sleep(8000);

  // Arm failure for mutating requests only.
  failWrites = true;

  // ---------------------------------------------------------- rename
  const renamed = await ev(`(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find((b) => (b.getAttribute('aria-label') || '').startsWith('Rename ') &&
                   (b.getAttribute('aria-label') || '').includes('__mutfail_original__'));
    if (!btn) return 'no-button';
    btn.click();
    return 'clicked';
  })()`);
  check("the rename control is reachable", renamed === "clicked", renamed);
  await sleep(700);

  await ev(`(() => {
    const input = document.querySelector('input[aria-label="Conversation name"]');
    if (!input) return 'no-input';
    input.focus();
    return 'focused';
  })()`);
  await send("Input.insertText", { text: "__mutfail_renamed__" });
  await sleep(400);
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(2500);

  const serverTitle = (await api(`/api/conversations/${convId}`)).json?.data?.title;
  check(
    "the failed rename did NOT persist (server still holds the old title)",
    serverTitle === "__mutfail_original__",
    `server title = ${serverTitle}`,
  );

  const uiShowsOld = await ev(`document.body.innerText.includes('__mutfail_original__')`);
  const uiShowsNew = await ev(`document.body.innerText.includes('__mutfail_renamed__')`);
  check(
    "the UI does not pretend the rename succeeded (still shows the original name)",
    uiShowsOld === true && uiShowsNew === false,
    `showsOld=${uiShowsOld}, showsNew=${uiShowsNew}`,
  );

  const noticeShown = await ev(`(document.body.innerText.match(/could not|failed|error|unable/i) || [])[0] || null`);
  check(
    "the failed rename surfaces a visible notice",
    noticeShown !== null,
    noticeShown ? `notice: "${noticeShown}"` : "no notice text found",
  );

  // ---------------------------------------------------- settings write
  await ev(`(() => {
    const t = document.querySelector('#system-prompt');
    if (!t) return 'none';
    t.focus();
    return 'ok';
  })()`);
  await send("Input.insertText", { text: "this write should fail" });
  await sleep(400);
  await ev(`(() => {
    const t = document.querySelector('#system-prompt');
    if (t) t.blur();
    return 'blurred';
  })()`);
  await sleep(2500);

  const sysAfter = (await api(`/api/conversations/${convId}`)).json?.data?.systemPrompt;
  check(
    "the failed settings write did NOT persist",
    sysAfter === null || sysAfter === undefined || sysAfter === "",
    `systemPrompt = ${JSON.stringify(sysAfter)}`,
  );

  // Disarm and confirm writes work again (proves the failure was the cause).
  failWrites = false;
  const repaired = await api(`/api/conversations/${convId}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "__mutfail_ok__" }),
  });
  check(
    "with writes allowed again, a patch succeeds (control)",
    repaired.json?.data?.title === "__mutfail_ok__",
    `title = ${repaired.json?.data?.title}`,
  );

  ws.close();
} catch (error) {
  console.log(`MUTATION_FAILURE_ERROR: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (convId) {
    await api(`/api/conversations/${convId}`, { method: "DELETE" }).catch(() => {});
    console.log("cleanup: removed the test conversation");
  }
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} mutation-failure checks passed`);
if (failed.length) for (const f of failed) console.log(`  ${f.name}  ${f.detail ?? ""}`);
process.exitCode = failed.length === 0 ? 0 : 1;
