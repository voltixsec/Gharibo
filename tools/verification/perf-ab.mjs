/**
 * Frontend performance A/B (mission section 10).
 *
 * The polling-based hydration probe proved too noisy to attribute anything to:
 * the Playground's hydration ranged 118-511ms BEFORE the change and 97-547ms
 * AFTER — completely overlapping. Variance from first-load effects swamped any
 * signal.
 *
 * This uses CDP `Performance.getMetrics` instead, which reports cumulative
 * ScriptDuration / LayoutDuration / RecalcStyleDuration / TaskDuration. Those
 * are deterministic work counters, and they are read AFTER the page settles so
 * the value is the total for that navigation.
 *
 * It also measures the case the memoisation actually targets: RE-RENDERING an
 * already-rendered conversation (what happens on every streaming tick), by
 * typing into the composer with real key events and measuring the script time
 * that costs.
 *
 * Usage: node perf-ab.mjs <baseUrl> <label>
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import os from "node:os";
import path from "node:path";

// Portable output root: overridable, defaults to the OS temp dir so running
// these scripts never writes into the repository.
const OUT_ROOT = process.env.VERIFY_OUT ?? path.join(os.tmpdir(), "gharibo-verification");


const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].find((p) => existsSync(p));

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const label = process.argv[3] ?? "run";
const port = 9100 + Math.floor(Math.random() * 90);
const RUNS = 5;

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${process.env.TEMP}/gharibo-perfab-${port}`,
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

  const metricsMap = async () => {
    const { metrics } = await send("Performance.getMetrics");
    const out = {};
    for (const m of metrics) out[m.name] = m.value;
    return out;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Performance.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });

  async function pressChar(ch) {
    const args = { text: ch, key: ch, code: "Key" + ch.toUpperCase(), windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) };
    await send("Input.dispatchKeyEvent", { type: "keyDown", ...args });
    await send("Input.dispatchKeyEvent", { type: "char", ...args });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...args });
  }

  /** One measured navigation. */
  async function measureLoad(pathname) {
    await send("Page.navigate", { url: `${base}${pathname}` });
    await sleep(6000);
    const m = await metricsMap();
    return {
      scriptMs: Math.round((m.ScriptDuration ?? 0) * 1000),
      layoutMs: Math.round((m.LayoutDuration ?? 0) * 1000),
      recalcStyleMs: Math.round((m.RecalcStyleDuration ?? 0) * 1000),
      taskMs: Math.round((m.TaskDuration ?? 0) * 1000),
      domNodes: m.Nodes ?? 0,
      jsHeapMB: Math.round((m.JSHeapUsedSize ?? 0) / 1048576),
    };
  }

  /** Measures the cost of re-rendering an already-rendered conversation. */
  async function measureRerender() {
    await send("Page.navigate", { url: `${base}/playground` });
    await sleep(6000);

    // Open an existing conversation that has messages, if the app has one.
    const opened = await ev(`(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find((b) => /just now|ago/.test(b.textContent || ''));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    await sleep(3000);

    const textareaReady = await ev(`(() => {
      const t = document.querySelector('textarea[aria-label="Message"]');
      if (!t) return false;
      t.focus();
      return !t.disabled;
    })()`);
    if (!textareaReady) return null;

    // Typing re-renders ChatView: every rendered message re-renders (and,
    // without memoisation, re-parses its markdown) on each keystroke.
    const before = await metricsMap();
    for (let i = 0; i < 25; i += 1) {
      await pressChar("abcdefghij"[i % 10]);
    }
    await sleep(900);
    const after = await metricsMap();
    return {
      conversationOpened: opened === true,
      scriptMs: Math.round(((after.ScriptDuration ?? 0) - (before.ScriptDuration ?? 0)) * 1000),
      layoutMs: Math.round(((after.LayoutDuration ?? 0) - (before.LayoutDuration ?? 0)) * 1000),
      recalcStyleMs: Math.round(((after.RecalcStyleDuration ?? 0) - (before.RecalcStyleDuration ?? 0)) * 1000),
      taskMs: Math.round(((after.TaskDuration ?? 0) - (before.TaskDuration ?? 0)) * 1000),
    };
  }

  const median = (arr) => {
    const v = arr.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  };

  // Warm-up navigation (discarded): the first load pays one-off costs.
  await send("Page.navigate", { url: `${base}/playground` });
  await sleep(5000);

  const result = { label, at: new Date().toISOString(), runs: RUNS, routes: {}, rerender: null };

  for (const pathname of ["/playground", "/settings"]) {
    const runs = [];
    for (let i = 0; i < RUNS; i += 1) runs.push(await measureLoad(pathname));
    result.routes[pathname] = {
      runs,
      median: {
        scriptMs: median(runs.map((r) => r.scriptMs)),
        layoutMs: median(runs.map((r) => r.layoutMs)),
        recalcStyleMs: median(runs.map((r) => r.recalcStyleMs)),
        taskMs: median(runs.map((r) => r.taskMs)),
        domNodes: median(runs.map((r) => r.domNodes)),
        jsHeapMB: median(runs.map((r) => r.jsHeapMB)),
      },
    };
    const m = result.routes[pathname].median;
    console.log(
      `[${label}] ${pathname.padEnd(12)} script=${m.scriptMs}ms layout=${m.layoutMs}ms ` +
        `style=${m.recalcStyleMs}ms task=${m.taskMs}ms nodes=${m.domNodes} heap=${m.jsHeapMB}MB`,
    );
  }

  const rr = [];
  for (let i = 0; i < RUNS; i += 1) {
    const r = await measureRerender();
    if (r) rr.push(r);
  }
  if (rr.length) {
    result.rerender = {
      runs: rr,
      median: {
        scriptMs: median(rr.map((r) => r.scriptMs)),
        layoutMs: median(rr.map((r) => r.layoutMs)),
        recalcStyleMs: median(rr.map((r) => r.recalcStyleMs)),
        taskMs: median(rr.map((r) => r.taskMs)),
      },
    };
    const m = result.rerender.median;
    console.log(
      `[${label}] rerender(25 keystrokes) script=${m.scriptMs}ms layout=${m.layoutMs}ms ` +
        `style=${m.recalcStyleMs}ms task=${m.taskMs}ms  (from ${rr.length} runs)`,
    );
  } else {
    console.log(`[${label}] rerender: could not open a conversation with an enabled composer`);
  }

  const outDir = process.env.PERF_OUT ?? path.join(OUT_ROOT, "perf");
  mkdirSync(outDir, { recursive: true });
  const outPath = `${outDir}/ab-${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`written: ${outPath}`);

  ws.close();
} catch (error) {
  console.error("PERF_AB_FAILED:", error.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill();
}
