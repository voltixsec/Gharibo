/**
 * Rename UX + title presentation acceptance.
 *
 * Complements history-titles-acceptance.mjs by covering the interaction details
 * the feature brief calls out explicitly:
 *   F. Escape cancels a rename (nothing is persisted)
 *   G. a blank title must not replace the existing title
 *   H. sidebar search finds a conversation by its PERSISTED title (auto or manual)
 *   I. a long title truncates VISUALLY while the full title remains persisted
 *
 * Usage: node rename-ux-acceptance.mjs <baseUrl> [theme]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

// Mutating suite: refuse to run unless started by the isolated runner,
// so it can never write into the owner's real SQLite database.
import { requireIsolatedVerification } from "./lib/verification-guard.mjs";
requireIsolatedVerification("rename-ux-acceptance.mjs");

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].find((p) => existsSync(p));

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const theme = process.argv[3] ?? "dark";
const port = 8300 + Math.floor(Math.random() * 80);

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
    `--user-data-dir=${process.env.TEMP}/gharibo-renameux-${port}`,
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

let ws;
const ids = [];

/** Opens the sidebar rename input for a conversation by its visible title. */
async function openRename(ev, title) {
  return ev(`(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find((b) => (b.getAttribute('aria-label') || '').startsWith('Rename ') &&
                   (b.getAttribute('aria-label') || '').includes(${JSON.stringify(title)}));
    if (!btn) return 'no-button';
    btn.click();
    return 'clicked';
  })()`);
}

async function focusRenameInput(ev) {
  return ev(`(() => {
    const input = document.querySelector('input[aria-label="Conversation title"]');
    if (!input) return 'no-input';
    input.focus();
    return 'focused';
  })()`);
}

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

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });

  const LONG_TITLE =
    "A deliberately very long conversation title that must be truncated visually " +
    "in the sidebar without losing the persisted value";

  const created = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ title: "Rename UX Subject", providerId: null, modelId: "GHARIBO-V1" }),
  });
  const id = created.json?.data?.id;
  ids.push(id);
  check("a subject conversation exists", Boolean(id), id ? id.slice(0, 8) : "none");

  await send("Page.navigate", { url: `${base}/playground` });
  await sleep(7500);

  // ------------------------------------------------- F: Escape cancels
  const beforeEscape = (await api(`/api/conversations/${id}`)).json?.data?.title;
  let opened = await openRename(ev, beforeEscape);
  check("F: the rename control opens", opened === "clicked", opened);
  await sleep(600);

  await focusRenameInput(ev);
  await send("Input.insertText", { text: "Discarded By Escape" });
  await sleep(400);
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(2000);

  const afterEscape = (await api(`/api/conversations/${id}`)).json?.data?.title;
  check(
    "F: Escape cancels the rename (nothing persisted)",
    afterEscape === beforeEscape,
    `before="${beforeEscape}" after="${afterEscape}"`,
  );
  const stillShowsNew = await ev(`document.body.innerText.includes('Discarded By Escape')`);
  check("F: the discarded text is not shown", stillShowsNew === false, `shown=${stillShowsNew}`);

  // ------------------------------------------------- G: blank rejected
  opened = await openRename(ev, beforeEscape);
  check("G: the rename control reopens", opened === "clicked", opened);
  await sleep(600);
  await focusRenameInput(ev);
  // Select all and delete, leaving a blank field.
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
  await sleep(400);
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(2000);

  const afterBlank = (await api(`/api/conversations/${id}`)).json?.data?.title;
  check(
    "G: a blank title does not replace the existing title",
    afterBlank === beforeEscape && afterBlank !== "",
    `title="${afterBlank}"`,
  );

  // ------------------------------------------------- H: search by persisted title
  await api(`/api/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: LONG_TITLE }),
  });
  await send("Page.navigate", { url: `${base}/playground` });
  await sleep(7500);

  const boxRect = await ev(`(() => {
    const i = document.querySelector('input[aria-label="Search conversations"]');
    if (!i) return null;
    const r = i.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  check("H: the search input is present", boxRect !== null);

  // Search by a fragment that only exists in the PERSISTED title.
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: boxRect.x, y: boxRect.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: boxRect.x, y: boxRect.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: boxRect.x, y: boxRect.y, button: "left", clickCount: 1 });
  await sleep(300);
  await send("Input.insertText", { text: "truncated visually" });
  await sleep(1500);

  const searchState = await ev(`(() => {
    const body = document.body.innerText;
    return {
      showsEmptyMessage: body.includes("No conversations match that search"),
      showsLongTitle: body.includes("A deliberately very long conversation title"),
    };
  })()`);
  check(
    "H: search finds the conversation by its persisted title",
    searchState.showsLongTitle === true && searchState.showsEmptyMessage === false,
    JSON.stringify(searchState),
  );

  // ------------------------------------------------- I: visual truncation
  /*
   * The title appears in more than one place (sidebar row and active header),
   * and the header is wide enough that a 125-char title may not overflow at all.
   * Asserting `scrollWidth > clientWidth` on whichever element happens to come
   * first therefore measures the wrong element. What actually matters is that
   * the SIDEBAR row is configured to clip with an ellipsis while still holding
   * the complete string - so assert the computed truncation style plus the
   * untouched text content.
   */
  const trunc = await ev(`(() => {
    const spans = Array.from(document.querySelectorAll('span'))
      .filter((s) => (s.textContent || "").startsWith("A deliberately very long"));
    if (!spans.length) return { found: false };
    return {
      found: true,
      items: spans.map((s) => {
        const cs = getComputedStyle(s);
        return {
          fullText: s.textContent,
          width: Math.round(s.getBoundingClientRect().width),
          clipped: s.scrollWidth > s.clientWidth,
          textOverflow: cs.textOverflow,
          overflow: cs.overflow,
          whiteSpace: cs.whiteSpace,
        };
      }),
    };
  })()`);
  check("I: the long title is rendered", trunc.found === true);
  if (trunc.found) {
    const clipping = (trunc.items || []).filter(
      (i) => i.textOverflow === "ellipsis" && i.overflow === "hidden" && i.whiteSpace === "nowrap",
    );
    check(
      "I: the title element clips with an ellipsis (truncate configured)",
      clipping.length > 0,
      JSON.stringify((trunc.items || []).map((i) => ({
        w: i.width, clip: i.clipped, to: i.textOverflow, of: i.overflow, ws: i.whiteSpace,
      }))),
    );
    const full = (trunc.items || []).every((i) => i.fullText === LONG_TITLE);
    check(
      "I: the FULL title is preserved in the element (not cut in data)",
      full,
      `persisted ${LONG_TITLE.length} chars`,
    );
  }

  const persistedLong = (await api(`/api/conversations/${id}`)).json?.data?.title;
  check("I: the persisted title is the full string", persistedLong === LONG_TITLE, `len=${(persistedLong || "").length}`);

  ws.close();
} catch (error) {
  console.log(`RENAME_UX_ERROR: ${error.message}`);
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
console.log(`\n${results.length - failed.length}/${results.length} rename-UX checks passed`);
if (failed.length) for (const f of failed) console.log(`  ${f.name}  ${f.detail ?? ""}`);
process.exitCode = failed.length === 0 ? 0 : 1;
