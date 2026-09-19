/**
 * Verifies the two sidebar features built during the redesign but never
 * exercised by any earlier suite:
 *
 *   1. search filtering  - typing narrows the conversation list
 *   2. delete flow       - the row's delete button asks for confirmation and
 *                          only then removes the conversation
 *
 * Test conversations are created and deleted here; the owner's existing
 * conversations are never modified or removed.
 *
 * Usage: node sidebar-features.mjs <baseUrl> [theme]
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
const port = 8900 + Math.floor(Math.random() * 80);

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
    `--user-data-dir=${process.env.TEMP}/gharibo-sidebar-${port}`,
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

/**
 * Counts conversation rows currently rendered.
 *
 * Queried document-wide: the earlier version tried to derive the sidebar
 * container by walking up from the search input and silently returned 0.
 * Without a TERM it counts every row (rows are the only buttons showing a
 * relative timestamp); with one it counts only matching rows.
 */
const COUNT_ROWS = (term) => `(() => {
  const rows = Array.from(document.querySelectorAll('button'))
    .filter((b) => /ago|just now/.test(b.textContent || ''));
  ${term ? `const t = rows.filter((b) => (b.textContent || '').includes('${term}')); return t.length;` : "return rows.length;"}
})()`;

const created = [];
async function makeConv(title) {
  const r = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      title,
      providerId: null,
      modelId: "GHARIBO-V1",
      maxTokens: 64,
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

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });

  // Distinctive names so a search can match exactly one of them.
  const uniq = `zebra${Date.now().toString().slice(-6)}`;
  await makeConv(`__sb_${uniq}_alpha`);
  await makeConv(`__sb_${uniq}_beta`);

  await send("Page.navigate", { url: `${base}/playground` });
  await sleep(8000);

  const total = await ev(COUNT_ROWS());
  check("conversation rows render in the sidebar", typeof total === "number" && total > 0, `${total} rows`);

  // ------------------------------------------------------------ 1. search
  const searchBox = await ev(`!!document.querySelector('input[aria-label="Search conversations"]')`);
  check("the search input exists", searchBox === true);

  // Type with real input events.
  const boxRect = await ev(`(() => {
    const i = document.querySelector('input[aria-label="Search conversations"]');
    if (!i) return null;
    const r = i.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (boxRect) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: boxRect.x, y: boxRect.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: boxRect.x, y: boxRect.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: boxRect.x, y: boxRect.y, button: "left", clickCount: 1 });
    await sleep(300);
    await send("Input.insertText", { text: uniq });
    await sleep(1200);

    const filtered = await ev(COUNT_ROWS(uniq));
    check(
      "typing a unique term filters the list to just those conversations",
      typeof filtered === "number" && filtered > 0 && filtered < total,
      `${total} -> ${filtered} rows`,
    );

    const onlyMatches = await ev(`(() => {
      const rows = Array.from(document.querySelectorAll('button'))
        .filter((b) => /ago|just now/.test(b.textContent || ''));
      const texts = rows.map((b) => b.textContent || '');
      return { n: texts.length, allMatch: texts.every((t) => t.includes('${uniq}')) };
    })()`);
    check(
      "every visible row matches the search term",
      onlyMatches?.allMatch === true,
      `${onlyMatches?.n} rows, allMatch=${onlyMatches?.allMatch}`,
    );

    // A term that matches nothing shows the empty message, not a stale list.
    await send("Input.insertText", { text: "zzzznomatchzzzz" });
    await sleep(1200);
    const emptyShown = await ev(`document.body.innerText.includes('No conversations match that search')`);
    const rowsNow = await ev(COUNT_ROWS());
    check(
      "a non-matching search shows the empty message with no rows",
      emptyShown === true && rowsNow === 0,
      `rows=${rowsNow}, message=${emptyShown}`,
    );

    // Clear it again.
    await ev(`(() => {
      const i = document.querySelector('input[aria-label="Search conversations"]');
      if (!i) return;
      i.focus();
      return true;
    })()`);
    for (let i = 0; i < 60; i += 1) {
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
    }
    await sleep(1200);
    const restored = await ev(COUNT_ROWS());
    check(
      "clearing the search restores the FULL list",
      typeof restored === "number" && restored === total,
      `${restored} rows (expected ${total})`,
    );
  }

  // ------------------------------------------------------------ 2. delete
  const before = (await api("/api/conversations")).json?.data?.length ?? 0;

  // The delete control is hover-revealed; click it on a row we created.
  // Delete buttons are hover-revealed but still present in the DOM and
  // focusable, so a document-wide aria-label lookup finds them reliably.
  const clickedDelete = await ev(`(() => {
    const del = Array.from(document.querySelectorAll('button'))
      .find((b) => {
        const a = b.getAttribute('aria-label') || '';
        return a.startsWith('Delete ') && a.includes('${uniq}');
      });
    if (!del) return 'not-found';
    del.click();
    return 'clicked';
  })()`);
  check("the delete control is reachable on a conversation row", clickedDelete === "clicked", clickedDelete);

  // Confirmation must be required: nothing deleted yet.
  await sleep(1200);
  const midway = (await api("/api/conversations")).json?.data?.length ?? 0;
  check(
    "the first click only asks for confirmation (nothing deleted yet)",
    midway === before,
    `${before} -> ${midway}`,
  );

  const confirmSeen = await ev(`(() => {
    const c = Array.from(document.querySelectorAll('button'))
      .find((b) => (b.getAttribute('aria-label') || '') === 'Confirm delete');
    if (!c) return false;
    c.click();
    return true;
  })()`);
  check("a confirm control appears", confirmSeen === true);
  await sleep(2200);

  const after = (await api("/api/conversations")).json?.data?.length ?? 0;
  check(
    "confirming removes exactly one conversation",
    after === before - 1,
    `${before} -> ${after}`,
  );

  const survivor = (await api("/api/conversations")).json?.data?.some((c) => c.title.includes(uniq));
  check("the other matching conversation was not removed", survivor === true);

  ws.close();
} catch (error) {
  console.log(`SIDEBAR_ERROR: ${error.message}`);
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
console.log(`\n${results.length - failed.length}/${results.length} sidebar feature checks passed`);
if (failed.length) for (const f of failed) console.log(`  ${f.name}  ${f.detail ?? ""}`);
process.exitCode = failed.length === 0 ? 0 : 1;
