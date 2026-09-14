# ADR-0004: Store provider credentials by reference, never as values

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | 1.0.0 |

## Context

The lab needs to call third-party model APIs, which requires API keys. Those keys must be
configurable from the UI (an operator adds a provider in Settings) — which implies the key
material is *associated with* a database row.

Storing raw keys in the database is unacceptable: the database is a plain file inside the
repo tree, it is easy to copy and back up, and a public repository is part of this project's
delivery model. Any accidental commit, screenshot, or DB dump would leak live credentials.
At the same time, asking an operator to edit `.env` and restart for every provider is poor UX.

## Decision

We will store **only the name of an environment variable** in the database
(`providers.api_key_ref`, e.g. `OPENAI_API_KEY`). The raw value is read from the process
environment at call time by `apps/web/lib/secrets.ts` (`resolveKeyRef`), which also rejects
any reference that is not `^[A-Z][A-Z0-9_]*$` to prevent injection through the ref field.
Keys are **never logged and never returned by any API response**.

## Consequences

### Positive
- A database leak or an accidental commit discloses no credentials — only variable *names*.
- Operators can add, rename, or re-point providers from the UI without restarting the app to
  pick up a value that already exists in the environment.
- The reference format is validated, so a malicious `api_key_ref` cannot be used to read
  arbitrary process state.
- `.env*` files are gitignored (see the hardened `.gitignore`), so values stay out of git.

### Negative / Trade-offs
- Adding a *new* secret still requires setting an environment variable and restarting the
  service; the UI can only reference what the environment already provides. The UI must
  therefore communicate *which* references are currently resolvable (`hasKey`).
- There is no in-app secret store, no rotation audit trail, and no per-user scoping.
- Operators can silently point a provider at a variable that is unset; this surfaces as an
  authentication failure at call time rather than at configuration time.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Store raw keys in the SQLite DB | A single file copy leaks every credential; unacceptable for a repo that is public |
| Store keys encrypted in the DB with an app-managed key | The decryption key must itself live somewhere, so the security gain over env vars is small and the operational cost is real |
| OS keychain integration | Platform-specific, hard to use from a server process, and adds native dependencies |
| Require `.env` edits + restart per provider | Poor operator UX and pushes config back into files, defeating the Settings section |

## References

- `docs/PRD.md` — P0-19 (security baseline)
- `docs/ARCHITECTURE.md` §1.2 (Secrets)
- `apps/web/lib/secrets.ts`, `apps/web/components/providers/provider-form.tsx`
