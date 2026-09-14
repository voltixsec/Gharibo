# ADR-0006: npm workspaces monorepo with a shared types package

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | 1.0.0 |

## Context

GHARIBO AI LAB contains a web application, a set of shared domain types, and three Python
services. The web app and the shared types must evolve together — a change to the `Dataset`
shape must break compilation in the UI immediately, not at runtime.

The services are Python and are not part of the JavaScript dependency graph, so the
JavaScript side is a two-package problem: the app and the types it consumes.

The options were: (a) a single flat package with types living inside the app, (b) a monorepo
with a separate shared package, or (c) a heavyweight monorepo tool (Turborepo/Nx/pnpm).

## Decision

We will use a **two-workspace npm monorepo**: `apps/web` (the Next.js application) and
`packages/shared` (the `@gharibo/shared` domain types), declared in the root `package.json`
via `"workspaces"`. Root scripts delegate into workspaces. **No additional monorepo tooling**
is introduced — npm workspaces ship with npm, which is already required.

## Consequences

### Positive
- Shared types are a real package with a real boundary, so `@gharibo/shared` cannot
  accidentally import app code; the dependency direction is enforceable.
- A single `npm install` at the root installs everything, and one lockfile pins the whole
  JavaScript tree — reproducible and auditable.
- No Turborepo/Nx configuration, no extra daemon, no learning curve. `npm run <script>` works.
- Adding a future workspace (e.g. a CLI, an evaluation runner) is one line in `workspaces`.

### Negative / Trade-offs
- Hoisting is implicit and can surprise: a dependency declared only in a workspace may end up
  in the root `node_modules`, which breaks tools that resolve relative to their own location.
  This actually bit us — see ADR-0010.
- No incremental build graph or remote caching, so a full `npm run build` is the only build
  story. Acceptable at this size; revisit if build time becomes painful.
- Workspace scripts require `--workspace` plumbing, which is easy to get subtly wrong.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Single flat package, types inside `apps/web` | Python services and any future non-web consumer could not share types; no enforced boundary |
| Turborepo / Nx / pnpm workspaces | Real benefits at scale (caching, task graph), but adds tooling, config, and a lockfile format change for a two-package repo |
| Git submodule / published npm package for types | Requires a publish step or submodule discipline for a codebase that is not yet released |

## References

- `docs/PRD.md` — P0-01 (monorepo structure)
- `docs/ARCHITECTURE.md` §1.1 (Tech Stack — Monorepo), §2.0 (root config)
- `package.json`, `packages/shared/**`
