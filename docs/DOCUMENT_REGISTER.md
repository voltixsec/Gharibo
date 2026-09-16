# Document Register

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Governance |
| **Status** | Living |
| **Version** | 1.18.0 |
| **Last Updated** | 2026-09-16 |

The authoritative index of every governed document. Rules for ownership, statuses, and change
control are in [`DOCUMENTATION_GOVERNANCE.md`](DOCUMENTATION_GOVERNANCE.md).

`scripts/validate-docs.mjs` (`npm run docs:validate`) enforces that the **Version** and
**Status** recorded here match each document's own metadata header.

## Documents

| Document | Path | Owner | Type | Status | Version | Last Updated |
|----------|------|-------|------|--------|---------|--------------|
| Product Requirements | `docs/PRD.md` | Product | PRD | Approved | 1.0.0 | 2026-09-14 |
| Product Requirements (M2) | `docs/PRD_MILESTONE_2.md` | Product | PRD | Approved | 1.0.0 | 2026-09-14 |
| System Architecture | `docs/ARCHITECTURE.md` | Architecture | Architecture | Frozen | 1.2.1 | 2026-09-15 |
| System Architecture (M2) | `docs/ARCHITECTURE_MILESTONE_2.md` | Architecture | Architecture | Frozen | 1.1.0 | 2026-09-15 |
| Training Strategy | `docs/TRAINING_STRATEGY.md` | Architecture | Domain spec | Frozen | 1.4.0 | 2026-09-15 |
| Environment Qualification Contract | `docs/ENV_QUALIFICATION_CONTRACT.md` | Architecture | Domain spec | Draft | 1.5.0 | 2026-09-15 |
| Data Factory | `docs/DATA_FACTORY.md` | Architecture | Domain spec | Frozen | 1.4.0 | 2026-09-14 |
| Evaluation Framework | `docs/EVALUATION.md` | Architecture | Domain spec | Frozen | 1.2.0 | 2026-09-14 |
| Evaluation Authorization Request | `docs/EVALUATION_AUTHORIZATION_REQUEST.md` | Architecture | Governance | Approved | 1.2.0 | 2026-09-16 |
| Evaluation Execution Blocker | `docs/EVALUATION_EXECUTION_BLOCKER.md` | Architecture | Governance | Approved | 1.4.0 | 2026-09-16 |
| Evaluation Benchmark Launch | `docs/EVALUATION_BENCHMARK_LAUNCH.md` | Architecture | Governance | Approved | 1.3.0 | 2026-09-16 |
| Research Benchmark | `docs/RESEARCH_BENCHMARK.md` | Architecture | Domain spec | Draft | 1.1.0 | 2026-09-14 |
| Research Gym | `docs/RESEARCH_GYM.md` | Architecture | Domain spec | Frozen | 1.0.0 | 2026-09-14 |
| Model Registry | `docs/MODEL_REGISTRY.md` | Architecture | Domain spec | Frozen | 1.4.0 | 2026-09-15 |
| Roadmap | `docs/ROADMAP.md` | Product | Roadmap | Approved | 1.3.0 | 2026-09-15 |
| Documentation Governance | `docs/DOCUMENTATION_GOVERNANCE.md` | Architecture | Governance | Frozen | 1.0.0 | 2026-09-14 |
| Document Register | `docs/DOCUMENT_REGISTER.md` | Architecture | Governance | Living | 1.18.0 | 2026-09-16 |
| Master State (generated) | `docs/GHARIBO_MASTER_STATE.md` | Architecture | Governance | Living | 1.25.0 | 2026-09-16 |
| Master State (canonical) | `governance/GHARIBO_MASTER_STATE.json` | Architecture | Governance | Living | 1.0.0 | 2026-09-15 |
| ADR Index | `docs/adr/README.md` | Architecture | Governance | Living | 1.4.0 | 2026-09-15 |
| ADR Template | `docs/adr/TEMPLATE.md` | Architecture | Governance | Living | 1.0.0 | 2026-09-14 |
| Class Diagram | `docs/class-diagram.mermaid` | Architecture | Diagram | Frozen | 1.0.0 | 2026-09-14 |
| Sequence Diagram | `docs/sequence-diagram.mermaid` | Architecture | Diagram | Frozen | 1.0.0 | 2026-09-14 |
| README (Runbook) | `README.md` | Architecture | Runbook | Living | 1.0.0 | 2026-09-14 |
| Project State | `PROJECT_STATE.md` | Architecture | Governance | Living | 1.2.0 | 2026-09-15 |
| Changelog | `CHANGELOG.md` | Delivery | Delivery note | Living | 1.6.0 | 2026-09-16 |
| Delivery Overview | `overview.md` | Delivery | Delivery note | Superseded | 1.0.0 | 2026-09-14 |

## Architecture Decision Records

| ADR | Path | Status | Date |
|-----|------|--------|------|
| ADR-0001 | `docs/adr/ADR-0001-nextjs-route-handlers-as-backend.md` | Accepted | 2026-09-14 |
| ADR-0002 | `docs/adr/ADR-0002-sqlite-better-sqlite3-repository-pattern.md` | Accepted | 2026-09-14 |
| ADR-0003 | `docs/adr/ADR-0003-single-provider-abstraction.md` | Accepted | 2026-09-14 |
| ADR-0004 | `docs/adr/ADR-0004-credentials-by-reference.md` | Accepted | 2026-09-14 |
| ADR-0005 | `docs/adr/ADR-0005-training-launch-ready-only.md` | Accepted | 2026-09-14 |
| ADR-0006 | `docs/adr/ADR-0006-npm-workspaces-monorepo.md` | Accepted | 2026-09-14 |
| ADR-0007 | `docs/adr/ADR-0007-data-factory-pipeline-state-machine.md` | Accepted | 2026-09-14 |
| ADR-0008 | `docs/adr/ADR-0008-model-registry-status-gates.md` | Accepted | 2026-09-14 |
| ADR-0009 | `docs/adr/ADR-0009-python-service-cors-allowlist.md` | Accepted | 2026-09-14 |
| ADR-0010 | `docs/adr/ADR-0010-root-scripts-delegate-to-workspaces.md` | Accepted | 2026-09-14 |
| ADR-0011 | `docs/adr/ADR-0011-training-worker-abstraction.md` | Accepted | 2026-09-14 |
| ADR-0012 | `docs/adr/ADR-0012-canonical-training-package.md` | Accepted | 2026-09-14 |
| ADR-0013 | `docs/adr/ADR-0013-content-addressed-dataset-versions.md` | Accepted | 2026-09-14 |
| ADR-0014 | `docs/adr/ADR-0014-zero-cost-artifact-policy.md` | Accepted | 2026-09-14 |
| ADR-0015 | `docs/adr/ADR-0015-universal-commercial-procurement-knowledge-graph.md` | Accepted | 2026-09-14 |
| ADR-0016 | `docs/adr/ADR-0016-voka-gharibo-integration-boundary.md` | Accepted | 2026-09-14 |
| ADR-0017 | `docs/adr/ADR-0017-master-state-single-source-of-truth.md` | Accepted | 2026-09-14 |
| ADR-0018 | `docs/adr/ADR-0018-real-model-compatibility-qualification.md` | Accepted | 2026-09-14 |
| ADR-0019 | `docs/adr/ADR-0019-governed-gold-package-preview.md` | Accepted | 2026-09-15 |
| ADR-0020 | `docs/adr/ADR-0020-post-execution-truth-reconciliation.md` | Accepted | 2026-09-15 |

## Notes

- `overview.md` is marked **Superseded**: it is a point-in-time delivery note for Milestone 1
  and its counts have been reconciled, but it is not an authoritative specification. The
  authoritative sources are `docs/ARCHITECTURE.md` and this register.
- `README.md` is `Living` — it is the operator-facing runbook and is expected to change as the
  environment changes.
