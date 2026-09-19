/**
 * Browser acceptance for conversation history + automatic titles + rename.
 *
 * A. new chat -> first ARABIC message -> title changes -> reload -> title and
 *    full history survive
 * B. manual rename -> another message -> reload -> manual title unchanged
 * C. new chat -> first ENGLISH message -> sensible English title
 * D. rapid switching between A/B/C -> no title or history leakage
 * E. forced rename failure -> visible error -> original title still shown
 *
 * Usage: node history-titles-acceptance.mjs <baseUrl> [theme]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

// Mutating suite: refuse to run unless started by the isolated runner,
// so it can never write into the owner's real SQLite database.
import { requireIsolatedVerification } from "./lib/verification-guard.mjs";
requireIsolatedVerification("history-titles-acceptance.mjs");

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].find((p) => existsSync(p));

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const theme = process.argv[3] ?? "dark";
const port = 8400 + Math.floor(Math.random() * 80);

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
    `--user-data-dir=${process.env.TEMP}/gharibo-titles-${port}`,
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

/** Sends the first (or any) message and returns the assistant text. */
async function ask(id, content) {
  const res = await fetch(`${base}/api/conversations/${id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (res.status !== 200) return { ok: false, status: res.status };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }
  return { ok: true, raw: buf };
}

let ws;
let failWrites = false;
const ids = [];

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
    // E: fail rename writes on demand.
    if (m.method === "Fetch.requestPaused") {
      const { requestId, request } = m.params;
      const method = (request?.method || "").toUpperCase();
      const isRename =
        (method === "PATCH" || method === "PUT") &&
        (request?.url || "").includes("/api/conversations/");
      if (failWrites && isRename) {
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

  // ---------------------------------------------------------------- A (Arabic)
  const arabicMsg = "عايز اعمل برنامج لإدارة المخازن والمشتريات للشركة";
  const a = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ title: "New conversation", providerId: null, modelId: "GHARIBO-V1", maxTokens: 64 }),
  });
  const aId = a.json?.data?.id;
  ids.push(aId);
  check("A: a new conversation starts as 'New conversation'", a.json?.data?.title === "New conversation", a.json?.data?.title);

  await ask(aId, arabicMsg);
  await sleep(2500);

  const aTitled = (await api(`/api/conversations/${aId}`)).json?.data;
  check(
    "A: an automatic Arabic title was created from the first message",
    aTitled?.title !== "New conversation" && /[؀-ۿ]/.test(aTitled?.title ?? ""),
    `title="${aTitled?.title}"`,
  );
  check(
    "A: the first user message is still in the history",
    (aTitled?.messages ?? []).some((m) => m.role === "user" && m.content.includes("المخازن")),
    `messages=${(aTitled?.messages ?? []).length}`,
  );

  // Reload and confirm both survive.
  await send("Page.navigate", { url: `${base}/playground` });
  await sleep(7000);
  const aReloaded = (await api(`/api/conversations/${aId}`)).json?.data;
  check("A: the title survives a reload", aReloaded?.title === aTitled?.title, `"${aReloaded?.title}"`);
  check(
    "A: the complete history survives a reload from message #1",
    (aReloaded?.messages ?? []).length === (aTitled?.messages ?? []).length &&
      (aReloaded?.messages ?? [])[0]?.role === "user",
    `${(aReloaded?.messages ?? []).length} messages`,
  );

  // ------------------------------------------------------------- B (manual rename)
  const manualTitle = "برنامج المخازن";
  const renamed = await api(`/api/conversations/${aId}`, {
    method: "PATCH",
    body: JSON.stringify({ title: manualTitle }),
  });
  check("B: manual rename persists", renamed.json?.data?.title === manualTitle, renamed.json?.data?.title);

  await ask(aId, "رسالة تالية完全不同");
  await sleep(2500);
  await send("Page.navigate", { url: `${base}/playground` });
  await sleep(7000);
  const afterMore = (await api(`/api/conversations/${aId}`)).json?.data;
  check(
    "B: later messages never overwrite the manual title",
    afterMore?.title === manualTitle,
    `"${afterMore?.title}"`,
  );

  // ------------------------------------------------------------ C (English)
  const englishMsg = "Can you help me debug the provider routing issue in GHARIBO?";
  const c = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ title: "New conversation", providerId: null, modelId: "GHARIBO-V1", maxTokens: 64 }),
  });
  const cId = c.json?.data?.id;
  ids.push(cId);
  await ask(cId, englishMsg);
  await sleep(2500);
  const cTitled = (await api(`/api/conversations/${cId}`)).json?.data;
  check(
    "C: an English title was derived from the English first message",
    cTitled?.title !== "New conversation" && /[A-Za-z]/.test(cTitled?.title ?? ""),
    `title="${cTitled?.title}"`,
  );

  // ------------------------------------------------- D (rapid switching)
  await send("Page.navigate", { url: `${base}/playground` });
  await sleep(7000);
  let leakage = false;
  for (let i = 0; i < 6; i += 1) {
    const target2 = [aId, cId][i % 2];
    await ev(`(() => {
      const b = Array.from(document.querySelectorAll('button'))
        .find((x) => (x.textContent || '').includes(${JSON.stringify(
          target2 === aId ? manualTitle : (cTitled?.title ?? ""),
        )}));
      if (b) b.click();
      return !!b;
    })()`);
    await sleep(120);
  }
  await sleep(2500);

  // After switching, the server data must still be correct per conversation.
  const aFinal = (await api(`/api/conversations/${aId}`)).json?.data;
  const cFinal = (await api(`/api/conversations/${cId}`)).json?.data;
  const aHasC = (aFinal?.messages ?? []).some((m) => m.content.includes("provider routing issue"));
  const cHasA = (cFinal?.messages ?? []).some((m) => m.content.includes("المخازن"));
  leakage = aHasC || cHasA;
  check("D: rapid switching caused no history leakage", !leakage, `aHasC=${aHasC}, cHasA=${cHasA}`);
  check(
    "D: each conversation kept its own title",
    aFinal?.title === manualTitle && cFinal?.title === cTitled?.title,
    `a="${aFinal?.title}" c="${cFinal?.title}"`,
  );

  // ------------------------------------------------- E (forced rename failure)
  await send("Page.navigate", { url: `${base}/playground` });
  await sleep(7000);
  failWrites = true;

  const beforeFail = (await api(`/api/conversations/${aId}`)).json?.data?.title;
  const clicked = await ev(`(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find((b) => (b.getAttribute('aria-label') || '').startsWith('Rename ') &&
                   (b.getAttribute('aria-label') || '').includes(${JSON.stringify(manualTitle)}));
    if (!btn) return 'no-button';
    btn.click();
    return 'clicked';
  })()`);
  check("E: the rename control is reachable", clicked === "clicked", clicked);
  await sleep(700);

  await ev(`(() => {
    const input = document.querySelector('input[aria-label="Conversation name"]');
    if (!input) return 'no-input';
    input.focus();
    return 'focused';
  })()`);
  await send("Input.insertText", { text: "Should Not Persist" });
  await sleep(400);
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(2500);

  const notice = await ev(`(document.body.innerText.match(/failed|error|could not|unable/i) || [])[0] || null`);
  check("E: a visible error is shown when the rename fails", notice !== null, notice ? `"${notice}"` : "no notice");

  const afterFail = (await api(`/api/conversations/${aId}`)).json?.data?.title;
  check(
    "E: the persisted title is unchanged after a failed rename",
    afterFail === beforeFail,
    `before="${beforeFail}" after="${afterFail}"`,
  );
  const uiShowsNew = await ev(`document.body.innerText.includes('Should Not Persist')`);
  check("E: the UI does not show the unpersisted title", uiShowsNew === false, `uiShowsNew=${uiShowsNew}`);

  failWrites = false;
  ws.close();
} catch (error) {
  console.log(`ACCEPTANCE_ERROR: ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const id of ids) {
    await api(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {});
  }
  console.log(`cleanup: removed ${ids.length} test conversations`);
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} history/title acceptance checks passed`);
if (failed.length) for (const f of failed) console.log(`  ${f.name}  ${f.detail ?? ""}`);
process.exitCode = failed.length === 0 ? 0 : 1;
