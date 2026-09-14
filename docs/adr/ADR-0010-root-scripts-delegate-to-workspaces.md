# ADR-0010: Root scripts delegate to workspaces; Next.js pinned at the repo root

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | 1.0.0 |

## Context

Before the first public checkpoint, the verification suite was run from the repository root and
two of the four gates silently failed:

- `npm run typecheck` was `tsc --noEmit`, but **no `tsconfig.json` exists at the repo root** —
  the compiler printed its help text and exited non-zero. The script had never actually
  type-checked anything.
- `npm run lint` was `next lint`, but the `next` binary is not resolvable from the root, so the
  command failed with `'next' is not recognized`.

A third, subtler problem followed: npm hoisted `eslint-config-next` to the **root**
`node_modules` while installing `next` **nested** under `apps/web/node_modules`. Since
`eslint-config-next` resolves `next/dist/compiled/babel/eslint-parser` relative to its own
location, lint failed with `Cannot find module 'next/dist/compiled/babel/eslint-parser'` even
once the binary was found.

The cause of the nesting was a stale, empty root `node_modules/next` left by an earlier
accidental `npx next@…` invocation; with that directory present, npm could not hoist `next`.

## Decision

We will keep the root `package.json` scripts as **thin delegations** into the workspace that
owns the tooling:

```json
"build":     "npm run build --workspace apps/web",
"lint":      "npm run lint --workspace apps/web",
"typecheck": "npm run typecheck --workspace apps/web"
```

and we will declare **`next` in the root `devDependencies`** so that npm installs it at
`node_modules/next`, where the hoisted `eslint-config-next` can resolve it. A stale
`apps/web/node_modules/.bin/next` shim must not be allowed to shadow the hoisted binary.

## Consequences

### Positive
- `npm run typecheck`, `npm run lint`, `npm run build` and `npm test` all pass **from the
  repository root**, which is how a newcomer will invoke them.
- Tooling is owned by the workspace that has the corresponding config (`tsconfig.json`,
  `.eslintrc.json`), which is where those files belong.
- Declaring `next` at the root makes the hoisting explicit rather than accidental, so
  `eslint-config-next` resolves deterministically.

### Negative / Trade-offs
- `next` is now declared in two `package.json` files with the same range. That is redundant on
  paper, and a future `next` upgrade must keep both ranges compatible or npm will nest again.
- Root scripts are one indirection deeper, so a failure message is one level less direct.
- The fix treats a symptom of npm's hoisting algorithm; a full clean reinstall would also have
  produced a hoisted tree, but that was blocked in this environment.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Point root scripts directly at the workspace config (`tsc -p apps/web/tsconfig.json`) | Works for typecheck but does not fix lint, and duplicates path knowledge in the root |
| Add a root `tsconfig.json` | Would type-check the wrong project (no app sources at root) and mislead tooling |
| Nested `eslint-config-next` under `apps/web` only | npm hoists it; forcing nesting requires artificial version conflicts |
| Full `node_modules` reinstall to fix hoisting | Blocked by the environment's bulk-delete guard; and it would not stop the problem recurring |

## References

- `README.md` (Troubleshooting), `docs/ARCHITECTURE.md` §2.0 (root config)
- `package.json`, `apps/web/package.json`
