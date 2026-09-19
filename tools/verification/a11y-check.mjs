/**
 * Keyboard, focus-visibility and accessible-name checks (mission section 14).
 *
 * "focus states visible, keyboard navigation reasonable, ARIA labels where
 * appropriate" — verified with REAL Tab/Enter key presses dispatched through the
 * DevTools Protocol, so `:focus-visible` behaves exactly as it does for a
 * keyboard user (synthetic events would not).
 *
 * SEQUENCING MATTERS: each phase starts from a fresh page load. Chrome continues
 * sequential focus navigation from wherever focus currently is, so running the
 * skip-link test after a 40-press sweep left focus inside the navigation — and
 * the Enter press then followed a nav link instead of the skip link, navigating
 * the page away and failing every later check. Each phase reloads first.
 *
 * Usage: node a11y-check.mjs <baseUrl> [theme]
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
const port = 9300 + Math.floor(Math.random() * 120);

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
    `--user-data-dir=${process.env.TEMP}/gharibo-a11y-${port}`,
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

const FOCUS_PROBE = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: 'BODY', none: true };
  const cs = getComputedStyle(el);
  const outlineVisible = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
  const shadow = cs.boxShadow && cs.boxShadow !== 'none';
  return {
    tag: el.tagName,
    href: el.getAttribute('href'),
    label: el.getAttribute('aria-label'),
    text: (el.textContent || '').trim().slice(0, 40),
    hasIndicator: outlineVisible || shadow,
    path: location.pathname,
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

  const KEYS = {
    Tab: { windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, key: "Tab", code: "Tab" },
    Enter: { windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, key: "Enter", code: "Enter" },
    Escape: { windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: "Escape", code: "Escape" },
  };
  async function press(name) {
    const k = KEYS[name];
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...k });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...k });
    await sleep(140);
  }

  /** Navigates and waits, so every phase starts from a known focus state. */
  async function freshLoad(pathname = "/playground", settle = 9000) {
    await send("Page.navigate", { url: `${base}${pathname}` });
    await sleep(settle);
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });

  // ============================================================ 1. skip links
  // FIRST, on a fresh load, because focus position carries across phases.
  await freshLoad();

  await press("Tab");
  const firstStop = await ev(FOCUS_PROBE);
  check(
    "the first Tab stop is a skip link",
    /skip to/i.test(firstStop?.text || ""),
    `"${(firstStop?.text || "").slice(0, 40)}" (${firstStop?.tag})`,
  );

  await press("Enter");
  await sleep(600);
  const afterSkip = await ev(FOCUS_PROBE);
  check(
    "activating the skip link moves focus out of the navigation",
    afterSkip?.tag === "MAIN" || afterSkip?.tag === "TEXTAREA",
    `${afterSkip?.tag} "${(afterSkip?.text || "").slice(0, 30)}"`,
  );
  check("the skip link did not navigate away", afterSkip?.path === "/playground", `path=${afterSkip?.path}`);

  await press("Tab");
  const secondStop = await ev(FOCUS_PROBE);
  const isComposerSkip = /composer/i.test(secondStop?.text || "");
  check(
    "the Playground offers a composer bypass",
    isComposerSkip,
    `"${(secondStop?.text || "").slice(0, 40)}"`,
  );

  if (isComposerSkip) {
    await press("Enter");
    await sleep(700);
    // Focus may land on the composer REGION (a div) or, when a conversation is
    // selected, on the textarea itself. Both are correct: the region is the
    // target precisely because the textarea is disabled with no conversation.
    const landed = await ev(`(() => {
      const el = document.activeElement;
      if (!el) return null;
      return {
        tag: el.tagName,
        id: el.id,
        insideComposer: !!(el.closest && el.closest("#gharibo-composer")) || el.id === "gharibo-composer",
        label: el.getAttribute("aria-label"),
      };
    })()`);
    check(
      "the composer bypass lands focus in the composer",
      landed?.insideComposer === true,
      `${landed?.tag}#${landed?.id || ""}`,
    );
  } else {
    check("the composer bypass lands focus in the composer", false, "no bypass link found");
  }

  // ================================================== 2. focus visibility sweep
  await freshLoad();
  let focusedCount = 0;
  let withoutIndicator = 0;
  const seenTags = [];
  for (let i = 0; i < 40; i += 1) {
    await press("Tab");
    const info = await ev(FOCUS_PROBE);
    if (!info || info.none) continue;
    focusedCount += 1;
    seenTags.push(`${info.tag}${info.label ? "[" + info.label + "]" : ""}`);
    if (!info.hasIndicator) withoutIndicator += 1;
  }
  check("Tab reaches interactive elements", focusedCount >= 8, `${focusedCount} focusable stops in 40 presses`);
  check(
    "every focused element shows a visible focus indicator",
    withoutIndicator === 0,
    withoutIndicator ? `${withoutIndicator} without outline or ring` : `all ${focusedCount} show outline/ring`,
  );
  check("the primary navigation is keyboard reachable", seenTags.some((t) => t.startsWith("A[")));
  check(
    "form controls are keyboard reachable",
    seenTags.some((t) => t.startsWith("INPUT") || t.startsWith("TEXTAREA")),
    seenTags.filter((t) => /INPUT|TEXTAREA/.test(t)).slice(0, 2).join(", ") || "none in first 40 stops",
  );

  // ====================================================== 3. accessible names
  const unnamed = await ev(`(() => {
    const sel = 'button, [role="button"], a[href], input, textarea, select, [role="combobox"], [role="slider"]';
    const bad = [];
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const labelledByFor = el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      const wrappingLabel = el.closest('label');
      const named =
        (el.getAttribute('aria-label') || '').trim() ||
        (el.getAttribute('aria-labelledby') || '').trim() ||
        (el.getAttribute('title') || '').trim() ||
        (el.textContent || '').trim() ||
        (el.getAttribute('placeholder') || '').trim() ||
        (el.getAttribute('alt') || '').trim() ||
        (labelledByFor ? labelledByFor.textContent.trim() : '') ||
        (wrappingLabel ? wrappingLabel.textContent.trim() : '');
      if (!named) bad.push(el.tagName + '#' + (el.id || '') + '.' + String(el.className).split(' ')[0]);
    }
    return { count: bad.length, sample: bad.slice(0, 6) };
  })()`);
  check(
    "every visible interactive control has an accessible name",
    unnamed?.count === 0,
    unnamed?.count ? `${unnamed.count}: ${unnamed.sample.join(", ")}` : "all named",
  );

  // ============================================================ 4. landmarks
  const landmarks = await ev(`(() => ({
    nav: document.querySelectorAll('nav').length,
    main: document.querySelectorAll('main').length,
    aside: document.querySelectorAll('aside').length,
    h1: document.querySelectorAll('h1').length,
    live: document.querySelectorAll('[role="status"], [role="alert"]').length,
  }))()`);
  check("page landmarks exist (main / nav)", landmarks?.main >= 1 && landmarks?.nav >= 1, JSON.stringify(landmarks));

  // ============================================== 5. drawer keyboard operation
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await freshLoad("/playground", 7000);

  const toggleExists = await ev(`!!document.querySelector('[aria-label="Show inspector"]')`);
  check("the inspector toggle exists on a narrow viewport", toggleExists === true);

  await ev(`document.querySelector('[aria-label="Show inspector"]')?.click()`);
  await sleep(1400);
  const drawerPresent = await ev(`!!document.querySelector('[aria-label="Close inspector"]')`);
  check("a drawer opens on a narrow viewport", drawerPresent === true);

  // Reached by REAL Tab presses: `el.focus()` does not engage :focus-visible,
  // so a programmatic focus would report a missing indicator that a keyboard
  // user would never experience.
  let reachedClose = null;
  for (let i = 0; i < 12; i += 1) {
    await press("Tab");
    const info = await ev(FOCUS_PROBE);
    if (info?.label === "Close inspector") {
      reachedClose = info;
      break;
    }
  }
  check(
    "the drawer close control is reachable by Tab and shows focus",
    reachedClose?.hasIndicator === true,
    reachedClose ? `indicator=${reachedClose.hasIndicator}` : "not reached in 12 presses",
  );

  await press("Escape");
  await sleep(900);
  const stillOpen = await ev(`!!document.querySelector('[aria-label="Close inspector"]')`);
  check("Escape closes the drawer", stillOpen === false, stillOpen ? "still open" : "closed");

  ws.close();
} catch (error) {
  check("the a11y run completed without throwing", false, error.message);
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} accessibility checks passed`);
if (failed.length) {
  console.log("\nFailures:");
  for (const f of failed) console.log(`  ${f.name}  ${f.detail ?? ""}`);
}
process.exitCode = failed.length === 0 ? 0 : 1;
