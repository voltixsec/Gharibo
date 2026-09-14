# Documentation Governance

| Field | Value |
|-------|-------|
| **Document Owner** | Architecture (GHARIBO AI LAB) |
| **Type** | Governance |
| **Status** | Frozen |
| **Version** | 1.0.0 |
| **Last Updated** | 2026-09-14 |

This document defines how documentation is owned, versioned, reviewed, and changed in
GHARIBO AI LAB. It is the contract that makes the rest of the document set trustworthy.
`docs/DOCUMENT_REGISTER.md` is the live index of every governed document and its current
status.

---

## 1. Why this exists

The lab's credibility rests on one rule: **it must never claim something it has not done.**
That rule applies to code (no fake training, no fake metrics — see ADR-0005) and equally to
documents. A document that says "30 API endpoints" when there are 28 is a small lie that
erodes the same trust a fake loss curve would.

Governance exists so that:

- every document has an **owner** who is answerable for its accuracy;
- every document declares a **status** so a reader knows how much to rely on it;
- every document carries a **version** so a baseline can be referenced and frozen;
- every **change** to a frozen document is deliberate, reviewed, and recorded;
- **drift between documents and code is detectable**, not discovered by accident.

---

## 2. Document types

| Type | Purpose | Lives in | Example |
|------|---------|----------|---------|
| **PRD** | What we are building and why | `docs/` | `PRD.md` |
| **Architecture** | How the system is structured; the frozen baseline | `docs/` | `ARCHITECTURE.md` |
| **Domain spec** | The contract for one subsystem | `docs/` | `DATA_FACTORY.md`, `TRAINING_STRATEGY.md` |
| **ADR** | A single architectural decision and its rationale | `docs/adr/` | `ADR-0002-*.md` |
| **Governance** | Rules for the document set itself | `docs/` | this file, `DOCUMENT_REGISTER.md` |
| **Diagram** | Machine-readable structure | `docs/` | `class-diagram.mermaid` |
| **Runbook** | How to install, run, and troubleshoot | repo root | `README.md` |
| **Delivery note** | A point-in-time record of what shipped | repo root | `overview.md` |

---

## 3. Required metadata header

Every governed document **must** open with a metadata table immediately after its H1 title:

```markdown
| Field | Value |
|-------|-------|
| **Document Owner** | <role> (GHARIBO AI LAB) |
| **Type** | PRD \| Architecture \| Domain spec \| ADR \| Governance \| Diagram \| Runbook \| Delivery note |
| **Status** | <one of the statuses in §4> |
| **Version** | <semver, e.g. 1.0.0> |
| **Last Updated** | YYYY-MM-DD |
```

ADRs use the ADR-specific table in `docs/adr/TEMPLATE.md` instead (§6).

---

## 4. Status vocabulary

| Status | Meaning | Who may set it |
|--------|---------|----------------|
| **Draft** | Being written; not authoritative | Author |
| **In Review** | Complete enough to review; not yet binding | Author |
| **Approved** | Agreed; changes follow §5 | Owner |
| **Frozen** | Part of a declared baseline; changes require an ADR (§5) | Owner |
| **Living** | Expected to change continuously (registers, indexes) | Owner |
| **Superseded** | Replaced by another document; kept for history | Owner |
| **Deprecated** | No longer applicable | Owner |

`Living` is reserved for index/register documents — it must not be used to avoid versioning a
real specification.

---

## 5. Change control

### 5.1 Frozen documents

A document with `Status: Frozen` is part of the **architecture baseline**. Changing it
requires:

1. an **ADR** describing the decision, if the change is architectural;
2. a **minor or major version bump** (see §5.3);
3. an updated `Last Updated` date;
4. an entry in `docs/DOCUMENT_REGISTER.md`.

Editorial corrections that do not change meaning (typos, formatting, fixing a link) do **not**
require an ADR, but **do** require a version bump and an updated date, so the baseline remains
auditable.

### 5.2 Approved documents

`Approved` documents may be edited by their owner without an ADR, provided the change does not
contradict a frozen document or an accepted ADR. If it would, the frozen document must be
changed first, via §5.1.

### 5.3 Versioning

Documents use semantic versioning with these meanings:

| Bump | Meaning |
|------|---------|
| **MAJOR** | The document's contract changes in a way that invalidates prior work (a removed requirement, a changed interface, a reversed decision) |
| **MINOR** | New content that extends without invalidating (a new section, a new requirement, a new ADR reference) |
| **PATCH** | Corrections, clarifications, typos, formatting — meaning preserved |

The architecture baseline for Milestone 1 is **`ARCHITECTURE.md` v1.0.0 (Frozen)**, declared on
2026-09-14.

### 5.4 Superseding a document

Never delete a governed document to "replace" it. Set its status to `Superseded`, add a pointer
to the replacement, and leave the content in place. History is the point.

---

## 6. ADRs

- One decision per record. Location: `docs/adr/ADR-NNNN-<kebab-case-title>.md`.
- Numbers are sequential from `0001` and **never reused**.
- Status vocabulary: `Proposed`, `Accepted`, `Rejected`, `Superseded`, `Deprecated`.
- An `Accepted` ADR is **immutable in substance**. To change a decision, write a new ADR that
  supersedes it and update `Supersedes` / `Superseded by` on both records.
- The index in `docs/adr/README.md` must list exactly the ADR files that exist — the validator
  enforces this.
- Template: `docs/adr/TEMPLATE.md`.

---

## 7. Verified facts

Architecture documents make countable claims (number of routes, tables, pages). These drift
silently. To prevent that, `docs/ARCHITECTURE.md` contains a machine-readable facts block:

```markdown
<!-- docs:facts -->
| Metric | Value |
|--------|-------|
| api_route_files | 28 |
...
<!-- /docs:facts -->
```

`scripts/validate-docs.mjs` recomputes each metric from the codebase and fails if the declared
value disagrees. **When you change the code, update the block.** This is the mechanism that
keeps the frozen baseline honest.

---

## 8. Enforcement

```bash
npm run docs:validate
```

`scripts/validate-docs.mjs` checks:

1. every governed document has a complete metadata header;
2. every `Status` is in the vocabulary for its document type;
3. ADR files are correctly named and numbered, and the index matches the files on disk;
4. every fact declared in the `docs:facts` block matches the implementation;
5. every version declared in `docs/DOCUMENT_REGISTER.md` matches the document's own header.

The validator is part of the verification suite and **must pass before any commit that changes
documentation or the counts it declares.**

---

## 9. Review cadence

| Trigger | Action |
|---------|--------|
| Any change to routes, schema, or page count | Update the `docs:facts` block and re-run `npm run docs:validate` |
| Any architectural decision | Write an ADR |
| Start of a milestone | Review the register; mark superseded documents |
| Before a release or checkpoint | Run `npm run docs:validate`; ensure no `Draft` document is referenced as authoritative |

---

## 10. Traceability

Requirements flow through the document set in one direction:

```
PRD requirement (P0-NN)
   → ARCHITECTURE.md section (§N)
      → ADR (why)
         → code path (file)
```

Every ADR carries a `References` section pointing back to the PRD requirement and the
architecture section it serves, and forward to the code it governs. A decision that cannot be
traced to a requirement, and a requirement that cannot be traced to a decision, are both
findings worth raising.
