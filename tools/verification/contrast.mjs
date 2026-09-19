/**
 * WCAG contrast audit of the rendered Playground.
 *
 * Objective rather than subjective: reads the COMPUTED colour of each key text
 * element against its nearest opaque ancestor background and reports the WCAG
 * 2.1 contrast ratio. Text below 4.5:1 (or 3:1 for large/bold text) is flagged.
 *
 * Usage: PROBE_THEME=dark node contrast.mjs <url>
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].find((p) => existsSync(p));

const url = process.argv[2] ?? "http://localhost:3100/playground";
const theme = process.env.PROBE_THEME ?? "dark";
const port = 9700 + Math.floor(Math.random() * 200);

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${process.env.TEMP}/gharibo-contrast-${port}`,
    "--no-first-run",
    "--no-proxy-server",
    "--proxy-bypass-list=*",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function waitForChrome() {
  for (let i = 0; i < 100; i += 1) {
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
  const samples = [];
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
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const fg = parseRgb(cs.color);
    if (!fg) continue;
    const bg = effectiveBg(el);
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    samples.push({
      text: text.slice(0, 42),
      cls: (el.className && String(el.className).slice(0, 60)) || "",
      ratio: Math.round(ratio(fg, bg) * 100) / 100,
      required: large ? 3 : 4.5,
      size, weight,
      fg: cs.color, bg: \`rgb(\${bg.r}, \${bg.g}, \${bg.b})\`,
    });
  }
  return JSON.stringify(samples);
})()`;

try {
  await waitForChrome();
  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })
  ).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
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

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: theme }],
  });
  await send("Page.navigate", { url });
  await sleep(9000);

  const res = await send("Runtime.evaluate", { expression: AUDIT, returnByValue: true });
  const samples = JSON.parse(res.result.value);

  const failures = samples.filter((s) => s.ratio < s.required);
  console.log(`theme=${theme}  sampled=${samples.length}  failures=${failures.length}`);
  for (const f of failures) {
    console.log(`  ${f.ratio} < ${f.required}  "${f.text}"  ${f.fg} on ${f.bg}  (${f.size}px/${f.weight})`);
  }
  if (!failures.length) console.log("  all sampled text meets WCAG AA");
  ws.close();
} catch (error) {
  console.error("CONTRAST_FAILED:", error.message);
  process.exitCode = 1;
} finally {
  chrome.kill();
}
