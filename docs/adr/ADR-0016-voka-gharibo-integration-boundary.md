# ADR-0016: VOKA ↔ GHARIBO integration boundary — intelligence behind an AI Gateway

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | CTO / Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | post-M3B |

## Context

GHARIBO and VOKA are two distinct systems with two distinct responsibilities, and they will need to
work together. GHARIBO is an intelligence lab: it researches, constructs knowledge and reasons over
commercial and engineering problems. VOKA is a governed business workflow system: it runs the
day-to-day transactional processes of procurement — customers, projects, requirements, quotations,
RFQs, offers, comparisons, awards, purchase orders and invoices.

The temptation is to merge them: to let GHARIBO read and write VOKA's database directly, or to
embed the knowledge graph inside VOKA, or to store procurement transactions inside GHARIBO. All of
these shortcuts collapse two different kinds of truth into one system and create coupling that is
expensive to unwind.

Two facts make an explicit boundary necessary:

1. **GHARIBO must not become VOKA's internal database.** GHARIBO is a reusable intelligence layer
   that will serve VOKA and potentially other consumers; it cannot be captured as one application's
   storage.
2. **VOKA must not become GHARIBO's runtime.** GHARIBO must be able to evolve its models,
   pipelines and knowledge independently of VOKA's release cadence.

There is also a conceptual distinction that must be preserved: the knowledge graph answers a
different question from procurement. The knowledge graph answers *"WHO COULD/SHOULD WE ASK?"*;
procurement answers *"WHO DID WE ASK, WHAT DID THEY OFFER, WHO DID WE CHOOSE, AND WHAT DID WE
BUY?"* Knowledge and transactions must not be collapsed into the same concept.

## Decision

We will define an explicit **integration boundary** between VOKA and GHARIBO.

- The accepted future architecture is: `VOKA → AI GATEWAY → GHARIBO + OPTIONAL EXTERNAL MODELS`.
- **GHARIBO provides intelligence capabilities**: research, knowledge construction, UCL factory,
  supplier discovery, supplier intelligence, engineering reasoning, commercial reasoning, and
  document understanding.
- **VOKA remains the governed business workflow system** and owns all workflow and business state:
  customer, project, requirement, quotation, supplier workflow, RFQ, supplier offer, commercial
  comparison, award, PO, and invoice/business records.
- We will **not** tightly couple GHARIBO to VOKA internals. Integration is eventually achieved
  through **versioned APIs/contracts**.
- The logical future procurement flow is: `KNOWLEDGE GRAPH → ELIGIBLE SUPPLIERS / CONTRACTORS /
  SERVICE PROVIDERS → VOKA PROCUREMENT → RFQ → OFFERS → COMMERCIAL / TECHNICAL COMPARISON → AWARD
  → PO`.
- The **Knowledge Graph** answers *"WHO COULD/SHOULD WE ASK?"*; **VOKA Procurement** answers *"WHO
  DID WE ASK, WHAT DID THEY OFFER, WHO DID WE CHOOSE, AND WHAT DID WE BUY?"* Knowledge and
  transactions must not be collapsed into the same concept.
- This is an **approved boundary, not an implemented integration**. Nothing here is built yet.

## Consequences

### Positive
- VOKA's transactional truth stays authoritative: who was asked, what was offered, what was chosen
  and what was bought live in the system that owns the business process, with its audit trail.
- GHARIBO can evolve its models, knowledge graph and pipelines independently, because it is not
  entangled with VOKA's internal schema or release cycle.
- The AI Gateway gives a single, controlled seam for routing intelligence requests and for adding
  optional external models without changing VOKA or GHARIBO internals.
- The knowledge/transaction distinction keeps the reusable intelligence layer clean and portable,
  so it can serve consumers beyond VOKA.
- Versioned APIs/contracts make the boundary explicit and testable rather than implicit and fragile.

### Negative / Trade-offs
- An explicit boundary means **maintaining a versioned contract surface**: the APIs between VOKA,
  the gateway and GHARIBO must be versioned, documented and kept backward-compatible, which is
  ongoing cost.
- The **AI Gateway does not exist yet** and must be designed and built; until then there is no
  integration at all, only a declared direction.
- Splitting intelligence from transactions means some questions require data from both sides and
  therefore a round trip across the boundary, which is slower and more complex than a single query
  against a shared database would be.
- Two systems with two owners must be coordinated for any end-to-end procurement flow, which adds
  organisational overhead compared with a monolith.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Embed the knowledge graph inside VOKA | Makes GHARIBO an internal component of one application, preventing reuse and coupling intelligence to VOKA's schema and releases |
| Store procurement transactions in GHARIBO | Collapses transactional truth into the intelligence layer and violates the knowledge/transaction distinction; VOKA owns business state |
| Direct database-level coupling between VOKA and GHARIBO | Creates tight coupling to internal schemas on both sides, making independent evolution impossible and every schema change a cross-system break |
| No defined boundary (integrate ad hoc as needed) | Produces implicit, undocumented coupling that is expensive to reason about, test and unwind |

## References

- `docs/ARCHITECTURE.md` — the frozen architecture baseline this decision extends
- `docs/ROADMAP.md` — where the integration capability is sequenced
- `governance/GHARIBO_MASTER_STATE.json` — the canonical machine-readable project state that indexes this decision
- `docs/adr/ADR-0015-universal-commercial-procurement-knowledge-graph.md` — the knowledge graph this boundary exposes as intelligence
