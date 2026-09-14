# ADR-0015: Universal Commercial + Procurement Knowledge Graph as the library architecture

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | CTO / Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | post-M3B (extends v1.1.1) |

## Context

GHARIBO's future library — the knowledge layer that GHARIBO will build, curate and reason over —
was previously assumed to be a **Product Catalog**: a structured list of products and their
attributes. That framing is too narrow for the commercial reality GHARIBO is meant to serve.

The commercial and procurement world GHARIBO must understand is not a list of products. It is a
heterogeneous web of **products, services, and the organizations that supply, install, integrate
and maintain them**. A single purchasing need — for example, sourcing and standing up a
technical system — routinely involves a manufacturer, a brand owner, one or more distributors and
dealers, a supplier, a system integrator, a contractor, a subcontractor, and a maintenance
provider. These roles are frequently filled by the **same legal company** at the same time. A
catalog of products alone cannot express who supplies what, who is authorized to sell it, who can
install it, who maintains it, in which geography, under which scope, and on what evidence.

Three forces make this decision necessary:

1. **Heterogeneous commercial reality.** Products, services and organizations are all first-class
   commercial entities, and they relate to each other in many ways. Any model that privileges
   products over the other two cannot represent real procurement.
2. **Evidence must be auditable.** Every commercial claim GHARIBO makes ("this company is an
   authorized distributor of this brand in this country") is a factual assertion about the world.
   The lab's governing rule is that it must never claim something it has not verified. Therefore
   evidence and provenance cannot be optional decoration — they must be part of the model.
3. **Knowledge must survive across sessions and tools.** GHARIBO's knowledge cannot live in a
   single assistant's memory or a single session's context. It must be a durable, portable,
   governed artifact that any future GHARIBO version, agent or tool can load and reason over.

The project rule — never assert what cannot be recomputed or evidenced — applies to commercial
knowledge exactly as it applies to training metrics.

## Decision

We will model the GHARIBO library as a **UNIVERSAL COMMERCIAL + PROCUREMENT KNOWLEDGE GRAPH**,
not merely a Product Catalog. The graph supports **PRODUCTS, SERVICES and ORGANIZATIONS** as
first-class entities.

**Core concepts.** The graph is built from these node types: `CATEGORY`, `DOMAIN`, `SYSTEM`,
`MANUFACTURER`, `BRAND`, `PRODUCT_FAMILY`, `PRODUCT_MODEL`, `ITEM`, `SERVICE`, `ORGANIZATION`,
`SOURCE`, `EVIDENCE`, `RELATION`, and `MARKET_RELEVANCE`.

**Evidence and provenance are first-class concepts**, not afterthought metadata. They are nodes in
the graph in their own right, referenced by the claims that depend on them, so that any commercial
assertion can be traced back to its source.

**ORGANIZATION is the durable company/legal/business identity.** We will **not** model `SUPPLIER`,
`CONTRACTOR`, `DISTRIBUTOR` and similar terms as mutually-exclusive company identities. Instead, an
`ORGANIZATION` holds one or more **contextual ROLES**: `MANUFACTURER`, `DISTRIBUTOR`, `DEALER`,
`SUPPLIER`, `CONTRACTOR`, `SUBCONTRACTOR`, `SYSTEM_INTEGRATOR`, `SERVICE_PROVIDER`, and
`MAINTENANCE_PROVIDER`. The same organization may simultaneously be a SUPPLIER + SYSTEM_INTEGRATOR
+ MAINTENANCE_PROVIDER **without creating duplicate organization entities**. Roles are contextual
and time-bounded; identity is single and durable.

**Governed relation types.** Relationships are typed, and the direction of each relation is
governed. The relation set is extensible, and **not every relation is to be blindly created in
code** — each is created only where it is meaningful and supported. The initial governed set is:
`MANUFACTURES`, `BRANDS`, `DISTRIBUTES`, `DEALS_IN`, `SUPPLIES`, `INSTALLS`, `INTEGRATES`,
`SUBCONTRACTS`, `SERVICES`, `MAINTAINS`, `AUTHORIZED_FOR`, `CERTIFIED_FOR`, `CAPABLE_OF`,
`OPERATES_IN`, `SERVES_MARKET`, `SUPPORTS`, and `RELATED_TO`. An `ORGANIZATION` may be linked to
`CATEGORY`, `DOMAIN`, `SYSTEM`, `BRAND`, `PRODUCT_FAMILY`, `PRODUCT_MODEL`, `ITEM`, `SERVICE`, and
`GEOGRAPHY`.

**Every commercially meaningful relationship must be capable of carrying** the following qualifiers:
`evidence`, `provenance`, `sourceUrl`/`sourceReference`, `confidence`, `observedAt`, `validFrom`,
`validUntil`, `geography`, `scope`, `lifecycle`/`status`, and `verificationState`. A relation is
not a bare edge; it is a qualified, evidence-bearing claim.

**Strict separation of relatively stable knowledge from time-sensitive commercial data.** This is a
core architectural boundary:

- *Relatively stable* (belongs in the knowledge graph): organization identity, manufacturer
  identity, brand ownership, product identity, capabilities, system classifications, service
  categories, supported geographies, and verified role relationships.
- *Time-sensitive* (must **not** be treated as permanent model truth): current price, stock
  availability, lead time, MOQ, payment terms, quotation validity, current contact person, current
  dealer status, current authorization status, current freight, and current market pricing.

Time-sensitive data belongs in a live database, governed observation records, RAG, search, tools,
and supplier quotation history — not in the model's weights. GHARIBO should learn **HOW TO DISCOVER
AND VERIFY** such information, not memorize it.

**Private internal procurement intelligence is PRIVATE.** Information such as quotation response
speed, price competitiveness, delivery performance, documentation quality, rejection history,
dispute history, responsiveness, payment-term history, PO history, and project performance is
**private internal business intelligence**. It must remain logically separated from public web
evidence and must **never** be exposed as public knowledge.

**Authorization discipline.** We will never claim that a company is "authorized" unless the claim is
supported by suitable evidence. Authorization is a verified relation, not an assumption.

**Data Factory lifecycle for generated commercial knowledge.** Generated commercial knowledge
follows a governed lifecycle: `GHARIBO GENERATION → CANDIDATE → SCHEMA VALIDATION → IDENTITY /
DUPLICATE CHECK → SOURCE / EVIDENCE CHECK → RELATION INTEGRITY CHECK → ACCEPTED | NEEDS_REVIEW |
REJECTED → GOVERNED KNOWLEDGE GRAPH`. Generated results are **NEVER automatically Gold**; only
high-quality accepted examples may later become training candidates.

**Self-improvement flywheel.** The intended improvement loop is: `INITIAL GOLD DATA → GHARIBO
TRAINING → GHARIBO GENERATES CANDIDATES → VERIFIERS + EVIDENCE + HUMAN REVIEW → ACCEPTED KNOWLEDGE
→ HARD / VALUABLE TRAINING EXAMPLES → NEXT GHARIBO VERSION`. GHARIBO **MUST NOT** blindly train on
its own outputs; self-generated data must pass independent verification before it can be used, to
prevent model collapse and the self-reinforcement of errors.

**Status of this decision.** Nothing in this ADR is implemented yet. This is an approved
architectural direction, not a delivered capability.

## Consequences

### Positive
- The model can represent real procurement: products, services and organizations, with the
  relationships that actually determine who can supply, install, integrate and maintain a system.
- The organization-with-roles model eliminates duplicate-entity ambiguity: one company is one
  entity, regardless of how many commercial roles it plays.
- First-class evidence and provenance make every commercial claim auditable and traceable, which is
  the only way GHARIBO can honestly assert commercial facts.
- Separating stable knowledge from time-sensitive data keeps the model from going stale: prices,
  stock and authorizations are retrieved and verified live rather than memorized.
- Keeping private procurement intelligence logically separated protects confidential business data
  from ever leaking into public knowledge.
- The Data Factory lifecycle and the self-improvement flywheel give generated knowledge a governed
  path to trust and a defence against model collapse.

### Negative / Trade-offs
- The organization-with-roles model removes duplicate-entity ambiguity but **pushes complexity into
  role resolution and temporal validity** — resolving "which role does this company hold, in which
  geography, for which scope, at what time" is genuinely harder than storing a typed supplier row.
- First-class evidence **raises ingestion cost**: every relation now needs a source, a confidence
  and a validity window, and the ingestion pipeline must enforce that.
- Keeping commercial prices and stock **out of the weights** avoids staleness but **requires live
  retrieval at inference time**, which means GHARIBO cannot answer price questions offline and must
  depend on tools, search and databases at answer time.
- A governed relation set with an extensible-but-controlled vocabulary is more work to maintain
  than free-form edges, and it demands discipline to avoid inventing relations ad hoc in code.
- None of this is implemented yet: the gap between this approved direction and a delivered
  capability is large and must not be presented as done.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| A flat Product Catalog | Too narrow: it cannot express services, the organizations that supply/install/integrate/maintain, or the evidence behind commercial claims |
| Separate, mutually-exclusive supplier / contractor / distributor entity tables | Forces duplicate organization entities for a company that holds several roles, fragmenting identity and breaking provenance across roles |
| Model prices, stock and lead times as model knowledge (in the weights) | Time-sensitive data would go stale immediately and could not be audited or corrected; it belongs in live retrieval, not weights |
| Treat evidence as optional metadata | Makes commercial claims unverifiable and contradicts the lab's rule that nothing may be asserted without evidence |
| Free-form relation edges with no governed vocabulary | Allows silent drift and inconsistent semantics; a governed, extensible relation set keeps the graph machine-checkable |

## References

- `docs/DATA_FACTORY.md` — the pipeline lifecycle that generated commercial knowledge reuses
- `docs/ARCHITECTURE.md` — the frozen architecture baseline this decision extends
- `docs/ROADMAP.md` — where the knowledge-graph capability is sequenced
- `governance/GHARIBO_MASTER_STATE.json` — the canonical machine-readable project state that indexes this decision
- `docs/adr/ADR-0013-content-addressed-dataset-versions.md` — the provenance/content-addressing precedent
