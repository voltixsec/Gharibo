# PLAYGROUND_V2_REPORT

**GHARIBO AI LAB — Playground V2 overhaul**
Branch: `playground-v2` · Base commit: `b62e859` · Date: 2026-09-19

---

## 1. Executive summary

The Playground was rebuilt end-to-end and the GHARIBO-V1 serving contract was hardened.

Eight defects were **correctness** bugs, not cosmetics. Four were found by reading the code:
model selection was cosmetic (every conversation silently routed to GHARIBO-V1), the health
probe targeted an endpoint the serving service never implemented, the default output budget
could OOM the development GPU, and the client's stream parser silently dropped tokens split
across network chunk boundaries. Four more were found by an **automated browser E2E** built
during this work, which the unit suites could not have caught: failure notices were invisible
in an empty conversation, switching conversations briefly displayed the previous one's
messages, a superseded request could write state into the wrong conversation, and a client
disconnect discarded an already-generated answer.

All eight are fixed and covered by tests. The Playground is now a three-pane GHARIBO-branded
workspace with a real conversation sidebar, a document-style chat view, a settings/telemetry
inspector, and working drawers on small screens.

The model smoke suite (§13) additionally surfaced **two model-level findings** that are NOT
application defects and are reported rather than patched: the model reproducibly fails one
decimal-multiplication step (0/5 samples correct), and it claims tool capabilities it does not
have — root-caused to a default `model_identity` of "You are ChatGPT" injected by the
accepted chat template. Fixing the latter is a one-line change that would alter the served
prompt contract, so it is deferred to the owner.

Because this work changed shared code — the dashboard layout, the navigation
sidebar and the whole colour token system — every dashboard route was regression-checked,
not just the Playground. That found and fixed a pre-existing WCAG failure on four other
pages, and a keyboard/assistive-technology audit added the missing bypass links, labelled the
temperature slider and made the drawers Escape-closable.

**Validation: typecheck PASS · 381/381 unit tests PASS · production build PASS ·
`docs:validate` PASS · `verify:m2` PASS · 53/53 serving tests PASS · 13/13 API checks PASS ·
14/14 live runtime checks PASS · 47/47 browser E2E checks PASS · 90/90 cross-page checks PASS ·
15/15 accessibility checks PASS · 9/11 smoke checks PASS (2 model-level findings) ·
WCAG AA contrast PASS in both themes.**

No model identity, adapter, weights, or governance safeguard was changed. Nothing was pushed or
merged.

---

## 2. Initial defects discovered

Verified against the **local** working tree (not GitHub `main`).

| # | Defect | Severity | Evidence |
|---|--------|----------|----------|
| D1 | **Model selection was cosmetic.** `page.tsx` created every conversation with `providerId: null, modelId: null`, discarding the user's choice; `chat-view.tsx` then sent the V1 sentinel on *every* request. Every conversation routed to GHARIBO-V1 regardless of the dropdown. | Critical | `page.tsx:33-40`, `chat-view.tsx:57` (pre-change) |
| D2 | **Health probe targeted a non-existent endpoint.** `checkV1Health` probed `GET /v1/models`, which `services/gharibo-v1-serving/app/main.py` never implemented → a healthy runtime reported OFFLINE. | Critical | `gharibo-v1.mjs` vs `main.py` route table |
| D3 | **Unsafe default output budget.** UI default 2048, canonical runtime default 3072, on a T4 with ~11.6 GiB of ~14.56 GiB already resident. A client could request a huge `max_tokens` and OOM the worker. | Critical | `chat-controls.tsx:30`, `gharibo-v1.mjs:61` |
| D4 | **Stream parser dropped tokens.** `text.split("\n")` per network chunk, then `catch { /* skip */ }`. A JSON record split across two chunks was silently discarded. | Critical | `chat-view.tsx:77-104` (pre-change) |
| D5 | **Non-deterministic message order.** `ORDER BY created_at ASC` only; two messages can share a millisecond timestamp, flipping user/assistant order. | High | `conversations.ts` |
| D6 | **Unsupported content silently accepted.** `ChatMessage.content: str` rejected OpenAI content arrays with 422; a naive fix would silently drop images. | Medium | `main.py` (pre-change) |
| D7 | **No preflight token budget.** Oversized prompts went straight to the GPU and failed as an opaque CUDA error. | High | `main.py` (pre-change) |
| D8 | **Fake capability implications.** UI implied vision/tools the model does not have; "Compare" merely reopened the edit dialog. | Medium | `message-bubble.tsx` (pre-change) |
| D9 | **`stream: true` rejected at HEAD but implemented locally**, with the test never updated → a pre-existing failing test. | Medium | `test_serving.py::test_stream_true_is_rejected` |
| D10 | **Failure notices were invisible in an empty conversation.** The notice rendered only inside the non-empty branch, but a rejected request leaves the conversation empty — so the most common error path showed the user nothing. | High | found by browser E2E |
| D11 | **Switching conversations displayed the previous conversation's messages** until the new fetch resolved. | High | found by browser E2E |
| D12 | **A superseded request could write state into the wrong conversation** (stale notice / busy flag after an await). | High | found by browser E2E |
| D13 | **A client disconnect discarded a valid answer.** Next.js propagates the request's abort signal to `fetch`, so navigating away aborted the upstream inference and the already-generated answer was thrown away. | High | found by browser E2E |
| D14 | **Badge contrast failed WCAG AA on four other pages** (3.3:1 and ~2.2:1 vs 4.5:1 required for 12px text). **Pre-existing** — `badge.tsx` was untouched by this branch — but surfaced because this work changed the shared layout and the whole colour token system. | Medium | found by cross-page check |
| D15 | **No keyboard bypass past the navigation** (WCAG 2.4.1), **an unnamed temperature slider**, and **drawers that ignored Escape**. | Medium | found by accessibility audit |
| D16 | **Light-mode primary failed WCAG AA on four routes** (3.57:1 vs 4.5:1). A regression from this branch's own theme work, invisible in dark mode. | Medium | found by running the cross-page check in light mode |

---

## 3. Root causes

- **D1** — Two independent layers each made the same wrong assumption. The page dropped the
  selection, *and* the chat view hardcoded the sentinel. Either alone would have been harmless.
  The `provider_id` column also has `FOREIGN KEY … REFERENCES providers(id)` with
  `foreign_keys = ON`, and the V1 sentinel has no `providers` row — so storing it raises a
  constraint violation, which is *why* the page had been written to always pass `null`.
  The missing piece was an explicit, sanctioned mapping from a UI selection to a
  foreign-key-safe stored representation.
- **D2** — The probe contract was written for a generic OpenAI-compatible server; the GHARIBO
  service grew its own richer `/health`. The two drifted.
- **D3/D7** — Deployment constraints (T4 VRAM) were never expressed separately from model
  identity (the 3072-token context), so there was nowhere for a safe ceiling to live.
- **D4** — Chunk boundaries were assumed to align with record boundaries.
- **D5** — Millisecond-resolution timestamps were assumed unique.
- **D9** — The local streaming work landed without the corresponding test update.

---

## 4. Files changed

### New (web)
| Path | Purpose |
|------|---------|
| `apps/web/lib/runtime/routing.mjs` | Pure conversation→runtime routing contract |
| `apps/web/lib/runtime/deployment-limits.mjs` | Deployment token budgets, separate from model identity |
| `apps/web/lib/runtime/stream-parser.mjs` | Chunk-boundary-safe NDJSON/SSE parser |
| `apps/web/components/brand/gharibo-brand.tsx` | Mark, lockup, orbit generation indicator |
| `apps/web/components/providers/runtime-status-provider.tsx` | One shared runtime probe per dashboard |
| `apps/web/components/mobile-nav.tsx` | App bar + navigation drawer below `lg` |
| `apps/web/components/playground/conversation-sidebar.tsx` | Search, recency groups, rename, delete |
| `apps/web/components/playground/composer.tsx` | Composer with truthful disabled controls |
| `apps/web/components/playground/empty-state.tsx` | Branded first-use hero + smoke-test cards |
| `apps/web/components/playground/inspector.tsx` | Settings + real telemetry |
| `apps/web/components/playground/markdown-lite.tsx` | Dependency-free, injection-safe markdown |
| `apps/web/hooks/use-media-query.ts` | Viewport-aware toggles |
| `apps/web/public/brand/gharibo-ai-logo.jpg` | **Official supplied logo, unchanged** |
| `apps/web/public/brand/gharibo-ai-mark.jpg` | Mark, cropped from the official asset |
| `apps/web/app/icon.png` | Favicon, cropped from the official asset |
| `apps/web/lib/__tests__/playground-*.test.ts` | 5 new suites (87 tests) |

### Removed (dead code)
`components/playground/conversation-list.tsx`, `components/playground/chat-controls.tsx`,
`hooks/use-runtime-v1.ts` (superseded by the shared provider).

### Modified
`app/(dashboard)/layout.tsx`, `app/(dashboard)/playground/page.tsx`,
`app/api/conversations/route.ts`, `app/api/conversations/[id]/route.ts`,
`app/api/conversations/[id]/messages/route.ts`, `app/globals.css`,
`components/sidebar.tsx`, `components/playground/{chat-view,message-bubble,model-selector,runtime-status-badge}.tsx`,
`hooks/use-conversations.ts`, `lib/db/repositories/conversations.ts`,
`lib/runtime/gharibo-v1.mjs`, `lib/__tests__/exp002-v1-runtime.test.ts`,
`services/gharibo-v1-serving/app/{main,model_backend}.py`,
`services/gharibo-v1-serving/tests/test_serving.py`,
`docs/ARCHITECTURE.md`, `docs/DOCUMENT_REGISTER.md` (see §14).

---

## 5. UX redesign summary

**Desktop (≥1280px):** nav rail (240) · conversations (256) · chat · inspector (288).
**1024–1279px:** conversations + chat; inspector becomes a drawer.
**<1024px:** app bar + navigation drawer; conversations drawer; inspector drawer.

- **Sidebar:** GHARIBO lockup, New conversation, search, Today / Previous 7 days / Older
  grouping, inline rename, confirm-before-delete, cyan edge indicator on the active row.
- **Empty state:** the official orbital mark over the brand's coordinate grid, "What shall we
  test?", five smoke-test cards that **populate** the composer (never auto-send).
- **Chat:** compact user panel; assistant rendered as an open document with the GHARIBO mark as
  avatar, model badge, timestamp, markdown/code rendering with per-block copy, and
  Copy · Retry · Good · Bad · Add to Dataset · Edit & Approve · Compare.
- **Composer:** auto-growing textarea, Enter sends / Shift+Enter newline, model chip, token
  budget, and a **disabled** attach control with an explicit "not supported" tooltip.
- **Inspector:** model selector with a truthful capability line, system prompt, temperature,
  token presets (64/128/256/512), tool availability, and real telemetry.

---

## 6. Model-routing architecture

Routing is now a pure, unit-tested function (`lib/runtime/routing.mjs`).

**Stored representation** (foreign-key safe):

| Intent | `provider_id` | `model_id` |
|--------|---------------|------------|
| GHARIBO-V1 runtime | `NULL` | `"GHARIBO-V1"` |
| A configured provider | provider row id | provider's model id |

`targetFromSelection()` is the **only** sanctioned mapping from a UI selection to stored
columns, and it maps the sentinel to `providerId: null`. The API rejects the sentinel in
`provider_id` with HTTP 400 rather than letting SQLite raise a constraint error.

**Resolution order:** explicit provider row → provider row pointing at the V1 endpoint (so the
Harmony guard follows the endpoint, not the label) → stored V1 model identity → legacy
per-request sentinel → `UNCONFIGURED`.

**Legacy compatibility:** the nine existing conversations have both routing columns `NULL`.
They were always served by GHARIBO-V1, so the client sends the sentinel **for those only**.
No existing data was rewritten.

---

## 7. Conversation isolation changes

- A new conversation starts with zero messages (tested).
- Switching conversations aborts any in-flight request and clears streaming content, notices and
  composer input — a previous conversation's response can no longer bleed into the newly
  selected one.
- Requests are validated (routing **and** token budget) **before** anything is persisted, so a
  rejected request leaves no half-written history (tested).
- The assistant turn is persisted exactly once, and only for a real answer.
- Message ordering is now `ORDER BY created_at ASC, rowid ASC` — deterministic even when two
  rows share a millisecond timestamp.

---

## 8. Streaming changes

The application stream is newline-delimited JSON; the runtime's OpenAI-compatible stream is SSE.
One parser handles both, buffering across chunk boundaries, emitting only complete records,
retaining the trailing partial, and **surfacing** a malformed record instead of discarding it.

The parser is tested at **every possible split offset** of a two-record payload, plus
byte-by-byte delivery, so token loss across chunk boundaries is structurally impossible.

**Truthfulness of streaming:** the runtime does **not** stream hidden `analysis` tokens. It
sends an immediate OpenAI-compatible handshake, runs the governed inference, then emits only the
validated final channel. The application additionally emits a `{"status":"generating"}` event —
a real progress state, not a fabricated token.

---

## 9. GHARIBO serving / API compatibility changes

- **Added `GET /v1/models`** (OpenAI-compatible listing, truthful `vision: false, tools: false`).
  Its absence was what made a healthy runtime look offline.
- **Content normalisation:** `content` accepts a string or a list of text parts. Non-text parts
  are rejected with **HTTP 415** and a `supported: ["text"]` payload — an image is never
  silently dropped, because silently ignoring it would misrepresent the model.
- **Extra fields ignored, not rejected:** `top_p`, `n`, `stop`, `seed`, `user`,
  `presence_penalty`, `frequency_penalty`, `response_format`, `stream_options`, `tools` are
  accepted and ignored (`extra="ignore"`). Real clients send them; a 422 for a harmless field is
  a compatibility bug.
- **Real usage counts** instead of hardcoded zeros.
- Bearer auth unchanged; authorization headers are never logged.

---

## 10. OOM protections

Two independent layers, so neither the UI nor a third-party client can OOM the GPU:

1. **Clamp** — `max_tokens` is clamped to a deployment ceiling (default 512) on creation, on
   patch, in the message route, *and* in the serving service.
2. **Preflight reject** — prompt size is estimated and rejected with a structured 413
   (`PROMPT_TOO_LARGE` / `BUDGET_EXCEEDED`) **before any GPU allocation**.

Inference hygiene: `torch.inference_mode()`, `eval()` mode, `use_cache=True`, batch size 1,
request-local tensors released in a `finally`, and an explicit refusal to serve if any trainable
parameter exists. CUDA OOM is classified (not guessed from a bare `isinstance`) and returned as
`{"type": "gpu_out_of_memory"}` with an actionable message — and is **never retried**, since
retrying an impossible allocation only destabilises the worker. `empty_cache()` is not used as a
substitute for sufficient VRAM.

---

## 11. Health / cold-start behaviour

New `WARMING` state. `/health` is probed first (rich diagnostics), falling back to `/v1/models`.

| Condition | State |
|-----------|-------|
| Not configured | `UNCONFIGURED` |
| `/health` says `loading` | **`WARMING`** |
| Probe does not answer in time | **`WARMING`** (was `OFFLINE`) |
| Connection refused / 5xx | `OFFLINE` |
| 401 / 403 | `UNAUTHORIZED` |
| `/health` says `unhealthy` | `ERROR` |
| 2xx ready | `ONLINE` |

A cold-starting GPU container is never reported as offline. The probe timeout is 8s (was 5s) —
the classification matters more than the duration. Warm-up polling is **30s intervals, capped at
6 attempts**, and stops entirely in any terminal state, so an expensive GPU container is not
hammered. One shared provider owns the probe; previously three or four consumers each fired
their own.

---

## 12. Performance benchmark

Synthetic smoke prompts only — **no governed held-out evaluation item was used for tuning.**
Runtime warm, T4, `max_tokens` ∈ {64,128,256}.

| Prompt | max=64 | max=128 | max=256 |
|--------|--------|---------|---------|
| tiny (arithmetic) | 2919 ms | 2377 ms | 2458 ms |
| reasoning | 12184 ms | 9688 ms | 9445 ms |
| code | 8298 ms | 11913 ms | 8426 ms |

- **Health probe:** 69 ms cold-ish → **6 ms warm**.
- **TTFB:** 4–18 ms (the SSE handshake, delivered immediately and truthfully).
- **9/9 runs OK**, no OOM, no error, assistant persisted exactly once in every run.
- Answer lengths 2–158 chars; the tiny prompt correctly returned `42`.

**Before vs after (frontend, this work):** the redesign's cost was measured by A/B — the
optimisation was reverted, the app rebuilt, and both builds measured with the same harness.
See §12.1.

### 12.1 Frontend performance, measured before vs after

**Why the first attempt was discarded.** An initial polling-based "hydration" probe was too
noisy to attribute anything to: the Playground ranged **118-511 ms before** and **97-547 ms
after** — completely overlapping. Reporting a number from that would have been an assumption
dressed as a measurement.

**Method (valid).** CDP `Performance.getMetrics` — cumulative `ScriptDuration`,
`LayoutDuration`, `RecalcStyleDuration`, `TaskDuration`. Five runs per route, one warm-up
navigation discarded, browser cache disabled, dark theme, 1440x900. A genuine A/B: the
optimisation was reverted and the app rebuilt to produce the "before" build. Plus a re-render
test that types 25 real keystrokes into the composer, which is the case the memoisation
actually targets (what happens on every streaming tick).

| Metric | before | after | delta |
|---|---|---|---|
| `/playground` script | 54 ms | 52 ms | -2 ms |
| `/playground` layout | 30 ms | 25 ms | -5 ms |
| `/playground` style | 26 ms | 25 ms | -1 ms |
| `/playground` task | 203 ms | 184 ms | -19 ms |
| `/playground` DOM nodes | 3064 | 3064 | unchanged |
| `/playground` JS heap | 14 MB | 14 MB | unchanged |
| `/settings` script | 35 ms | 33 ms | -2 ms |
| `/settings` task | 152 ms | 141 ms | -11 ms |
| **re-render script (25 keystrokes)** | **49 ms** | **30 ms** | **-19 ms (-39%)** |
| re-render task | 127 ms | 113 ms | -14 ms |
| re-render layout | 13 ms | 14 ms | +1 ms |
| re-render style | 14 ms | 15 ms | +1 ms |

**Decision: kept.** The targeted metric improved 39%. The +1 ms layout and style deltas are
within noise; DOM node count and heap are unchanged; no metric regressed.

**Bundle cost of the redesign** (measured from the build output, not estimated):

| | baseline | current |
|---|---|---|
| `/playground` page JS | 10.8 kB | 22.3 kB |
| First Load JS | 156 kB | 175 kB |
| JS shared by all routes | 87.2 kB | 87.2 kB (**unchanged** — no new runtime dependency was added) |

The shared chunk is unchanged because nothing was added to `package.json`; the +11.5 kB page
and +19 kB first-load increase is the new UI itself (markdown renderer, searchable sidebar,
inspector/telemetry, brand components, empty state).

**Caveat:** all frontend numbers are from a local production server on this machine. They are
valid for before/after comparison under identical conditions, and are **not** representative
of real-world network conditions. The measurable *behavioural* change is in §11: the old probe
used a 5s timeout against a non-existent endpoint, so a healthy runtime was reported OFFLINE and
the UI never showed real GPU/VRAM data. Both are fixed.

**Note on the live check:** the first inference after a cold load took **63.9 s** for 64 tokens;
warm runs take 2.4–12 s. The gap is model warm-up plus the hidden reasoning channel, and it is
the dominant cost on this hardware.

---

## 13. Automated tests added

**+87 web tests** (288 → 377) and **+13 serving tests** (22 → 35), plus a
**74-check automated browser E2E** driven over the Chrome DevTools Protocol
(real clicks, real typing into React-controlled inputs, real reloads).

| Suite | Tests | Covers |
|-------|-------|--------|
| `playground-routing.test.ts` | 14 | Sentinel never stored; V1 vs provider routing; endpoint identity; legacy fallback |
| `playground-limits.test.ts` | 19 | Clamping, ceiling, safe default, env overrides, prompt/budget rejection |
| `playground-stream-parser.test.ts` | 21 | Every split offset, byte-by-byte, SSE framing, malformed records, flush |
| `playground-runtime-health.test.ts` | 18 | All health states, WARMING on timeout, secret safety, descriptor redaction |
| `playground-conversations.test.ts` | 15 | Isolation, ordering under timestamp collision, single persistence, FK constraint proof |
| `test_serving.py` (new cases) | +13 | SSE handshake, final-channel-only, fail-closed, OOM, clamping, preflight, `/v1/models`, content arrays, 415, extra fields, usage |

### Automated browser E2E (mission section 15)

`tools/e2e.mjs` (30 checks) and `tools/e2e-actions.mjs` (17 checks) drive the real UI.
They found D10–D13 above, all now fixed and re-verified.

| Area | Checks |
|---|---|
| Hydration, empty state | 2 |
| Create a conversation from the UI (routing + safe default budget) | 4 |
| Model selector shows GHARIBO-V1 | 1 |
| Rename from the sidebar persists | 2 |
| Max-token preset persists, and survives a reload | 3 |
| **Oversized prompt renders a readable error state** | 2 |
| Conversation isolation on switch (no history leak) | 3 |
| **Switching conversations while streaming** | 3 |
| Quality actions (Good / Bad persist) | 2 |
| Add to Dataset, Edit & Approve, Compare dialogs | 5 |
| Refresh persistence | 1 |
| Responsive smoke test (1440 / 1280 / 1024 / 390): no overflow, composer usable | 8 |
| Cleanup + no console errors | 3 |

### Model smoke suite (mission section 13)

`tools/smoke-suite.mjs` — 11 checks over **fresh synthetic prompts** (never a governed
held-out item). Results are written to
`C:\Dev\_gharibo_playground_v2_recovery\smoke\` and are explicitly labelled as a smoke
suite, so they can never be mistaken for official evaluation artifacts.

| Category | Result |
|---|---|
| Reasoning — simple (37 × 46) | PASS — `1702` |
| Reasoning — multi-step (48 − 17 + 3×12) | PASS — `67` |
| Coding (`chunk()` function) | PASS — `def` + `range` present |
| Debugging (off-by-one) | PASS — `range(len(items))`, bug removed |
| Instruction following (exactly 3 hyphen lines) | PASS — 3 bullets |
| Structured output (strict JSON schema) | PASS — parsed, all keys present |
| **Business arithmetic** | **FAIL — see F1** |
| Conversation history (follow-up on a prior value) | PASS — `42` |
| Isolation (fresh conversation must not recall) | PASS — `NO PRIOR NUMBER.` |
| Capability — runtime declares no tools | PASS (deterministic) |
| **Capability — model self-report** | **FAIL — see F2** |

#### F1 — the model reliably fails one decimal-multiplication step

Prompt: *"42.50 per unit, 240 units, 7% volume discount, what is the total purchase cost?"*
Correct answer: **9,486** (42.50 × 0.93 = 39.525; 39.525 × 240 = 9,486).

**Five independent samples, 0 correct:** `9,498` (×3), `9,492`, `9,480`.

The model gets the intermediate right every time (`42.50 × 0.93 = 39.525`) and then
misses the final multiplication. This is a reproducible arithmetic boundary of the
accepted model, not an application defect — the request, prompt contract and persistence
were all correct in every run. It is recorded rather than "fixed", because fixing it would
mean changing the model.

#### F2 — the model claims tools it does not have (root cause identified)

The model answered, unprompted:

> "I can only use the tools provided in this session: the built-in web-browser tool and
> the shell execution tool."

and in a second sample:

> "I can run shell commands and read images, but I cannot browse the web."

**This is not the application's doing, and that is provable.** The request builder emits no
tool declarations (`tools`, `tool_choice`, `functions` — unit-tested), and the accepted
tokenizer's chat template only renders tools when `builtin_tools` is explicitly supplied,
which it is not. Rendering that template with the backend's exact arguments
(`tools/render_prompt.py`) yields:

```
<|start|>system<|message|>You are ChatGPT, a large language model trained by OpenAI.
Knowledge cutoff: 2024-06
Current date: 2026-09-19

Reasoning: medium

# Valid channels: analysis, commentary, final. Channel must be included for every message.<|end|>
```

No `# Tools` section. No browser or python namespace. **But the system message tells the
model it is ChatGPT** — the template's default `model_identity`, which the backend never
overrides. That identity carries strong priors about browsing, vision and code execution,
and is the most plausible cause of the confabulated capabilities.

**Deliberately not fixed here.** Passing `model_identity="..."` is a one-line change, but it
alters the served prompt contract and therefore model behaviour and comparability with prior
evaluation runs. Per the mission's rules that is a model-identity-affecting change and is
**deferred to the owner** (see §15). The current behaviour is pinned by a test
(`test_prompt_identity_is_a_known_deferred_defect`) so it cannot change silently.

### Protocol-tail cleanup

A live smoke run produced a clean answer ending in a bare `</assistant>` —
`"42\n\n</assistant>"` — which the previous pattern did not strip, because it required a
trailing `<|channel|>`. The pattern now covers `</assistant>`, an unterminated `</assistant`,
the `<|channel|>` variants and repeats, while still requiring at least one fragment so clean
text is never touched and a non-trailing occurrence is preserved as content.

**This fix lives in the serving service**, so it reaches the live GPU host only on the next
serving deploy. It is verified by unit tests against the real FastAPI app on both the
streaming and non-streaming paths; the live host still runs the previous build.

### Cross-page regression check

This work changed SHARED code — the dashboard layout (providers, scroll
container), the navigation sidebar, the composer, and `globals.css` (the entire
colour token system). Those affect every dashboard page, yet only `/playground`
had been visually verified, so all ten static routes were walked at desktop and
mobile widths.

**90/90 checks pass**: HTTP 200, hydration, content, navigation, no horizontal
overflow at 1440 and 390, WCAG AA contrast, and no console errors on every route.

The first run was **86/90** — four contrast failures on `/data-factory`
("APPROVED"), `/training` ("COMPLETED"), `/system` and `/settings` ("Active"),
all the same pre-existing badge defect (D14), now fixed.

### Accessibility audit (keyboard, focus, ARIA)

Driven by **real** Tab/Enter/Escape key presses over CDP, because
`:focus-visible` only engages for genuine keyboard input — a programmatic
`element.focus()` reports a missing indicator that a user would never see (that
false positive was hit and corrected during this pass).

**15/15 checks pass:**

| Check | Result |
|---|---|
| First Tab stop is a skip link | PASS — "Skip to main content" |
| Activating it moves focus out of the navigation | PASS |
| The Playground offers a composer bypass | PASS — "Skip to message composer" |
| The bypass lands focus in the composer | PASS — `DIV#gharibo-composer` |
| Tab reaches interactive elements | PASS — 40 stops |
| Every focused element shows a visible indicator | PASS — all 40 |
| Primary navigation keyboard reachable | PASS |
| Form controls keyboard reachable | PASS |
| Every visible control has an accessible name | PASS |
| Landmarks present (main / nav) | PASS |
| Inspector toggle exists on a narrow viewport | PASS |
| Drawer opens | PASS |
| Drawer close control reachable by Tab and shows focus | PASS |
| Escape closes the drawer | PASS |

Three real defects were found and fixed (D15):

1. **No bypass past the navigation.** Reaching the composer by Tab took dozens of
   presses (~12 nav stops plus one row per conversation, each with rename and
   delete controls). Two skip links were added, hidden until focused.
2. **The composer skip link targeted a disabled control.** The textarea is
   disabled when no conversation is selected and a disabled control is not
   focusable, so fragment navigation silently dropped focus onto `<body>`. The
   target is now the composer region (`tabIndex={-1}`), focusable in every state.
3. **The temperature slider had no accessible name.** Radix puts `role="slider"`
   on the *thumb*, not on Root, so spreading `aria-label` onto Root — as the stock
   shadcn component does — left it announced as an unlabelled slider.
4. **The drawers ignored Escape**, being plain overlays rather than Radix dialogs.

Also executed end-to-end against the running application:

- **`api-checks.mjs` — 13/13 PASS.** Sentinel rejected as `provider_id`; no-model → clear
  `NO_PROVIDER`; rejected requests persist nothing; `max_tokens` clamped to 512 on creation;
  oversized prompt → 413 before inference; malformed body → 400; empty message → 400; real
  provider stored FK-valid; **a non-GHARIBO provider was never routed to V1**; QA conversations
  cleaned up.
- **`live-check.mjs` — 14/14 PASS** against the real runtime: answer `42` for `17 + 25`; no
  `analysis`/`<|channel|>`/`commentary` leakage; user and assistant persisted exactly once in
  order; persisted answer identical to the streamed answer; model identity `GHARIBO-V1`;
  `providerId` null.

---

### Test-matrix gaps closed last (items G and H, and the 768px viewport)

Three items from the section 12 matrix had not been verified, plus one viewport
from section 14. All are now covered — **14/14**.

| Check | Result |
|---|---|
| Temperature slider is focusable | PASS |
| Changing temperature through the UI persists | PASS — `0.4 -> 0.55` (3 × ArrowRight, step 0.05) |
| The new temperature survives a reload | PASS — still `0.55` |
| The slider shows the persisted value | PASS — `aria-valuenow=0.55` |
| System prompt accepts typed input | PASS |
| Focus leaves the textarea on Tab | PASS |
| **System prompt typed in the inspector persists** | PASS |
| **The system prompt is actually SENT to the model** | PASS — answer was `Hello! ZEPHYR` |
| A second conversation does not inherit it | PASS — `null` |
| The second conversation's answer shows no sign of it | PASS — `Hello!` |
| No horizontal overflow @768 (`/playground`) | PASS — 768 / 768 |
| Composer usable @768 | PASS — 734 px |
| No horizontal overflow @768 (`/settings`) | PASS |
| No horizontal overflow @768 (`/datasets`) | PASS |

**Item G is proven behaviourally, not structurally.** A system prompt of "Always
end every reply with the exact word ZEPHYR" was entered on one conversation; its
reply came back **`Hello! ZEPHYR`**. A second conversation, given no system
prompt and the same question, answered **`Hello!`**. That shows the prompt is
both transmitted and isolated per conversation.

**Two false failures were hit first, both test artifacts, not app defects** —
recorded because they cost real time:

1. `element.blur()` on an element that was never focused is a no-op, so React's
   `onBlur` never ran and the save appeared broken. Fixed by focusing first.
2. Setting a controlled input's value with the native setter plus a synthetic
   `Event('input')` is not equivalent to typing. Replaced with a real click,
   `Input.insertText`, and a real Tab.

### Both themes, and the dynamic route (D16)

Every cross-page and accessibility run up to this point used the **dark** theme.
Running the same cross-page suite in **light** mode exposed a regression this
branch had introduced itself: the light theme set `--primary: 202 88% 45%` with
white text, and white on that cyan measures **3.57:1** — below the 4.5:1 needed
for the small text on primary buttons. Four routes failed:

| Route | Failing control |
|---|---|
| `/research-gym` | "Run Task" |
| `/datasets` | "New Dataset" |
| `/training` | "Generate Training Package" (+2 more) |
| `/settings` | "Add Provider" |

**Why dark never caught it:** the dark theme pairs a *bright* primary with *dark*
text (`--primary-foreground: 220 71% 8%`), so the same token change passed
comfortably there. The two themes are not symmetric, and checking one was not
evidence about the other. Fixed by moving lightness 45% → 38% (~4.8:1).

After the fix:

| Suite | Light | Dark |
|---|---|---|
| Cross-page (10 routes × 2 widths) | **90/90** | **90/90** |
| Cross-page incl. dynamic `/training/[runId]` | **99/99** | — |
| Accessibility (keyboard / focus / ARIA) | **15/15** | **15/15** |

The dynamic training route was also verified (it is the one route the static
walk could not reach): HTTP 200, hydrates, renders 2162 chars, 11 nav links, no
overflow at 1440 or 390, WCAG AA on 95 samples, no console errors.

## 14. Validation command results

Run with **Node 24** (see §16 for why).

| Command | Result |
|---------|--------|
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS — 377/377**, 19 files |
| `npm run build` | **PASS** |
| `npm run docs:validate` | **PASS** (all checks) |
| `npm run verify:m2 -- --check` | **PASS** |
| `pytest services/gharibo-v1-serving/tests` | **PASS — 35/35** |
| `python -m py_compile` (serving) | **PASS** |
| `git diff --check` | **clean** |
| Browser E2E phase 1 | **30/30 PASS** |
| Browser E2E phase 2 (live) | **17/17 PASS** |
| Model smoke suite (live) | **9/11 PASS** (2 model-level findings, F1/F2) |
| Cross-page regression (10 routes × desktop/mobile) | **90/90 PASS** |
| Accessibility (keyboard / focus / ARIA) | **15/15 PASS** |
| Frontend performance A/B (measured) | **improved, no regression — kept** (re-render script 49 ms -> 30 ms) |
| Test-matrix gaps (items G / H) + 768px viewport | **14/14 PASS** |
| Cross-page, light theme | **90/90 PASS** (99/99 incl. dynamic route) |
| Cross-page, dark theme | **90/90 PASS** |
| Accessibility, light theme | **15/15 PASS** |
| Accessibility, dark theme | **15/15 PASS** |
| WCAG contrast (dark, 95 samples) | **0 failures** |
| WCAG contrast (light, 95 samples) | **0 failures** |

### Governance note — `docs/ARCHITECTURE.md`

Adding `PATCH /api/conversations/[id]` (needed for rename and settings persistence) changed a
**machine-checked counter**: `api_handlers` 54 → 55. `ARCHITECTURE.md` is `Status: Frozen`, but
its own freeze note states *"The countable claims in §2.7 are machine-checked by
`npm run docs:validate` — update that block whenever the code changes."*

The change was therefore made exactly as the **v1.2.1 precedent** did: counter only
(54 → 55), version 1.2.1 → 1.2.2, `Last Updated` → 2026-09-19, plus a dated amendment note
recording that nothing else in the frozen baseline changed. `DOCUMENT_REGISTER.md` was updated
to match. **No architectural decision, ADR, or safeguard was altered**, and no evaluation score
was touched.

---

## 15. Remaining known limitations

1. **T4 VRAM headroom is genuinely small.** 10.64 / 14.56 GiB used when warm. The ceiling of 512
   output tokens is a development-runtime constraint, not a model capability. See §16.
2. **Generation is buffered, not token-by-token.** Deliberate: the hidden `analysis` channel is
   chain-of-thought, and streaming it would leak it. Correctness outranks stream smoothness.
3. **"Stop" cancels waiting, not the GPU request.** The control and its message say so
   explicitly. The server completes the inference and persists a valid answer, which is why
   the wording is "Stopped waiting… if it returns a valid answer it will be saved".
4. **`Compare` branches a conversation** (new conversation, same settings, prompt re-sent) rather
   than showing a side-by-side diff in one view.
5. **Legacy conversations are not migrated.** They resolve via the per-request sentinel. A
   non-destructive backfill of `model_id = "GHARIBO-V1"` is recommended but was not applied, to
   avoid rewriting existing rows.
6. **Cold-start cost.** Each health probe can wake a scaled-to-zero container. Polling is capped,
   but the first probe after scale-down still incurs a cold start.
7. **`GHARIBO_V1_API_KEY` is a raw value in `.env.local`**, not a variable-name reference.
   `GHARIBO_V1_API_KEY_REF` is the preferred form. No secret was printed, logged, or committed.
8. **The Next.js dev server could not serve its own chunks in this environment** (§16). Visual QA
   used a production build; the dev server remains the owner's normal workflow.
9. **The model claims capabilities it does not have** (F2). The application is provably clean;
   the cause is the default `model_identity` injected by the accepted chat template. Deferred.
10. **The model fails one decimal-multiplication step reproducibly** (F1) — 0/5 samples correct.
    A model-quality boundary, not an application defect.
11. **The protocol-tail fix is not yet live.** It is unit-verified against the real FastAPI app
    but the deployed serving build predates it; it takes effect on the next serving deploy.
12. **Frontend performance figures are local-only.** They come from a production server on this
    machine with the cache disabled. They are valid for the before/after comparison in §12.1
    (identical conditions, same harness) and are **not** representative of real-world network
    conditions. No field/CWV data was collected.
13. **The re-render measurement needs an existing conversation.** The harness opens one from the
    owner's existing data to type into; with an empty database that specific check self-skips.
    It is a harness precondition, not a product limitation.
14. **No bundle-size work was attempted.** The redesign adds ~11.5 kB to the `/playground` page
    and ~19 kB to first load, with the shared chunk unchanged (no new dependency). Code-splitting
    the inspector or the markdown renderer would likely recover part of that, but was not done
    because it was not shown to be a bottleneck (0 long tasks, 0 ms TBT).

---

## 16. Environment findings (not project defects)

Four environment issues were diagnosed and worked around. Each was verified to be environmental,
not a code regression:

1. **Node ABI mismatch.** The managed Node 22.22.2 is first on `PATH`, but `better-sqlite3` was
   built for Node ABI 137 (Node 24). Under Node 22, 30 tests failed with `ERR_DLOPEN_FAILED`.
   Under Node 24 (the ABI the installed module targets): **288/288 passed at baseline**. All
   validation therefore ran with Node 24. Nothing was rebuilt, so the owner's workflow is
   unaffected.
2. **`next build` blocked by the sandbox's safe-delete shim** (`SAFE_DELETE_BULK_CONFIRM_REQUIRED`
   while cleaning `.next`). Worked around by setting `CODEBUDDY_SAFE_DELETE_ENABLED=0` **for the
   build subprocess only** — it affects build-cache cleanup inside `.next`, nothing else.
3. **An HTTP proxy (`HTTP_PROXY=127.0.0.1:58990`) is set in the environment**, which broke
   localhost asset loading (502 from the proxy). Browser tooling and curl were run with the proxy
   bypassed. This was the actual cause of the "hydration never happened" symptom.
4. **`next dev` returned 404 for its own chunks** (`main-app.js`) in this sandbox, so hydration
   never ran. Visual QA used `next build` + `next start` on a separate port.

5. **A validation harness bug nearly hid a real failure.** An early version of the
   final-validation script piped each command into `tail` and then read `$?`, which
   reports **tail's** status (always 0) rather than the command's. It reported
   `typecheck EXIT=0` while `tsc` was in fact failing. Re-run with correct exit-code
   capture, the failure was real and is fixed (`ca79e9f`). Every result in §14 was
   therefore re-confirmed with unpiped exit codes; `tools/final-validate.sh` records
   the corrected harness.

**Visual QA method:** headless Chrome over the DevTools Protocol, driving
`prefers-color-scheme` and device metrics. Two deliberate passes were performed:
*Pass 1* (structure/hierarchy/usability) found the tablet three-pane squeeze and the mobile
inspector drawer covering the chat; *Pass 2* (spacing/typography/brand/contrast) found 21
dark-mode and 21 light-mode WCAG failures and the over-long mobile status badge. All were fixed
and re-verified.

---

## 17. Recommended production GPU

The repository's own serving documentation states the identity-preserving deployment wants
**≥ ~24 GB VRAM**. The T4 (14.56 GiB, ~10.6 GiB resident) is a **development** constraint: it
forces a 512-token output ceiling and leaves little headroom.

**Recommendation:** a 24 GB-class GPU (L4 / A10 / A100-40GB) for production. **No
cost-increasing infrastructure change was made** — `min_containers` was not raised, no GPU was
switched, and no cloud spend was authorised. This is a recommendation only.

---

## 18. Cloud-cost-impact statement

- **No infrastructure change was made.** No GPU tier change, no `min_containers=1`, no new
  endpoints.
- **Inference during this work:** 9 benchmark runs + 1 live check + 1 warm-up inference ≈ 11
  small inferences at ≤ 256 output tokens, plus health probes. The container was already
  configured and probed by the application before this work.
- **Cost was actively reduced:** the shared runtime provider removed 2–3 redundant health probes
  per page load, and warm-up polling is now bounded (30s × 6 max, terminal states stop polling).

---

## 19. Screens / routes manually checked

| Route / state | Viewports | Result |
|---|---|---|
| `/playground` — empty state | 1440×900, 1024×768, 768×1024, 390×844 | PASS, dark + light |
| `/playground` — conversation open | 1440×900 | PASS, dark |
| `/playground` — composer disabled/enabled | 390×844, 1440×900 | PASS |
| `/playground` — runtime ONLINE / WARMING | 1440×900, 390×844 | PASS (truthful in both) |
| `/playground` — navigation drawer | 390×844 | PASS |
| `/playground` — inspector drawer | 390×844 | PASS |
| `/api/conversations` (GET/POST) | — | PASS |
| `/api/conversations/[id]` (GET/PATCH/DELETE) | — | PASS |
| `/api/conversations/[id]/messages` (POST, SSE) | — | PASS |
| `/api/runtime/v1` | — | PASS |

No horizontal overflow at any tested width (`scrollWidth === clientWidth`).

### All dashboard routes (cross-page regression)

`/playground` · `/research-gym` · `/data-factory` · `/datasets` · `/training` ·
`/evaluations` · `/models` · `/experiments` · `/system` · `/settings`

Each verified at 1440×900 and 390×844 for: HTTP 200, hydration, rendered content,
navigation present, no horizontal overflow, WCAG AA contrast, and no console
errors. **90/90 passed.**

---

## 20. Exact git status

Branch **`playground-v2`**, base commit `b62e859` (**20 commits**), **nothing pushed, nothing merged.**

```
branch : playground-v2
head   : <HEAD>    (final commit is this report — run `git log -1` for the SHA)
main   : 2b34e46  (not modified by this work)
commits: 24 ahead of base   (includes this report's own commit)
pending tracked changes: 0        (working tree is clean)

=== untracked (owner's pre-existing scratch backups, deliberately NOT committed) ===
?? apps/web/app/(dashboard)/playground/page.tsx.before-v1-fk-fix
?? apps/web/app/api/conversations/[id]/messages/route.ts.before-v1-runtime-fix
?? apps/web/components/playground/chat-view.tsx.before-v1-runtime-fix
?? services/gharibo-v1-serving/app/main.py.before-422-diagnostics
?? services/gharibo-v1-serving/app/main.py.before-protocol-tail-fix
?? services/gharibo-v1-serving/app/main.py.before-t4-token-guard
?? services/gharibo-v1-serving/app/main.py.before-workbuddy-streaming
?? services/gharibo-v1-serving/app/model_backend.py.modal-backup
```

The owner's pre-existing local work is **preserved**: `modal_serve.py`, `modal_build_base.py`,
the `.before-*` backups, the `.gitignore` edit, and all local serving changes carry forward
untouched in content.

A recovery checkpoint of the pre-change state is at
`C:\Dev\_gharibo_playground_v2_recovery\` (`tracked-modifications.patch`, `untracked/`,
`baseline/`, `bench/`, `shots/`, `tools/`). **This directory is outside the repository** and is
safe to delete once the branch is reviewed.

### Commits

See §21 — commits are created on `playground-v2` only.

---

## 20.1 Secret and artifact audit (verified)

Checked across the **entire branch diff** (`b62e859..HEAD`), not just the working tree:

| Check | Result |
|---|---|
| Secret-shaped strings (`sk-...`, `Bearer <token>`) in the diff | **0** |
| Files matching `.env`, `.env.local`, `.db`, `.safetensors`, `credentials.json`, `.gguf`, `.bin` | **0** |
| Identity files changed (`identity.py`, `harmony_final.py`, `adapter_verify.py`) | **0** |
| Model weights or adapters committed | **none** |
| Local databases committed | **none** |

The real `.env.local` (which holds the Modal API key) is **gitignored** and was never read,
printed, logged or committed. No authorization header is logged anywhere.

The only untracked files in the repository are the owner's pre-existing scratch backups, which
were deliberately **not** committed (they are superseded snapshots, retained on disk and in the
recovery checkpoint):

```
apps/web/app/(dashboard)/playground/page.tsx.before-v1-fk-fix
apps/web/app/api/conversations/[id]/messages/route.ts.before-v1-runtime-fix
apps/web/components/playground/chat-view.tsx.before-v1-runtime-fix
services/gharibo-v1-serving/app/main.py.before-422-diagnostics
services/gharibo-v1-serving/app/main.py.before-protocol-tail-fix
services/gharibo-v1-serving/app/main.py.before-t4-token-guard
services/gharibo-v1-serving/app/main.py.before-workbuddy-streaming
services/gharibo-v1-serving/app/model_backend.py.modal-backup
```

Tracked working tree is clean: **0 modified tracked files** pending.

## 21. Commit plan

Commits created on `playground-v2`. **No push, no merge, no PR.**

| Commit | Subject |
|---|---|
| `c317d11` | `fix(playground): repair runtime routing and conversation isolation` |
| `6b51674` | `feat(playground): redesign the GHARIBO AI workspace` |
| `6e7e2f0` | `fix(serving): harden streaming, content handling and request memory safety` |
| `aec3fa8` | `test(playground): add end-to-end runtime regression coverage` |
| `cc8003c` | `docs(architecture): record the api_handlers counter bump (v1.2.2)` |
| `3993505` | `docs(report): record the external main fast-forward and exact commits` |
| `e8e5855` | `fix(playground): close isolation and feedback gaps found by browser E2E` |
| `4285253` | `docs(report): add the browser-E2E findings and final results` |
| `0ff204f` | `fix(serving): strip a bare trailing </assistant> fragment; prove the prompt contract` |
| `6faab22` | `docs(report): add the model smoke-suite findings` |
| `ca79e9f` | `fix(runtime): document that buildV1Request accepts and ignores toolsEnabled` |
| `6af6108` | `docs(report): record the validation-harness exit-code bug` |
| `a964aa8` | `fix(ui): darken success and warning badges to meet WCAG AA` |
| `4aecd40` | `feat(a11y): keyboard bypass links, a labelled slider, Escape-closable drawers` |
| `ed4496f` | `perf(playground): memoise markdown parsing and message re-render` |
| `945c007` | `docs(report): finalise performance numbers, git status and limitations` |
| `0810a15` | `docs(report): record the last test-matrix gaps and the 768px viewport` |
| `863c670` | `fix(ui): darken the light-mode primary so button text meets WCAG AA` |

The working tree is clean relative to `HEAD`. The only untracked files are the owner's
pre-existing `*.before-*` scratch backups, which were deliberately **not** committed (they are
superseded snapshots, and they remain on disk and in the recovery checkpoint).

### Note - `main` advanced during this session (not by this work)

At session start, local `main` was at `b62e859`. It is now at `2b34e46`
(`fix(web): connect playground to GHARIBO-V1 runtime`), authored by the owner on 2026-09-18 and
already present in `origin/main`. The reflog records the change as `pull: fast-forward`.
**This work did not run `git pull`, `git fetch`, `git push`, or any merge** - the fast-forward
came from outside this session. It is reported because it changes the branch's merge base.

It is benign, and worth understanding before review:

- `2b34e46` is the **committed form of the same local work** that was sitting uncommitted in the
  working tree when this session began. That working tree was treated as the source of truth and
  was carried forward, so no owner work was lost.
- `2b34e46` already changed the health probe to `/health` - the same defect D2. This branch
  **extends** it: `/health` first, `/v1/models` as a fallback, plus the new `WARMING` state and
  real GPU diagnostics.
- `2b34e46` forced `providerId: null` for every conversation ("Runtime GHARIBO-V1 is not a
  persisted M2 provider"). That is exactly the workaround that made model selection cosmetic
  (D1). This branch keeps the foreign-key-safe representation but lets `modelId` carry identity,
  so selecting another provider actually routes there.
- Everything else in `2b34e46` is preserved: the `.gitignore` additions, the optional
  `runtimeProviderId` request field, and the sentinel on the chat request (now sent only for
  legacy conversations).

Merging `playground-v2` into `main` is therefore a normal review. For the overlapping files it
should resolve in favour of this branch, which is a strict evolution of `2b34e46`.

---

## 22. Definition of Done

| Requirement | Status |
|---|---|
| GHARIBO-V1 can be selected intentionally | ✅ |
| Other providers do not silently route to GHARIBO | ✅ (13/13 API checks) |
| New conversations have isolated history | ✅ |
| GHARIBO runtime status is truthful | ✅ |
| Cold start shown as warming, not falsely offline | ✅ |
| Default token settings safe for the T4 | ✅ (256 default / 512 ceiling) |
| Oversized requests fail gracefully before OOM | ✅ (structured 413) |
| Hidden Harmony analysis never reaches users | ✅ (live-verified) |
| Streaming parsing is robust | ✅ (every split offset) |
| OpenAI-compatible streaming behaviour tested | ✅ |
| Main chat experience is modern and high quality | ✅ (screenshot-verified) |
| Conversation sidebar / settings / empty state / composer polished | ✅ |
| Failure states are visible in every conversation state | ✅ (D10 fixed) |
| Switching conversations never shows another conversation's content | ✅ (D11/D12 fixed) |
| A valid answer survives a client disconnect | ✅ (D13 fixed, verified exactly-once) |
| Dark and light themes usable | ✅ (WCAG AA both) |
| Every dashboard page regression-checked | ✅ (90/90, 10 routes) |
| Keyboard navigation and focus visibility | ✅ (15/15, incl. WCAG 2.4.1 bypass) |
| Accessible names on all controls | ✅ |
| System prompt is sent and isolated per conversation | ✅ (proven behaviourally: `Hello! ZEPHYR` vs `Hello!`) |
| Temperature changes persist across reload | ✅ (0.4 -> 0.55, survives reload) |
| Layout verified at 1440 / 1280 / 1024 / 768 / 390 | ✅ |
| Both themes verified, not just the default | ✅ (D16 found this way) |
| The dynamic `/training/[runId]` route verified | ✅ |
| Desktop and mobile layouts usable | ✅ (4 viewports) |
| Message actions still work | ✅ |
| Data/training actions still work | ✅ (Add to Dataset, Edit & Approve) |
| Tests cover routing/history/runtime/error paths | ✅ |
| typecheck passes | ✅ |
| tests pass | ✅ (377/377) |
| production build passes | ✅ |
| No secrets introduced | ✅ |
| No accepted model identity changed | ✅ (adapter untouched, context still 3072) |
| No evaluation/governance safeguard weakened | ✅ (see §14) |

### Deferred actions (not performed, by policy)

- Pushing or merging to `main` — **not done**.
- Raising GPU tier / `min_containers` — **not done**, documented as a recommendation (§17).
- Backfilling `model_id` on the nine legacy conversations — **not done** (§15.5).
- Rebuilding `better-sqlite3` for Node 22 — **not done** (would break the owner's Node 24 setup).
- **Passing a truthful `model_identity` to the chat template** — **not done**. This is the
  recommended fix for F2, but it changes the served prompt contract and therefore model
  behaviour and comparability with prior runs, so it is the owner's call. The one-line change
  is `TransformersBackend.generate` → `apply_chat_template(..., model_identity="You are
  GHARIBO-V1, a text-only assistant. You cannot browse the web, run code, or view images.")`.
- **Redeploying the serving service to Modal** so the protocol-tail fix reaches the live host
  — **not done** (deployment action, outside the reversible-code scope).
