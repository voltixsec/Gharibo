# ADR-0017: GHARIBO Master State as the canonical single source of truth

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | CTO / Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | post-M3B |

## Context

GHARIBO's project knowledge — decisions, training strategy, architecture, datasets, experiments,
security rules and roadmap — is repeatedly lost across sessions. Work happens in ChatGPT, in
WorkBuddy, and in coding-agent sessions, and each of those tools keeps its own partial memory. The
consequence is that the same decisions get re-litigated, the same context gets rebuilt, and the
project's state drifts depending on which tool is asked.

Two existing mechanisms are insufficient on their own:

1. **Prose governance alone is not machine-checkable.** A governance document can state a rule, but
   nothing verifies that the project actually conforms to it. A rule that cannot be checked drifts
   silently.
2. **Per-tool memory fragments the record.** When the "source of truth" is whatever a given
   assistant remembers, there is no single, portable, authoritative record, and the tools disagree.

What is needed is a **single, machine-readable, portable, machine-checkable** project state that is
the authoritative index of accepted decisions, and that references the detailed documents rather
than duplicating them.

## Decision

We will make `governance/GHARIBO_MASTER_STATE.json` the **canonical machine-readable project
state** and the authoritative index of accepted GHARIBO decisions. It **references** detailed ADRs
and documents rather than duplicating them.

- `docs/GHARIBO_MASTER_STATE.md` is **NOT independently authored**. It is deterministically
  generated from the JSON by `scripts/master/generate-master-state.mjs` (`npm run master:generate`).
  Editing the Markdown by hand is a defect, not an update.
- `scripts/master/validate-master-state.mjs` (`npm run master:validate`) enforces the integrity of
  the master state. It checks: JSON validity; schema/version presence; required sections; unique
  decision IDs; valid decision statuses; valid roadmap statuses; experiment, model and dataset
  reference integrity; current-state consistency; **TRAINING HAS NOT STARTED** consistency;
  generated-Markdown synchronisation; no obvious secrets; no raw/private dataset exposure; no
  normative machine-specific paths; ADR references on architecture-changing accepted decisions; and
  resolvable supersession references. `npm run docs:validate` runs it as a **non-circular**
  additional gate.
- **Governance rule.** A material GHARIBO decision affecting any of — architecture, training,
  datasets, experiments, models, knowledge graph, procurement intelligence, integrations,
  security/IP, roadmap — is **NOT** considered an accepted project decision until:
  1. `GHARIBO_MASTER_STATE.json` is updated;
  2. validation passes;
  3. the required ADR/doc updates are completed; and
  4. the change is checkpointed in Git.
- The master state contains **architecture and governance only — never confidential business data,
  secrets or dataset payloads**.

## Consequences

### Positive
- The project's state becomes **machine-checkable**: rules that were previously prose become
  validations that either pass or fail, so drift is detected rather than discovered.
- The record is **portable across agents and tools**: any future GHARIBO version, assistant or
  coding agent can load one JSON file and know the authoritative decisions, instead of relying on
  fragmented per-tool memory.
- Referencing ADRs rather than duplicating them keeps a single source for each decision and avoids
  the two documents disagreeing.
- Deterministic generation of the Markdown from the JSON means the human-readable and
  machine-readable views cannot drift apart.
- The gate ("update JSON → validate → update docs → checkpoint") turns "we decided this" into a
  concrete, verifiable sequence rather than an informal claim.

### Negative / Trade-offs
- Every material decision now carries an **extra mandatory step**: the master state must be updated
  and validated before the decision counts. This is deliberate friction and will occasionally feel
  heavy for small changes.
- The system introduces a **generator/validator pair that must be maintained**. If either breaks,
  the gate is only as good as its implementation, and a buggy validator could give false confidence.
- Making the JSON canonical means contributors must understand the schema; a malformed or
  incomplete update blocks acceptance until corrected.
- A single canonical file is a single point of contention for concurrent edits and must be kept
  conflict-free, which requires coordination discipline.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Prose-only governance | Not machine-checkable: rules stated in prose drift silently because nothing verifies conformance |
| Generate project state from code at runtime | Code does not capture decisions, rationale or roadmap intent, and the state would be re-derived inconsistently per run |
| Per-assistant memory files as the source of truth | Fragments the record across tools, which disagree; no single portable, authoritative state exists |
| Hand-author both the JSON and the Markdown | The two would drift and contradict each other; generating the Markdown from the JSON keeps them consistent by construction |

## References

- `docs/DOCUMENTATION_GOVERNANCE.md` — the documentation governance rules this decision complements
- `docs/DOCUMENT_REGISTER.md` — the live index of governed documents
- `governance/GHARIBO_MASTER_STATE.json` — the canonical machine-readable project state
- `scripts/master/generate-master-state.mjs` — the deterministic Markdown generator
- `scripts/master/validate-master-state.mjs` — the master-state validator wired into `npm run docs:validate`
