/**
 * Closes the last gaps in the mission's test matrix (section 12):
 *
 *   G  system prompt isolation  - and that it is actually SENT to the model
 *   H  temperature persistence  - changed through the UI, survives reload
 *      768px viewport           - section 14 lists 1440 / 1024 / 768 / mobile
 *
 * Test conversations are created and deleted by this script; the owner's
 * existing conversations are never modified.
 *
 * Usage: node matrix-gaps.mjs <baseUrl> [theme]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

// Mutating suite: refuse to run unless started by the isolated runner,
// so it can never write into the owner's real SQLite database.
import { requireIsolatedVerification } from "./lib/verification-guard.mjs";
requireIsolatedVerification("matrix-gaps.mjs");

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].find((p) => existsSync(p));

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const theme = process.argv[3] ?? "dark";
const port = 9000 + Math.floor(Math.random() * 80);

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
    `--user-data-dir=${process.env.TEMP}/gharibo-gaps-${port}`,
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
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return;
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

/** Sends a prompt over the app's own streaming endpoint and returns the answer. */
async function ask(id, content) {
  const res = await fetch(`${base}/api/conversations/${id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (res.status !== 200) return { ok: false, status: res.status, answer: "" };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let answer = "";
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
        if (typeof ev.delta === "string") answer += ev.delta;
      } catch {
        /* ignore */
      }
    }
  }
  return { ok: true, status: 200, answer };
}

const created = [];
async function makeConv(title, extra = {}) {
  const r = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      title,
      providerId: null,
      modelId: "GHARIBO-V1",
      maxTokens: 96,
      temperature: 0.4,
      ...extra,
    }),
  });
  const id = r.json?.data?.id;
  if (id) created.push(id);
  return id;
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
  async function pressKey(key, vk) {
    const common = { key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...common });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...common });
    await sleep(130);
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });

  const rt = await api("/api/runtime/v1");
  const online = rt.json?.data?.health?.state === "ONLINE";
  console.log(`runtime: ${rt.json?.data?.health?.state}\n`);

  // ===================================================== H. temperature
  {
    const id = await makeConv("__gap_temp__");
    await send("Page.navigate", { url: `${base}/playground` });
    await sleep(8000);

    await ev(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').includes('__gap_temp__'));
      if (b) b.click();
      return !!b;
    })()`);
    await sleep(3000);

    const before = (await api(`/api/conversations/${id}`)).json?.data?.temperature;

    // Drive the slider with the keyboard: ArrowRight increases by one step (0.05).
    const focused = await ev(`(() => {
      const s = document.querySelector('[role="slider"]');
      if (!s) return false;
      s.focus();
      return document.activeElement === s;
    })()`);
    check("the temperature slider is focusable and reachable", focused === true);

    if (focused) {
      for (let i = 0; i < 3; i += 1) await pressKey("ArrowRight", 39);
      await sleep(2500);
      const after = (await api(`/api/conversations/${id}`)).json?.data?.temperature;
      check(
        "changing temperature through the UI persists",
        typeof after === "number" && typeof before === "number" && after > before,
        `${before} -> ${after}`,
      );

      // Reload and re-read: true persistence, not just in-memory state.
      await send("Page.navigate", { url: `${base}/playground` });
      await sleep(8000);
      const afterReload = (await api(`/api/conversations/${id}`)).json?.data?.temperature;
      check(
        "the new temperature survives a reload",
        afterReload === after,
        `${afterReload} (expected ${after})`,
      );

      // And it is reflected back into the UI, not just the database.
      await ev(`(() => {
        const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').includes('__gap_temp__'));
        if (b) b.click();
        return !!b;
      })()`);
      await sleep(3000);
      const shown = await ev(`(() => {
        const s = document.querySelector('[role="slider"]');
        return s ? s.getAttribute('aria-valuenow') : null;
      })()`);
      check(
        "the slider shows the persisted value",
        shown !== null && Math.abs(Number(shown) - Number(after)) < 0.02,
        `aria-valuenow=${shown}, stored=${after}`,
      );
    } else {
      check("changing temperature through the UI persists", false, "slider not reachable");
    }
  }

  // ============================================ G. system prompt sent + isolated
  if (!online) {
    console.log("\nSKIP system-prompt live checks: runtime not ONLINE (no GPU spend).");
  } else {
    const idA = await makeConv("__gap_sysA__");
    const idB = await makeConv("__gap_sysB__");

    await send("Page.navigate", { url: `${base}/playground` });
    await sleep(8000);

    // Open A and set a distinctive system prompt through the inspector.
    await ev(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').includes('__gap_sysA__'));
      if (b) b.click();
      return !!b;
    })()`);
    await sleep(3000);

    const marker = "ZEPHYR";
    // The textarea must be FOCUSED before blur() can fire focusout; calling
    // blur() on an unfocused element is a no-op, so React's onBlur never ran.
    // Use REAL input: click to focus, Input.insertText (generates genuine key +
    // input events rather than a synthetic Event), then Tab to move focus away.
    const rect = await ev(`(() => {
      const t = document.querySelector('#system-prompt');
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    if (rect) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    }
    await sleep(400);
    await send("Input.insertText", { text: `Always end every reply with the exact word ${marker}.` });
    await sleep(700);
    const stateOk = await ev(`(() => {
      const t = document.querySelector('#system-prompt');
      return t ? t.value : null;
    })()`);
    check(
      "the system prompt textarea accepts the typed value (React state)",
      typeof stateOk === "string" && stateOk.includes(marker),
      JSON.stringify((stateOk || "").slice(0, 40)),
    );

    const preTab = await ev(`(() => {
      const t = document.querySelector('#system-prompt');
      return { id: t ? t.id : null, activeId: document.activeElement ? document.activeElement.id : null };
    })()`);
    await pressKey("Tab", 9);
    await sleep(300);
    const blurResult = await ev(`(() => {
      const t = document.querySelector('#system-prompt');
      return { stillFocused: document.activeElement === t, active: document.activeElement ? document.activeElement.tagName : null };
    })()`);
    check(
      "focus left the system prompt textarea after Tab (onBlur can fire)",
      blurResult?.stillFocused === false,
      JSON.stringify({ preTab, blurResult }),
    );
    await sleep(2500);

    const storedA = (await api(`/api/conversations/${idA}`)).json?.data?.systemPrompt;
    check(
      "the system prompt typed into the inspector persists",
      typeof storedA === "string" && storedA.includes(marker),
      JSON.stringify((storedA || "").slice(0, 50)),
    );

    // Does it actually reach the model?
    const a = await ask(idA, "Say hello in one short sentence.");
    check(
      "the system prompt is actually SENT to the model",
      a.ok && a.answer.includes(marker),
      a.ok ? JSON.stringify(a.answer.slice(0, 70)) : `HTTP ${a.status}`,
    );

    // Isolation: B has no system prompt, so the marker must not appear.
    const storedB = (await api(`/api/conversations/${idB}`)).json?.data?.systemPrompt;
    check(
      "a second conversation does not inherit that system prompt",
      storedB === null || storedB === undefined || storedB === "",
      JSON.stringify(storedB ?? null),
    );

    const b = await ask(idB, "Say hello in one short sentence.");
    check(
      "the second conversation's answer shows no sign of it",
      b.ok && !b.answer.includes(marker),
      b.ok ? JSON.stringify(b.answer.slice(0, 70)) : `HTTP ${b.status}`,
    );
  }

  // ==================================================== 768px viewport
  for (const pathname of ["/playground", "/settings", "/datasets"]) {
    await send("Emulation.setDeviceMetricsOverride", { width: 768, height: 1024, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: `${base}${pathname}` });
    await sleep(6500);
    const m = await ev(`(() => {
      const d = document.documentElement;
      const t = document.querySelector('textarea[aria-label="Message"]');
      return {
        overflow: d.scrollWidth > d.clientWidth + 1,
        scrollW: d.scrollWidth,
        clientW: d.clientWidth,
        composerVisible: t ? window.getComputedStyle(t).display !== 'none' : null,
        composerW: t ? Math.round(t.getBoundingClientRect().width) : null,
      };
    })()`);
    check(
      `no horizontal overflow @768 — ${pathname}`,
      m?.overflow === false,
      `scrollW=${m?.scrollW} clientW=${m?.clientW}`,
    );
    if (pathname === "/playground") {
      check(
        "composer usable @768",
        m?.composerVisible === true && typeof m.composerW === "number" && m.composerW > 200,
        `${m?.composerW}px`,
      );
    }
  }

  ws.close();
} catch (error) {
  console.log(`MATRIX_GAPS_ERROR: ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const id of created) {
    await api(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {});
  }
  console.log(`cleanup: removed ${created.length} test conversations`);
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} matrix-gap checks passed`);
if (failed.length) for (const f of failed) console.log(`  ${f.name}  ${f.detail ?? ""}`);
process.exitCode = failed.length === 0 ? 0 : 1;
