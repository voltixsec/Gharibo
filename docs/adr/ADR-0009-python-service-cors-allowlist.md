# ADR-0009: Restrict CORS on Python services to an explicit allow-list

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | 1.0.0 |

## Context

The three FastAPI services (`trainer`, `inference`, `research`) were initially configured with
`allow_origins=["*"]` together with `allow_credentials=True`. That combination is both invalid
and unsafe: browsers reject `Access-Control-Allow-Origin: *` on credentialed requests, and the
wildcard nominally exposes each service to any web origin.

A security review performed before the first public checkpoint flagged this. The review also
established an important fact: **the browser never calls these services directly**. The Next.js
route handlers call them server-side (for example `/api/preflight` proxies to the trainer
service), so no cross-origin browser request is involved in the current architecture.

## Decision

We will restrict each Python service's CORS configuration to an **explicit allow-list** of
local frontend origins, configurable through a comma-separated `CORS_ALLOWED_ORIGINS`
environment variable, and set `allow_credentials=False` since these services use no cookies or
ambient credentials:

```python
_allow_origins = [o.strip() for o in os.environ.get(
    "CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",") if o.strip()]

app.add_middleware(CORSMiddleware, allow_origins=_allow_origins,
                   allow_credentials=False, allow_methods=["*"], allow_headers=["*"])
```

A wildcard must never be combined with credentials.

## Consequences

### Positive
- Removes an invalid and over-permissive configuration before the repository became public.
- Non-listed origins receive no `Access-Control-Allow-*` header, so a browser page cannot read
  responses from these services even if it can reach the port.
- The allow-list is deployment-configurable, so a non-local deployment needs no code change.
- Behaviour is verifiable: an allowed origin gets the header, a disallowed origin does not.

### Negative / Trade-offs
- If the frontend port changes (for example the dev server moves to `:3001`), the default
  allow-list no longer matches and `CORS_ALLOWED_ORIGINS` must be set. This is real friction
  we have already hit in development.
- Because the services are called server-side today, the allow-list is currently latent — it
  provides defence in depth rather than fixing an active failure. It could therefore rot
  unnoticed until someone calls a service from a browser.
- `allow_methods` and `allow_headers` remain wildcards; the services are not reachable from
  untrusted networks in the supported configuration, but a hardened deployment should narrow
  these too.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Leave `["*"]` with `allow_credentials=True` | Invalid CORS and over-permissive; the exact finding the security review raised |
| Remove CORS middleware entirely | The services are intended to be callable from a browser during development and from other tools; removing it breaks that without adding safety |
| Bind services to loopback only and skip CORS | Binding already defaults to localhost, but a browser page loaded from any origin could still reach a loopback port; CORS is the control that stops it *reading* the response |
| Per-route CORS instead of app-wide middleware | More code, no benefit at this size |

## References

- `docs/PRD.md` — P0-19 (security baseline)
- `docs/ARCHITECTURE.md` §1.2 (Cross-service)
- `services/trainer/main.py`, `services/inference/main.py`, `services/research/main.py`, `.env.example`
