# ADR-0001: Next.js Route Handlers as the application backend

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | 1.0.0 |

## Context

GHARIBO AI LAB needs a backend for the control plane (providers, conversations, datasets,
training runs, registry, evaluations, research records) and a frontend that presents ten
operator sections. The control plane is CRUD- and workflow-shaped, not compute-heavy.

The actual compute — GPU inspection, model inference, training — is inherently Python and
must run as separate processes that can live on a different machine than the UI. That is
non-negotiable for the project's long-term goal (a real model family).

The options were: (a) a separate Node/TypeScript backend service alongside the Next.js
frontend, (b) a single Python backend serving both API and UI, or (c) use Next.js Route
Handlers as the control-plane backend and keep Python strictly for ML.

## Decision

We will implement the control-plane backend as **Next.js Route Handlers**
(`apps/web/app/api/**/route.ts`) in TypeScript, and use **Python (FastAPI) only for ML
workloads** (`services/trainer`, `services/inference`, `services/research`). The Next.js
app talks to the Python services over HTTP on localhost.

## Consequences

### Positive
- One deployable unit for the control plane — no separate backend service to build, run,
  or keep in version lockstep with the frontend.
- End-to-end type safety: route handlers, repositories, and UI share the same types from
  `@gharibo/shared`, so a schema change surfaces as a compile error rather than a runtime 500.
- Server Components can call repositories directly for first paint, removing a client
  round-trip on list pages.
- The boundary between "control plane" and "ML compute" is explicit and enforceable, which
  keeps the heavy Python dependency tree out of the web app.

### Negative / Trade-offs
- The control plane is bound to the Next.js runtime. Moving it to a standalone service later
  means extracting route handlers — mitigated by keeping handlers thin and putting logic in
  `lib/` (repositories + services), which are runtime-agnostic.
- Long-running work cannot live in a route handler (serverless execution limits). This is why
  training is delegated to a Python service rather than run in-process (see ADR-0005).
- Two languages and two dependency ecosystems to maintain.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Separate Node/TypeScript backend (e.g. Express/Nest) | Extra service, extra build, extra deploy, duplicated types — no benefit for a CRUD-shaped control plane |
| Single Python backend serving API + UI | Would force a Python frontend stack; loses the React/shadcn UI velocity the PRD's design requirements depend on |
| Next.js Route Handlers **plus** running ML inside Node (e.g. ONNX bindings) | Cannot express real `torch`/CUDA environment inspection or training; would invite simulated results |

## References

- `docs/PRD.md` — P0-01 (app launch), P0-02 (sidebar), P0-19 (security baseline)
- `docs/ARCHITECTURE.md` §1.2 (Architecture Pattern)
- `apps/web/app/api/**/route.ts`, `apps/web/lib/db/repositories/*`
