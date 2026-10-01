import { createHash, randomUUID } from "node:crypto";

export interface EvidenceClaim {
  id: string;
  subject: string;
  predicate: string;
  value: string;
  sourceUrl: string;
  sourceType: "OFFICIAL" | "CATALOG" | "SUPPLIER" | "MARKETPLACE" | "OTHER";
  observedAt: string;
  confidence: number;
  excerpt: string;
  contentHash: string;
}

export class EvidenceGraph {
  private readonly claims: EvidenceClaim[] = [];

  add(input: Omit<EvidenceClaim, "id" | "contentHash">): EvidenceClaim {
    const url = new URL(input.sourceUrl);
    if (url.protocol !== "https:" && !url.hostname.endsWith(".localhost")) throw new Error("EVIDENCE_SOURCE_URL_INVALID");
    if (!input.subject || !input.predicate || !input.value || !input.excerpt) throw new Error("EVIDENCE_INCOMPLETE");
    if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) throw new Error("EVIDENCE_CONFIDENCE_INVALID");
    if (Number.isNaN(Date.parse(input.observedAt))) throw new Error("EVIDENCE_DATE_INVALID");

    const claim: EvidenceClaim = {
      ...input,
      id: randomUUID(),
      contentHash: createHash("sha256").update(input.excerpt).digest("hex"),
    };
    this.claims.push(claim);
    return structuredClone(claim);
  }

  snapshot(subject?: string): EvidenceClaim[] {
    return structuredClone(subject ? this.claims.filter((claim) => claim.subject === subject) : this.claims);
  }

  contradictions(): Array<{ subject: string; predicate: string; values: string[]; claimIds: string[] }> {
    const groups = new Map<string, EvidenceClaim[]>();
    for (const claim of this.claims) {
      const key = JSON.stringify([claim.subject, claim.predicate]);
      groups.set(key, [...(groups.get(key) ?? []), claim]);
    }
    return [...groups.values()]
      .filter((group) => new Set(group.map((claim) => claim.value.trim().toLocaleLowerCase())).size > 1)
      .map((group) => ({
        subject: group[0]!.subject,
        predicate: group[0]!.predicate,
        values: [...new Set(group.map((claim) => claim.value))],
        claimIds: group.map((claim) => claim.id),
      }));
  }

  sufficiency(requiredPredicates: readonly string[]): "SUFFICIENT" | "PARTIAL" | "CONFLICTING" | "INSUFFICIENT" {
    if (this.contradictions().length) return "CONFLICTING";
    if (!requiredPredicates.length) return "INSUFFICIENT";
    const present = new Set(this.claims.map((claim) => claim.predicate));
    const matched = requiredPredicates.filter((predicate) => present.has(predicate)).length;
    return matched === requiredPredicates.length ? "SUFFICIENT" : matched ? "PARTIAL" : "INSUFFICIENT";
  }
}
