/**
 * Headless screenshot harness over the Chrome DevTools Protocol.
 *
 * Uses Node's built-in WebSocket (Node 22+) — no extra dependencies.
 *
 * Why CDP rather than `chrome --screenshot`: the application's theme is driven
 * by `prefers-color-scheme`, and its layout is responsive. CDP lets a single run
 * emulate the exact colour scheme and device metrics for each capture, which is
 * what makes dark/light and desktop/tablet/mobile comparison meaningful.
 *
 * Usage:
 *   node shot.mjs <baseUrl> <outDir> <theme> <width> <height> <name> [path]
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

const [baseUrl, outDir, theme, widthArg, heightArg, name, routePath = "/playground"] = process.argv.slice(2);

if (!baseUrl || !outDir || !theme) {
  console.error("usage: node shot.mjs <baseUrl> <outDir> <theme> <width> <height> <name> [path]");
  process.exit(2);
}

const width = Number(widthArg) || 1440;
const height = Number(heightArg) || 900;
const port = 9333 + Math.floor(Math.random() * 400);
const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  console.error("NO_CHROME_FOUND");
  process.exit(3);
}

mkdirSync(outDir, { recursive: true });

const profileDir = `${outDir}/_profile_${port}`;
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--no-proxy-server",
    "--proxy-bypass-list=*",
    "--disable-background-networking",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${width},${height}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

/** Polls the DevTools HTTP endpoint until Chrome is accepting connections. */
async function waitForChrome() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error("chrome did not start");
}

/** Minimal CDP session: send commands, await matching id responses. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function openTarget(url) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  });
  if (!res.ok) throw new Error(`could not open target: ${res.status}`);
  return await res.json();
}

try {
  await waitForChrome();
  const target = await openTarget("about:blank");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });

  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: theme }],
  });

  const fullUrl = `${baseUrl.replace(/\/$/, "")}${routePath}`;
  await cdp.send("Page.navigate", { url: fullUrl });

  // Wait for the document to settle and for client-side data fetches to land.
  await sleep(Number(process.env.SHOT_SETTLE_MS ?? 4500));

  // Optional: click the first element whose text contains SHOT_CLICK_TEXT.
  // Used to open a conversation so the populated chat view can be inspected.
  if (process.env.SHOT_CLICK_TEXT) {
    const needle = JSON.stringify(process.env.SHOT_CLICK_TEXT);
    const clicked = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const needle = ${needle};
        const nodes = Array.from(document.querySelectorAll("button, a"));
        const hit = nodes.find((n) => (n.textContent || "").includes(needle));
        if (!hit) return "not-found";
        hit.click();
        return "clicked";
      })()`,
      returnByValue: true,
    });
    console.error("click:", clicked.result.value);
    await sleep(Number(process.env.SHOT_AFTER_CLICK_MS ?? 2500));
  }

  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });

  const outPath = `${outDir}/${name}.png`;
  writeFileSync(outPath, Buffer.from(data, "base64"));

  // Report any page-level errors so a broken render is visible in the log.
  const probe = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify({
      title: document.title,
      bodyLen: document.body ? document.body.innerText.length : 0,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      scrollH: document.documentElement.scrollHeight,
      clientH: document.documentElement.clientHeight,
      htmlClass: document.documentElement.className,
      bg: getComputedStyle(document.body).backgroundColor,
      text: (document.body ? document.body.innerText : "").slice(0, 400)
    })`,
    returnByValue: true,
  });

  console.log(outPath);
  console.log(probe.result.value);

  ws.close();
} catch (error) {
  console.error("SHOT_FAILED:", error.message);
  process.exitCode = 1;
} finally {
  chrome.kill();
}
