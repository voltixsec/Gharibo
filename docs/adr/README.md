# Architecture Decision Records (ADRs)

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Governance |
| **Status** | Living |
| **Version** | 1.1.0 |
| **Last Updated** | 2026-09-14 |

This directory holds the decision log for GHARIBO AI LAB. An ADR captures **why** the
architecture is the way it is, at the moment the decision was made. Code shows *what*;
the architecture document shows *how*; ADRs show *why*.

Governance rules (statuses, ownership, when an ADR is required) live in
[`../DOCUMENTATION_GOVERNANCE.md`](../DOCUMENTATION_GOVERNANCE.md).

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-0001](ADR-0001-nextjs-route-handlers-as-backend.md) | Next.js Route Handlers as the application backend | Accepted | 2026-09-14 |
| [ADR-0002](ADR-0002-sqlite-better-sqlite3-repository-pattern.md) | SQLite + better-sqlite3 behind a Repository Pattern | Accepted | 2026-09-14 |
| [ADR-0003](ADR-0003-single-provider-abstraction.md) | One provider abstraction with four interchangeable backends | Accepted | 2026-09-14 |
| [ADR-0004](ADR-0004-credentials-by-reference.md) | Store provider credentials by reference, never as values | Accepted | 2026-09-14 |
| [ADR-0005](ADR-0005-training-launch-ready-only.md) | Training is launch-ready only in Milestone 1 | Accepted | 2026-09-14 |
| [ADR-0006](ADR-0006-npm-workspaces-monorepo.md) | npm workspaces monorepo with a shared types package | Accepted | 2026-09-14 |
| [ADR-0007](ADR-0007-data-factory-pipeline-state-machine.md) | Data Factory as an explicit pipeline state machine | Accepted | 2026-09-14 |
| [ADR-0008](ADR-0008-model-registry-status-gates.md) | Gate model promotion through registry statuses | Accepted | 2026-09-14 |
| [ADR-0009](ADR-0009-python-service-cors-allowlist.md) | Restrict CORS on Python services to an explicit allow-list | Accepted | 2026-09-14 |
| [ADR-0010](ADR-0010-root-scripts-delegate-to-workspaces.md) | Root scripts delegate to workspaces; Next.js pinned at the repo root | Accepted | 2026-09-14 |
| [ADR-0011](ADR-0011-training-worker-abstraction.md) | Provider-neutral `TrainingWorker` abstraction with Kaggle as Worker #1 | Accepted | 2026-09-14 |
| [ADR-0012](ADR-0012-canonical-training-package.md) | The canonical Training Package as the portable, reproducible training contract | Accepted | 2026-09-14 |
| [ADR-0013](ADR-0013-content-addressed-dataset-versions.md) | Content-addressed immutable dataset versions with deterministic hashed splits | Accepted | 2026-09-14 |
| [ADR-0014](ADR-0014-zero-cost-artifact-policy.md) | Zero-cost artifact policy — optional private HF, local fallback, never GitHub | Accepted | 2026-09-14 |
| [ADR-0015](ADR-0015-universal-commercial-procurement-knowledge-graph.md) | Universal Commercial + Procurement Knowledge Graph as the library architecture | Accepted | 2026-09-14 |
| [ADR-0016](ADR-0016-voka-gharibo-integration-boundary.md) | VOKA ↔ GHARIBO integration boundary — intelligence behind an AI Gateway | Accepted | 2026-09-14 |
| [ADR-0017](ADR-0017-master-state-single-source-of-truth.md) | GHARIBO Master State as the canonical single source of truth | Accepted | 2026-09-14 |

## Conventions

- **Filename**: `ADR-NNNN-<kebab-case-title>.md`, numbered sequentially, never reused.
- **Immutability**: an Accepted ADR is a historical record. To change a decision, write a
  new ADR that *supersedes* it and update the `Superseded by` / `Supersedes` fields on both.
  Never rewrite the substance of an accepted ADR.
- **One decision per record.** If you need the word "and" in the title, you probably need
  two ADRs.
- **Template**: [`TEMPLATE.md`](TEMPLATE.md).

## Adding an ADR

1. Copy `TEMPLATE.md` to `ADR-NNNN-<title>.md` using the next free number.
2. Fill in Context, Decision, Consequences, and Alternatives Considered.
3. Set `Status: Proposed` and open it for review.
4. Once agreed, set `Status: Accepted` and add a row to the index above.
5. Run `npm run docs:validate` to confirm the index and files agree.
