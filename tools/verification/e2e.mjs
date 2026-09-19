/**
 * Automated browser E2E for the Playground (mission section 15).
 *
 * Drives the real UI over the Chrome DevTools Protocol: clicks, types into
 * React-controlled inputs, reloads, and asserts on rendered DOM + persisted API
 * state. No GPU cost: the only request it sends is deliberately oversized, so it
 * is rejected by the preflight budget guard before any inference happens.
 *
 * Covers:
 *   open playground · create a conversation from the UI · correct selected model
 *   conversation appears in the sidebar · rename persists · settings persist
 *   across a reload · error state renders · conversation isolation ·
 *   no history leak on switch · responsive smoke test · cleanup
 *
 * Usage: node e2e.mjs <baseUrl>
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].find((p) => existsSync(p));

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const port = 9500 + Math.floor(Math.random() * 300);

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---------------------------------------------------------------- API helpers

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

// ---------------------------------------------------------------- CDP client

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === "Runtime.exceptionThrown") {
        this.consoleErrors.push(msg.params.exceptionDetails?.text ?? "exception");
      }
      if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        this.consoleErrors.push(
          msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "),
        );
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
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

  /** Evaluates an expression in the page and returns its value. */
  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`page eval failed: ${res.exceptionDetails.text}`);
    }
    return res.result?.value;
  }

  /** Evaluates a function body with one argument, JSON-encoded. */
  async call(fnSource, arg) {
    return this.eval(`(${fnSource})(${JSON.stringify(arg ?? null)})`);
  }
}

/** Injected page-side helpers. Kept as strings so they can be re-evaluated. */
const HELPERS = `
window.__e2e = {
  visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  },
  byText(needle, selector) {
    const nodes = Array.from(document.querySelectorAll(selector || 'button, a'));
    return nodes.find((n) => (n.textContent || '').includes(needle) && window.__e2e.visible(n));
  },
  clickText(needle, selector) {
    const el = window.__e2e.byText(needle, selector);
    if (!el) return 'not-found';
    el.click();
    return 'clicked';
  },
  clickAria(label) {
    const el = document.querySelector('[aria-label="' + label + '"]');
    if (!el) return 'not-found';
    el.click();
    return 'clicked';
  },
  setValue(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return 'not-found';
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'set';
  },
  blur(selector) {
    const el = document.querySelector(selector);
    if (!el) return 'not-found';
    el.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
    el.blur();
    return 'blurred';
  },
  text(selector) {
    const el = document.querySelector(selector);
    return el ? (el.textContent || '').trim() : null;
  },
  bodyHas(needle) { return document.body.innerText.includes(needle); },
  alertText() {
    const el = document.querySelector('[role="alert"]');
    return el ? el.textContent.trim() : null;
  },
  overflow() {
    const d = document.documentElement;
    return { scrollW: d.scrollWidth, clientW: d.clientWidth, overflow: d.scrollWidth > d.clientWidth + 1 };
  }
};
'helpers-ready';
`;

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${process.env.TEMP}/gharibo-e2e-${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--no-proxy-server",
    "--proxy-bypass-list=*",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let cdp = null;

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

async function load(pathname = "/playground", settle = 9000) {
  await cdp.send("Page.navigate", { url: `${base}${pathname}` });
  await sleep(settle);
  await cdp.eval(HELPERS);
}

/** Titles of conversations created by this run, for reliable cleanup. */
const TEST_TITLE_PREFIX = "__e2e_";

async function cleanup() {
  const list = await api("/api/conversations");
  const mine = (list.json?.data ?? []).filter((c) => c.title.startsWith(TEST_TITLE_PREFIX));
  for (const c of mine) {
    await api(`/api/conversations/${c.id}`, { method: "DELETE" }).catch(() => {});
  }
  return mine.length;
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
  cdp = new Cdp(ws);

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const baseline = (await api("/api/conversations")).json?.data?.length ?? 0;

  // ------------------------------------------------------------- 1. open
  await load();
  const hydrated = await cdp.eval(
    `Object.keys(document.querySelector('button') || {}).some(k => k.startsWith('__react'))`,
  );
  check("the playground hydrates (React is running)", hydrated === true);
  check(
    "the empty state renders for a fresh session",
    await cdp.eval(`window.__e2e.bodyHas('What shall we test?')`),
  );

  // ------------------------------------------------- 2. create from the UI
  const clickedNew = await cdp.eval(`window.__e2e.clickText('New conversation')`);
  check("the New conversation control is clickable", clickedNew === "clicked", clickedNew);
  await sleep(2500);

  const listAfterCreate = await api("/api/conversations");
  const created = (listAfterCreate.json?.data ?? []).filter((c) => c.title === "New conversation");
  const newCount = (listAfterCreate.json?.data?.length ?? 0) - baseline;
  check("clicking New conversation creates exactly one conversation", newCount === 1, `delta=${newCount}`);

  const activeConv = (listAfterCreate.json?.data ?? [])[0];
  check(
    "the created conversation carries the GHARIBO-V1 routing representation",
    activeConv?.providerId === null && activeConv?.modelId === "GHARIBO-V1",
    `providerId=${activeConv?.providerId} modelId=${activeConv?.modelId}`,
  );
  check(
    "the created conversation uses the safe default output budget",
    activeConv?.maxTokens === 256,
    `maxTokens=${activeConv?.maxTokens}`,
  );

  // ------------------------------------------- 3. correct selected model
  const selectorText = await cdp.eval(
    `window.__e2e.text('[role="combobox"]') || window.__e2e.text('button[role="combobox"]')`,
  );
  check(
    "the model selector shows GHARIBO-V1 (selection is no longer cosmetic)",
    typeof selectorText === "string" && selectorText.includes("GHARIBO-V1"),
    String(selectorText).slice(0, 40),
  );

  // ---------------------------------------- 4. appears in the sidebar list
  check(
    "the new conversation appears in the sidebar",
    await cdp.eval(`window.__e2e.bodyHas('New conversation')`),
  );

  // ------------------------------------------------------- 5. rename
  const renameClicked = await cdp.eval(`window.__e2e.clickAria('Rename New conversation')`);
  await sleep(900);
  const renameTarget = `${TEST_TITLE_PREFIX}renamed`;
  const setTitle = await cdp.eval(
    `window.__e2e.setValue('[aria-label="Conversation title"]', ${JSON.stringify(renameTarget)})`,
  );
  await sleep(400);
  await cdp.eval(`window.__e2e.clickAria('Save title')`);
  await sleep(2000);

  const afterRename = await api(`/api/conversations/${activeConv.id}`);
  check(
    "renaming from the sidebar persists",
    afterRename.json?.data?.title === renameTarget,
    `title=${afterRename.json?.data?.title}`,
  );
  check("the rename control was reachable", renameClicked === "clicked" && setTitle === "set");

  // ------------------------------------------- 6. settings persist on reload
  const presetClicked = await cdp.eval(`window.__e2e.clickText('128', 'button')`);
  await sleep(2000);
  const afterPreset = await api(`/api/conversations/${activeConv.id}`);
  check(
    "changing max output tokens persists",
    afterPreset.json?.data?.maxTokens === 128,
    `maxTokens=${afterPreset.json?.data?.maxTokens}`,
  );
  check("the 128 preset button was clickable", presetClicked === "clicked", presetClicked);

  await load(); // reload
  const afterReload = await api(`/api/conversations/${activeConv.id}`);
  check(
    "settings survive a page reload",
    afterReload.json?.data?.maxTokens === 128 && afterReload.json?.data?.title === renameTarget,
    `maxTokens=${afterReload.json?.data?.maxTokens} title=${afterReload.json?.data?.title}`,
  );
  check(
    "the renamed conversation is still listed after reload",
    await cdp.eval(`window.__e2e.bodyHas(${JSON.stringify(renameTarget)})`),
  );

  // ------------------------------------------------ 7. error state renders
  // Re-open the conversation so the composer is enabled.
  await cdp.eval(`window.__e2e.clickText(${JSON.stringify(renameTarget)})`);
  await sleep(2500);

  const huge = "x".repeat(40000);
  await cdp.eval(`window.__e2e.setValue('textarea[aria-label="Message"]', ${JSON.stringify(huge)})`);
  await sleep(400);
  await cdp.eval(`window.__e2e.clickAria('Send message')`);
  await sleep(3500);

  const alert = await cdp.eval(`window.__e2e.alertText()`);
  check(
    "an oversized prompt renders a readable error state (preflight 413)",
    typeof alert === "string" && /exceeds|budget|development runtime/i.test(alert),
    String(alert).slice(0, 90),
  );

  const afterOversized = await api(`/api/conversations/${activeConv.id}`);
  check(
    "the rejected request persisted no messages",
    (afterOversized.json?.data?.messages ?? []).length === 0,
    `messages=${afterOversized.json?.data?.messages?.length}`,
  );

  // ------------------------------------------------- 8. isolation on switch
  const list2 = await api("/api/conversations");
  const second = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      title: `${TEST_TITLE_PREFIX}second`,
      providerId: null,
      modelId: "GHARIBO-V1",
      maxTokens: 64,
    }),
  });
  const secondId = second.json?.data?.id;
  await load();
  await cdp.eval(`window.__e2e.clickText(${JSON.stringify(`${TEST_TITLE_PREFIX}second`)})`);
  await sleep(2500);

  check(
    "switching to a second conversation shows its own empty state (no history leak)",
    await cdp.eval(`window.__e2e.bodyHas('What shall we test?')`),
  );
  const secondLoaded = await api(`/api/conversations/${secondId}`);
  check(
    "the second conversation has zero history",
    (secondLoaded.json?.data?.messages ?? []).length === 0,
  );

  // Switch back and confirm the first conversation is still intact.
  await cdp.eval(`window.__e2e.clickText(${JSON.stringify(renameTarget)})`);
  await sleep(2500);
  const firstAgain = await api(`/api/conversations/${activeConv.id}`);
  check(
    "switching back keeps the first conversation intact",
    firstAgain.json?.data?.title === renameTarget,
  );

  // ------------------------------------------- 9. responsive smoke test
  for (const [w, h, label] of [
    [1440, 900, "desktop 1440"],
    [1280, 800, "laptop 1280"],
    [1024, 768, "tablet 1024"],
    [390, 844, "mobile 390"],
  ]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: w < 768,
    });
    await sleep(1200);
    await cdp.eval(HELPERS);
    const of = await cdp.eval(`window.__e2e.overflow()`);
    const composer = await cdp.eval(
      `(() => { const t = document.querySelector('textarea[aria-label="Message"]');
         if (!t) return null; const r = t.getBoundingClientRect();
         return { w: Math.round(r.width), visible: window.__e2e.visible(t) }; })()`,
    );
    check(
      `no horizontal overflow at ${label}`,
      of && of.overflow === false,
      of ? `scrollW=${of.scrollW} clientW=${of.clientW}` : "no measurement",
    );
    check(
      `the composer is usable at ${label}`,
      composer?.visible === true && composer.w > 120,
      composer ? `width=${composer.w}px` : "composer not found",
    );
  }

  // ----------------------------------------------------------- 10. cleanup
  const removed = await cleanup();
  check("test conversations were cleaned up", removed >= 2, `removed=${removed}`);
  const finalCount = (await api("/api/conversations")).json?.data?.length ?? -1;
  check("the conversation count is back to baseline", finalCount === baseline, `now=${finalCount} baseline=${baseline}`);

  const serious = cdp.consoleErrors.filter(
    (e) => !/favicon|Download the React DevTools|preload/i.test(e),
  );
  check("no unexpected console errors", serious.length === 0, serious.slice(0, 2).join(" | "));

  ws.close();
} catch (error) {
  check("the E2E run completed without throwing", false, error.message);
} finally {
  await cleanup().catch(() => {});
  chrome.kill();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} E2E checks passed`);
process.exitCode = failed.length === 0 ? 0 : 1;
