# ADR-0002: SQLite + better-sqlite3 behind a Repository Pattern

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | 1.0.0 |

## Context

The lab must persist its own operational state — providers, conversations, messages,
training examples, data-factory records, datasets, training runs, registry entries,
research records, experiments, evaluation results, settings — across restarts, on a
developer machine, with no operations overhead.

The PRD requires persistence in P0 and names a future migration path to PostgreSQL in P2.
The question was which storage engine and which data-access layer to freeze now, given that
whatever we choose must not make that later migration expensive.

## Decision

We will use **SQLite** via **`better-sqlite3`**, accessed through an explicit
**Repository Pattern** (`apps/web/lib/db/repositories/*`) with **no ORM**. Each repository
owns the mapping between SQLite rows and the domain types in `@gharibo/shared`. JSON-shaped
columns are stored as `TEXT` and (de)serialised inside the repository. The connection is a
singleton opened in WAL mode (`apps/web/lib/db/index.ts`), and the schema is created by
`CREATE TABLE IF NOT EXISTS` statements in dependency order (`lib/db/schema.ts`).

## Consequences

### Positive
- Zero operational overhead: a single file, no server, no container, works offline.
- `better-sqlite3` is synchronous, which removes async plumbing from repositories and makes
  route handlers straightforward.
- No ORM means no hidden query generation, no lazy-loading surprises, and no migration
  framework lock-in. The SQL is visible and auditable.
- The repository boundary is the migration seam: to move to PostgreSQL, implement the same
  repository interfaces against a `pg` client. Controllers and UI are untouched.
- WAL mode allows concurrent reads during writes, which suits a single-operator tool.

### Negative / Trade-offs
- SQLite is single-writer. Fine for a single-operator lab; it will not scale to concurrent
  multi-user writes without the PostgreSQL move.
- Native module: `better-sqlite3` must be rebuilt against the local Node ABI. On Windows +
  Node 22 this required `npm rebuild better-sqlite3` (documented in the README).
- No ORM means schema changes are hand-written SQL. Mitigated by keeping all DDL in one file
  and using `IF NOT EXISTS`.
- Repository code is boilerplate-heavy compared to an ORM — accepted as the price of an
  explicit, portable data layer.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Prisma / Drizzle / TypeORM | Adds a codegen step and a migration framework; the query surface here is small enough that the abstraction cost outweighs the benefit |
| PostgreSQL from day one | Requires a running server and credentials before the lab can persist anything — hostile to first-run experience |
| JSON files / `lowdb` | No transactions, no queries, no integrity constraints; breaks down as soon as data-factory and training records relate to datasets |
| `node:sqlite` (built-in) | Not stable/available across the Node 22 line at freeze time |

## References

- `docs/PRD.md` — P0-13 (persistence), P2-04 (PostgreSQL swap)
- `docs/ARCHITECTURE.md` §1.3 (Database Access Pattern), §3.4 (SQLite schema)
- `apps/web/lib/db/schema.ts`, `apps/web/lib/db/index.ts`, `apps/web/lib/db/repositories/*`
