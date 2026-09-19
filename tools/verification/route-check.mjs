/**
 * Cross-page regression check.
 *
 * The Playground work changed SHARED code — the dashboard layout (providers,
 * scroll container), the navigation sidebar, and `globals.css` (the whole colour
 * token system). Those affect every dashboard page, but only /playground was
 * visually verified. This walks all of them.
 *
 * For each route: HTTP status, hydration, console errors, horizontal overflow at
 * desktop and mobile widths, rendered content, and a WCAG contrast pass.
 *
 * Usage: node route-check.mjs <baseUrl> [theme]
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
const port = 9400 + Math.floor(Math.random() * 150);

// Extra routes (e.g. dynamic ones with a real id) can be appended via env.
const EXTRA = (process.env.EXTRA_ROUTES || "").split(",").map((r) => r.trim()).filter(Boolean);
const ROUTES = [
  "/playground",
  "/research-gym",
  "/data-factory",
  "/datasets",
  "/training",
  "/evaluations",
  "/models",
  "/experiments",
  "/system",
  "/settings",
  ...EXTRA,
];

const results = [];
const check = (route, name, pass, detail) => {
  results.push({ route, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${route.padEnd(16)} ${name}${detail ? ` — ${detail}` : ""}`);
};

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${process.env.TEMP}/gharibo-routes-${port}`,
    "--no-first-run",
    "--no-proxy-server",
    "--proxy-bypass-list=*",
    "--hide-scrollbars",
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

const AUDIT = `(() => {
  function parseRgb(s) {
    const m = String(s).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(",").map((v) => parseFloat(v));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function lum({ r, g, b }) {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function ratio(a, b) {
    const la = lum(a), lb = lum(b);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }
  function effectiveBg(el) {
    let node = el;
    while (node) {
      const bg = parseRgb(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.9) return bg;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  const fails = [];
  let sampled = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent.trim();
    if (!text) continue;
    const el = walker.currentNode.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const fg = parseRgb(cs.color);
    if (!fg) continue;
    sampled++;
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const got = ratio(fg, effectiveBg(el));
    if (got < need) fails.push({ text: text.slice(0, 30), got: Math.round(got * 100) / 100, need });
  }
  const d = document.documentElement;
  return {
    sampled,
    fails: fails.slice(0, 6),
    failCount: fails.length,
    overflow: d.scrollWidth > d.clientWidth + 1,
    scrollW: d.scrollWidth,
    clientW: d.clientWidth,
    hydrated: Object.keys(document.querySelector('button') || {}).some((k) => k.startsWith('__react')),
    navItems: document.querySelectorAll('aside a').length,
    textLen: document.body.innerText.trim().length,
  };
})()`;

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
  let consoleErrors = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Runtime.exceptionThrown") {
      consoleErrors.push(m.params.exceptionDetails?.text ?? "exception");
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      const text = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
      if (!/favicon|React DevTools|preload|Download the React/i.test(text)) consoleErrors.push(text);
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
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });

  for (const route of ROUTES) {
    consoleErrors = [];

    // --- HTTP status ---
    let status = 0;
    try {
      const res = await fetch(`${base}${route}`, { redirect: "manual" });
      status = res.status;
    } catch {
      status = -1;
    }
    check(route, "responds 200", status === 200, `HTTP ${status}`);

    await send("Page.navigate", { url: `${base}${route}` });
    await sleep(6000);

    const desktop = await ev(AUDIT);
    check(route, "hydrates", desktop?.hydrated === true);
    check(
      route,
      "renders content",
      typeof desktop?.textLen === "number" && desktop.textLen > 120,
      `${desktop?.textLen} chars`,
    );
    check(
      route,
      "navigation present",
      typeof desktop?.navItems === "number" && desktop.navItems >= 10,
      `${desktop?.navItems} links`,
    );
    check(
      route,
      "no horizontal overflow @1440",
      desktop?.overflow === false,
      `scrollW=${desktop?.scrollW} clientW=${desktop?.clientW}`,
    );
    check(
      route,
      `WCAG AA contrast (${desktop?.sampled} samples)`,
      desktop?.failCount === 0,
      desktop?.failCount ? `${desktop.failCount} failing, e.g. ${JSON.stringify(desktop.fails[0])}` : "all pass",
    );

    // --- mobile width ---
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(1200);
    const mobile = await ev(AUDIT);
    check(
      route,
      "no horizontal overflow @390",
      mobile?.overflow === false,
      `scrollW=${mobile?.scrollW} clientW=${mobile?.clientW}`,
    );
    check(
      route,
      "navigation drawer available @390",
      typeof mobile?.textLen === "number" && mobile.textLen > 80,
      `${mobile?.textLen} chars`,
    );
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    check(route, "no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 1).join("").slice(0, 80));
  }

  ws.close();
} catch (error) {
  console.log(`ROUTE_CHECK_ERROR: ${error.message}`);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} route checks passed`);
if (failed.length) {
  console.log("\nFailures:");
  for (const f of failed) console.log(`  ${f.route}  ${f.name}  ${f.detail ?? ""}`);
}
process.exitCode = failed.length === 0 ? 0 : 1;
