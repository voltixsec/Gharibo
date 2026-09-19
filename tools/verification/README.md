# Verification tooling

A small, **dependency-free** verification harness for GHARIBO AI Lab.

Every script uses only Node built-ins (`fetch`, `WebSocket`) or Python
stdlib (plus `jinja2` for one script), driving **headless Chrome over the
DevTools Protocol**. There is no Playwright/Puppeteer install and no CI
requirement — if Chrome is present, these run.

This exists because the Playground V2 work needed to verify things unit tests
cannot: real clicks, real key presses, real streaming, real contrast, real
layout at real viewport sizes.

## Prerequisites

- A running production server: `npm run build && npm start` (default
  `http://localhost:3100` in the examples, use `-p <port>` to choose).
- **Node 24** (`export PATH="/c/Program Files/nodejs:$PATH"` on this machine —
  `better-sqlite3` is built for Node 24's ABI and `ERR_DLOPEN_FAILED` under 22).
- Google Chrome installed.
- `PROXY BYPASS`: these scripts launch Chrome with `--no-proxy-server`. On a
  machine with `HTTP_PROXY` set, localhost asset loading otherwise fails.

## Suites

| Script | What it verifies | Expected |
|---|---|---|
| `final-validate.sh` | typecheck, all web tests, `docs:validate`, `verify:m2`, serving pytest, `git diff --check` | all exit 0 |
| `e2e.mjs` | Playground UI flows: create, rename, settings, error state, isolation, responsive | 30/30 |
| `e2e-actions.mjs` | Message actions (Good/Bad, Add to Dataset, Edit & Approve, Compare), mid-stream switching | 17/17 |
| `route-check.mjs` | Every dashboard route at desktop + mobile, both themes, contrast, console errors | 90/90 |
| `a11y-check.mjs` | Keyboard bypass, focus visibility, accessible names, Escape-closable drawers | 15/15 |
| `api-checks.mjs` | API contract: routing, FK safety, preflight rejection, malformed input | 13/13 |
| `live-check.mjs` | One live GHARIBO-V1 request end-to-end incl. no chain-of-thought leakage | 14/14 |
| `smoke-suite.mjs` | Model capability smoke suite (fresh synthetic prompts) | 9/11 (2 known model findings) |
| `matrix-gaps.mjs` | System-prompt isolation/send, temperature persistence, 768px viewport | 14/14 |
| `sidebar-features.mjs` | Conversation search filtering and the two-step delete flow | 11/11 |
| `provider-routing.mjs` | Selecting another provider actually routes to it (proven via the server's own status event) | 10/10 |

## Usage

```bash
# core validation (no server needed)
bash tools/verification/final-validate.sh

# browser suites — start the server FIRST, and do not rebuild while it runs
npm run build && npm start -p 3100

node tools/verification/e2e.mjs            http://localhost:3100
node tools/verification/route-check.mjs    http://localhost:3100 dark     # or light
node tools/verification/a11y-check.mjs     http://localhost:3100 dark
node tools/verification/api-checks.mjs     http://localhost:3100
node tools/verification/live-check.mjs     http://localhost:3100
node tools/verification/matrix-gaps.mjs    http://localhost:3100 dark
node tools/verification/sidebar-features.mjs http://localhost:3100 dark
node tools/verification/smoke-suite.mjs    http://localhost:3100
node tools/verification/e2e-actions.mjs    http://localhost:3100
```

Optional extras:

```bash
# append dynamic routes (e.g. a real training run id) to the route walk
EXTRA_ROUTES="/training/<runId>" node tools/verification/route-check.mjs http://localhost:3100 light

# performance A/B — label each build, compare the JSON under ../perf/
node tools/verification/perf-ab.mjs http://localhost:3100 before
# (rebuild with the other variant, restart, then)
node tools/verification/perf-ab.mjs http://localhost:3100 after
```

## Utilities

| Script | Purpose |
|---|---|
| `contrast.mjs` | WCAG AA contrast audit of the rendered page (both themes) |
| `shot.mjs` | Screenshot at a given theme/viewport |
| `eval.mjs` | Ad-hoc expression against the live page |
| `bench.mjs` | Serving latency benchmark across prompts × token budgets |
| `repeat-arithmetic.mjs` | Repeat one arithmetic case N times (variance, not one sample) |
| `render_prompt.py` | Render the accepted tokenizer chat template to see what the model is told |
| `analyze_logo.py` / `derive_brand_assets.py` | Measure / re-derive the official brand assets |

## Hard-won rules

These cost real time; please keep them.

1. **Never read `$?` after a pipe or a short-circuited `&&`.** `cmd | tail; echo $?`
   reports `tail`'s status — always 0. It masked a failing typecheck for a while.
2. **Never run `npm run build` while `next start` is serving.** The rebuild
   replaces `.next` under the running server and produces bogus
   `Cannot find module ./vendor-chunks/...` 500s in every later browser check.
3. **Dispatch real key presses.** `element.focus()` does not engage
   `:focus-visible`, so a programmatic focus reports a missing focus ring that no
   user would ever see. Likewise `blur()` on a never-focused element is a no-op,
   so React's `onBlur` never fires.
4. **Reset focus between phases** — Chrome continues sequential focus navigation
   from wherever focus is, so a skip-link test after a long sweep will press
   Enter on the wrong element and navigate away.
5. **Synthetic events are not typing.** Use `Input.insertText` (or real
   key events), not the native setter + `new Event('input')`.
6. **Verify BOTH themes.** The dark and light themes are not symmetric; a token
   change that passes in one can fail in the other (it did — light primary at
   3.57:1 while dark was fine).
7. **If a check passes with a suspiciously low number, suspect the fixture.**
   A loose assertion once passed with 2 rows when the real answer was 11.

## Governance

These are **diagnostic** tools, not gates: they are not wired into `npm test`
and CI does not run them. The live suites (`live-check`, `smoke-suite`,
`e2e-actions`, `bench`) call the real GHARIBO-V1 runtime and therefore **cost
GPU time and money** — run them deliberately, not on every commit. `smoke-suite`
and `bench` self-skip when the runtime is not `ONLINE`.

Model smoke results are **not** official evaluation artifacts. They use fresh
synthetic prompts and are written outside the repository tree by default.
