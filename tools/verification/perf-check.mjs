/**
 * Frontend performance measurement (mission section 10).
 *
 * Measures what a user actually experiences on the redesigned Playground:
 * navigation timing, JavaScript transferred and executed, hydration time, and
 * long tasks / total blocking time.
 *
 * `/settings` is measured as a CONTEXT BASELINE — it is a lighter page that this
 * work did not redesign, so comparing the two shows the redesign's real cost
 * rather than the framework's.
 *
 * Usage: node perf-check.mjs <baseUrl> [theme]
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
const theme = process.argv[3] ?? "dark";
const port = 9200 + Math.floor(Math.random() * 100);

const ROUTES = [
  { path: "/playground", label: "Playground (redesigned)" },
  { path: "/settings", label: "Settings (context baseline)" },
  { path: "/system", label: "System (context baseline)" },
];

const RUNS = 3;

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${process.env.TEMP}/gharibo-perf-${port}`,
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
  let bytes = { transfer: 0, decoded: 0, jsTransfer: 0, jsDecoded: 0, requests: 0 };
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Network.loadingFinished") {
      bytes.requests += 1;
    }
    if (m.method === "Network.responseReceived") {
      const r = m.params.response;
      const size = r.encodedDataLength || 0;
      const decoded = r.headersText ? 0 : 0;
      bytes.transfer += size;
      const isJs = /\.js(\?|$)/.test(r.url) || r.mimeType === "application/javascript";
      if (isJs) bytes.jsTransfer += size;
      void decoded;
    }
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
  await send("Network.enable");
  await send("Performance.enable");
  // Cold cache: a warm cache reports transferSize 0 and hides the real cost.
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });

  // Install a long-task observer before any page script runs.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__longTasks = [];
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__longTasks.push(Math.round(e.duration));
        }).observe({ entryTypes: ['longtask'] });
      } catch {}
      window.__hydrationMs = null;
      // React marks the element it hydrated with __reactFiber$<key> /
      // __reactProps$<key>. Scanning the rendered tree for one of those is a
      // reliable "React has taken over" signal, unlike looking at <body>.
      const started = performance.now();
      const hasReact = () => {
        const nodes = document.querySelectorAll('body *');
        for (let i = 0; i < Math.min(nodes.length, 40); i += 1) {
          const keys = Object.keys(nodes[i]);
          for (const k of keys) {
            if (k.startsWith('__reactFiber$') || k.startsWith('__reactProps$')) return true;
          }
        }
        return false;
      };
      const timer = setInterval(() => {
        if (window.__hydrationMs === null && hasReact()) {
          window.__hydrationMs = Math.round(performance.now() - started);
          clearInterval(timer);
        }
      }, 10);
      setTimeout(() => clearInterval(timer), 20000);
    `,
  });

  const summary = [];

  for (const route of ROUTES) {
    const runs = [];
    for (let i = 0; i < RUNS; i += 1) {
      bytes = { transfer: 0, decoded: 0, jsTransfer: 0, jsDecoded: 0, requests: 0 };
      await send("Page.navigate", { url: `${base}${route.path}` });
      await sleep(7000);

      const nav = await ev(`(() => {
        const n = performance.getEntriesByType('navigation')[0];
        if (!n) return null;
        return {
          ttfb: Math.round(n.responseStart),
          domContentLoaded: Math.round(n.domContentLoadedEventEnd),
          loadEvent: Math.round(n.loadEventEnd || n.duration),
          domNodes: document.getElementsByTagName('*').length,
        };
      })()`);

      const runtime = await ev(`(() => {
        const res = performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'script' || /\\.js(\\?|$)/.test(r.name));
        const jsTransfer = Math.round(res.reduce((a, r) => a + (r.transferSize || 0), 0) / 1024);
        const jsDecoded = Math.round(res.reduce((a, r) => a + (r.decodedBodySize || 0), 0) / 1024);
        const paint = performance.getEntriesByType('paint');
        const fcp = paint.find((e) => e.name === 'first-contentful-paint');
        const lt = window.__longTasks || [];
        return {
          jsTransferKB: jsTransfer,
          jsDecodedKB: jsDecoded,
          scriptRequests: res.length,
          hydrationMs: window.__hydrationMs,
          fcpMs: fcp ? Math.round(fcp.startTime) : null,
          longTasks: lt.length,
          longestTaskMs: lt.length ? Math.max(...lt) : 0,
          totalBlockingMs: lt.reduce((a, d) => a + Math.max(0, d - 50), 0),
        };
      })()`);

      runs.push({ ...nav, ...runtime });
    }

    // 0 is a legitimate measurement (e.g. no long tasks), so it is kept.
    const median = (key) => {
      const vals = runs
        .map((r) => r[key])
        .filter((v) => typeof v === "number" && Number.isFinite(v))
        .sort((a, b) => a - b);
      if (!vals.length) return null;
      return vals[Math.floor(vals.length / 2)];
    };

    const row = {
      route: route.path,
      label: route.label,
      runs,
      median: {
        fcpMs: median("fcpMs"),
        ttfb: median("ttfb"),
        hydrationMs: median("hydrationMs"),
        loadEvent: median("loadEvent"),
        jsTransferKB: median("jsTransferKB"),
        jsDecodedKB: median("jsDecodedKB"),
        domNodes: median("domNodes"),
        longestTaskMs: median("longestTaskMs"),
        totalBlockingMs: median("totalBlockingMs"),
        longTasks: median("longTasks"),
      },
    };
    summary.push(row);

    const m = row.median;
    console.log(
      `${route.label.padEnd(30)} FCP=${m.fcpMs ?? "-"}ms  TTFB=${m.ttfb ?? "-"}ms  ` +
        `hydrate=${m.hydrationMs ?? "-"}ms  load=${m.loadEvent ?? "-"}ms  ` +
        `JS=${m.jsTransferKB ?? "-"}KB(${m.jsDecodedKB ?? "-"}KB decoded)  ` +
        `DOM=${m.domNodes ?? "-"}  longestTask=${m.longestTaskMs ?? "-"}ms  TBT=${m.totalBlockingMs ?? "-"}ms`,
    );
  }

  const outDir = process.env.PERF_OUT ?? path.join(OUT_ROOT, "perf");
  mkdirSync(outDir, { recursive: true });
  const outPath = `${outDir}/frontend-perf-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), theme, runsPerRoute: RUNS, summary }, null, 2));
  console.log(`\nwritten: ${outPath}`);

  ws.close();
} catch (error) {
  console.error("PERF_FAILED:", error.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill();
}
