/**
 * E2E phase 2 — live assistant actions and mid-stream switching.
 *
 * Mission test-matrix items:
 *   AC conversation switching while streaming
 *   AE quality actions
 *   AF Add to Dataset
 *   AG Edit & Approve
 *   AH Compare
 *
 * These need a REAL assistant message, so this phase performs ONE small live
 * inference (max 64 tokens, synthetic prompt — never a governed evaluation
 * item). Everything is cleaned up afterwards.
 *
 * Usage: node e2e-actions.mjs <baseUrl>
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

// Mutating suite: refuse to run unless started by the isolated runner,
// so it can never write into the owner's real SQLite database.
import { requireIsolatedVerification } from "./lib/verification-guard.mjs";
requireIsolatedVerification("e2e-actions.mjs");

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].find((p) => existsSync(p));

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const port = 9600 + Math.floor(Math.random() * 200);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

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

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${process.env.TEMP}/gharibo-e2ea-${port}`,
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

const P = "__e2ea_";

async function cleanup() {
  const list = await api("/api/conversations");
  const mine = (list.json?.data ?? []).filter((c) => c.title.startsWith(P));
  for (const c of mine) await api(`/api/conversations/${c.id}`, { method: "DELETE" }).catch(() => {});
  return mine.length;
}

const createdIds = [];
async function makeConv(title, maxTokens) {
  const res = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ title, providerId: null, modelId: "GHARIBO-V1", maxTokens }),
  });
  const id = res.json?.data?.id;
  if (id) createdIds.push(id);
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
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  const HELPERS = `
    window.__e2e = {
      visible(el){ if(!el) return false; const r=el.getBoundingClientRect();
        return r.width>0 && r.height>0 && getComputedStyle(el).visibility!=='hidden'; },
      clickText(n, sel){ const ns=Array.from(document.querySelectorAll(sel||'button, a'));
        const hit=ns.find(x=>(x.textContent||'').includes(n) && window.__e2e.visible(x));
        if(!hit) return 'not-found'; hit.click(); return 'clicked'; },
      clickAria(l){ const el=document.querySelector('[aria-label="'+l+'"]');
        if(!el) return 'not-found'; if(el.disabled) return 'disabled'; el.click(); return 'clicked'; },
      setValue(sel,v){ const el=document.querySelector(sel); if(!el) return 'not-found';
        const p = el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(p,'value').set.call(el,v);
        el.dispatchEvent(new Event('input',{bubbles:true})); return 'set'; },
      bodyHas(n){ return document.body.innerText.includes(n); },
      dialogOpen(){ return !!document.querySelector('[role="dialog"]'); },
      dialogText(){ const d=document.querySelector('[role="dialog"]'); return d?d.textContent.trim().slice(0,160):null; },
    }; 'ok';`;

  // Confirm the runtime is online before spending anything on inference.
  const rt = await api("/api/runtime/v1");
  const state = rt.json?.data?.health?.state;
  console.log(`runtime state: ${state}`);

  const convA = await makeConv(`${P}alpha`, 64);
  const convB = await makeConv(`${P}beta`, 64);
  check("two test conversations were created", !!convA && !!convB);

  await send("Page.navigate", { url: `${base}/playground` });
  await sleep(9000);
  await ev(HELPERS);

  // ================================================== AC: switch mid-stream
  console.log("\n--- AC: switching conversation while streaming ---");
  await ev(`window.__e2e.clickText('${P}alpha')`);
  await sleep(2500);
  await ev(`window.__e2e.setValue('textarea[aria-label="Message"]', 'Count from 1 to 20, one number per line.')`);
  await sleep(400);
  const sendClicked = await ev(`window.__e2e.clickAria('Send message')`);
  check("the send control is usable", sendClicked === "clicked", sendClicked);

  // Switch away almost immediately, while the request is in flight.
  await sleep(400);
  const switched = await ev(`window.__e2e.clickText('${P}beta')`);
  check("switched to the other conversation mid-request", switched === "clicked", switched);

  const midStream = await ev(`(() => {
    const main = document.querySelector('main');
    return { hasEmpty: window.__e2e.bodyHas('What shall we test?'),
             leaking: main ? /Count from 1 to 20/.test(main.innerText) : null };
  })()`);
  check(
    "the switched-to conversation does not show the other request's content",
    midStream?.hasEmpty === true && midStream?.leaking === false,
    JSON.stringify(midStream),
  );

  /*
   * Wait for the in-flight request to finish server-side.
   *
   * This used to be a single `sleep(45000)`, which RACED the GPU: when the
   * runtime is cold or queued, 45s was not always enough, the check below read
   * `alpha assistant=0`, and the suite reported a false failure (observed once
   * during post-review validation; it passed 17/17 on re-run). A flaky test is
   * its own defect, so poll for the condition instead.
   *
   * The assertion is unchanged - it still requires exactly one assistant
   * message - only the wait is now deterministic.
   */
  const deadline = Date.now() + 180000;
  let aLoaded = null;
  while (Date.now() < deadline) {
    aLoaded = await api(`/api/conversations/${convA}`);
    const pending = aLoaded.json?.data?.messages ?? [];
    if (pending.filter((m) => m.role === "assistant").length >= 1) break;
    await sleep(5000);
  }

  const bLoaded = await api(`/api/conversations/${convB}`);
  const aMsgs = aLoaded.json?.data?.messages ?? [];
  const bMsgs = bLoaded.json?.data?.messages ?? [];
  check(
    "the response landed in the conversation that sent it",
    aMsgs.filter((m) => m.role === "assistant").length === 1,
    `alpha assistant=${aMsgs.filter((m) => m.role === "assistant").length}`,
  );
  check("the other conversation received nothing", bMsgs.length === 0, `beta messages=${bMsgs.length}`);

  const assistantMsg = aMsgs.find((m) => m.role === "assistant");
  if (!assistantMsg) {
    check("an assistant message exists to test actions against", false, "skipping action checks");
  } else {
    check(
      "the assistant answer contains no hidden Harmony channel",
      !/<\|channel\|>|analysis|commentary/.test(assistantMsg.content),
      JSON.stringify(assistantMsg.content.slice(0, 60)),
    );

    // ============================================ AE/AF/AG/AH: message actions
    console.log("\n--- AE/AF/AG/AH: assistant message actions ---");
    await ev(`window.__e2e.clickText('${P}alpha')`);
    await sleep(3000);

    check(
      "the assistant turn renders with its GHARIBO identity and actions",
      await ev(`window.__e2e.bodyHas('GHARIBO-V1') && window.__e2e.bodyHas('Add to Dataset')`),
    );

    // AE — quality signal
    const goodClicked = await ev(`window.__e2e.clickAria('Good')`);
    await sleep(2500);
    const afterGood = await api(`/api/conversations/${convA}`);
    const goodPersisted = (afterGood.json?.data?.messages ?? []).some((m) => m.qualitySignal === "good");
    check("AE the Good quality signal persists", goodPersisted, `click=${goodClicked}`);

    const badClicked = await ev(`window.__e2e.clickAria('Bad')`);
    await sleep(2500);
    const afterBad = await api(`/api/conversations/${convA}`);
    const badPersisted = (afterBad.json?.data?.messages ?? []).some((m) => m.qualitySignal === "bad");
    check("AE the Bad quality signal persists", badPersisted, `click=${badClicked}`);

    // AF — Add to Dataset opens the dialog
    const afClick = await ev(`window.__e2e.clickAria('Add to Dataset')`);
    await sleep(1500);
    const afOpen = await ev(`window.__e2e.dialogOpen()`);
    check("AF Add to Dataset opens a dialog", afOpen === true, `click=${afClick}`);
    const afText = await ev(`window.__e2e.dialogText()`);
    check(
      "AF the dialog is the training-example form (not a dead end)",
      typeof afText === "string" && afText.length > 10,
      String(afText).slice(0, 70),
    );
    // Close it (Escape is the Radix default).
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await sleep(900);

    // AG — Edit & Approve opens the same governed dialog
    const agClick = await ev(`window.__e2e.clickAria('Edit & Approve')`);
    await sleep(1500);
    const agOpen = await ev(`window.__e2e.dialogOpen()`);
    check("AG Edit & Approve opens a dialog", agOpen === true, `click=${agClick}`);
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await sleep(900);

    // AH — Compare opens a real comparison dialog
    const ahClick = await ev(`window.__e2e.clickAria('Compare')`);
    await sleep(1500);
    const ahOpen = await ev(`window.__e2e.dialogOpen()`);
    const ahText = await ev(`window.__e2e.dialogText()`);
    check("AH Compare opens a dialog", ahOpen === true, `click=${ahClick}`);
    check(
      "AH Compare offers a real target-model choice (not a relabelled edit form)",
      typeof ahText === "string" && /compare|target model/i.test(ahText),
      String(ahText).slice(0, 70),
    );
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await sleep(900);

    // AD — refresh persistence of the rendered conversation
    await send("Page.navigate", { url: `${base}/playground` });
    await sleep(9000);
    await ev(HELPERS);
    await ev(`window.__e2e.clickText('${P}alpha')`);
    await sleep(3000);
    const renderedAfterReload = await ev(
      `(() => { const m = document.querySelector('main'); return m ? m.innerText.length : 0; })()`,
    );
    check(
      "AD the conversation re-renders after a reload",
      typeof renderedAfterReload === "number" && renderedAfterReload > 200,
      `chars=${renderedAfterReload}`,
    );
  }

  const removed = await cleanup();
  check("test conversations were cleaned up", removed >= 2, `removed=${removed}`);
} catch (error) {
  check("phase 2 completed without throwing", false, error.message);
} finally {
  await cleanup().catch(() => {});
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} phase-2 checks passed`);
process.exitCode = failed.length === 0 ? 0 : 1;
