/**
 * Evaluates an arbitrary expression in the page and prints the result.
 * Used to diagnose why client-side data is not appearing.
 *
 * Usage: node eval.mjs <url> <expression> [waitMs]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

const [url, expression, waitMs = "6000"] = process.argv.slice(2);
const port = 9800 + Math.floor(Math.random() * 300);
const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${process.env.TEMP}/gharibo-eval-${port}`,
    "--no-first-run",
    "--disable-extensions",
    "--no-proxy-server",
    "--proxy-bypass-list=*",
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function waitForChrome() {
  for (let i = 0; i < 100; i += 1) {
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
  const consoleErrors = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
    }
    if (msg.method === "Runtime.exceptionThrown") {
      consoleErrors.push("EXCEPTION: " + (msg.params.exceptionDetails?.text ?? ""));
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });

  const send = (method, params = {}) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  await send("Runtime.enable");
  await send("Page.enable");
  // Allow the caller to emulate a colour scheme (light/dark) before navigating.
  if (process.env.PROBE_THEME) {
    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: process.env.PROBE_THEME }],
    });
  }
  await send("Page.navigate", { url });
  await sleep(Number(waitMs));

  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  console.log("RESULT:", JSON.stringify(result.result?.value ?? result.result?.description, null, 2));
  if (consoleErrors.length) console.log("CONSOLE_ERRORS:", JSON.stringify(consoleErrors, null, 2));
  ws.close();
} catch (error) {
  console.error("EVAL_FAILED:", error.message);
  process.exitCode = 1;
} finally {
  chrome.kill();
}
