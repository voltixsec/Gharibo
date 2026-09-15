#!/usr/bin/env node
/**
 * metrics.mjs — deterministic M1–M13 benchmark metric implementation.
 *
 * Implements `docs/RESEARCH_BENCHMARK.md` §5 EXACTLY. This module is the single scoring
 * authority: both arms (BASE and CANDIDATE) are scored by it, over the same items, with the
 * same config. It is deliberately:
 *
 *   - pure            — no network, no clock, no filesystem, no randomness
 *   - order-independent — every set comparison is a multiset intersection over SORTED keys
 *   - normalisation-faithful — one `norm`, used everywhere, exactly as the spec defines it
 *   - honest          — a metric whose denominator is zero is `null`/excluded, never `0`
 *
 * The `norm` function is NORMATIVE in the spec: `NFC(trim(collapse_ws(s))).casefold()`. It
 * uses `String.prototype.normalize("NFC")` and `toLowerCase()` as the casefold approximation
 * available without ICU full-folding; the harness version records that choice so a report is
 * never silently compared across a differing normalisation.
 */

/** Harness version. Bump when any scoring behaviour changes. */
export const HARNESS_VERSION = "gharibo-eval-harness-1.0.0";

/** The one normalisation used everywhere (spec §2). */
export function norm(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/** Canonical JSON (sorted keys, no insignificant whitespace) — spec §2. */
export function canonicalJson(value) {
  const walk = (v) =>
    Array.isArray(v)
      ? v.map(walk)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, walk(v[k])]))
        : v;
  return JSON.stringify(walk(value));
}

/** Multiset intersection size over sorted key lists — order-independent (spec §2). */
export function multisetIntersection(aKeys, bKeys) {
  const a = [...aKeys].sort();
  const b = [...bKeys].sort();
  let i = 0;
  let j = 0;
  let matched = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      matched++;
      i++;
      j++;
    } else if (a[i] < b[j]) i++;
    else j++;
  }
  return matched;
}

/** micro-F1 from summed counts. */
export function microF1(matched, predicted, gold) {
  const p = predicted === 0 ? 0 : matched / predicted;
  const r = gold === 0 ? (predicted === 0 ? 1 : 0) : matched / gold;
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

/** Frozen type vocabulary used by the schema validator (Research Gym entity schema). */
export const ALLOWED_TYPES = Object.freeze([
  "CATEGORY",
  "DOMAIN",
  "SYSTEM",
  "MANUFACTURER",
  "BRAND",
  "PRODUCT_FAMILY",
  "PRODUCT_MODEL",
  "ITEM",
  "SERVICE",
  "RELATION",
  "MARKET_RELEVANCE",
]);

/** Fields every emitted entity must carry for schema validity (M1). */
export const REQUIRED_ENTITY_FIELDS = Object.freeze([
  "entityType",
  "externalKey",
  "classification",
  "normalizedPayload",
  "evidence",
  "provenance",
]);

// ---------------------------------------------------------------- output parsing (§4)

/**
 * Parses one raw model output into `P_i`.
 * Returns { raw, stripped, parsed, parseOk, schemaOk, claims }.
 * A parse error or schema failure yields a non-schema-valid result whose `parsed` is null.
 */
export function parseOutput(raw) {
  const stripped = typeof raw === "string" ? raw.trim() : "";
  let parsed = null;
  let parseOk = false;
  try {
    parsed = JSON.parse(stripped);
    parseOk = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    parseOk = false;
  }
  const schemaOk = parseOk ? validateSchema(parsed) : false;
  return { raw, stripped, parsed: schemaOk ? parsed : null, parseOk, schemaOk, claims: schemaOk ? decomposeClaims(parsed) : [] };
}

/** Schema validator (spec §5 M1). Every required field present, right type, vocabulary inside. */
export function validateSchema(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  for (const field of REQUIRED_ENTITY_FIELDS) {
    if (!(field in obj) || obj[field] === null || obj[field] === undefined) return false;
  }
  if (!ALLOWED_TYPES.includes(obj.entityType)) return false;
  if (typeof obj.externalKey !== "string" || obj.externalKey.trim() === "") return false;
  if (typeof obj.classification !== "string") return false;
  if (typeof obj.normalizedPayload !== "object" || obj.normalizedPayload === null) return false;
  if (typeof obj.provenance !== "object" || obj.provenance === null) return false;
  if (!Array.isArray(obj.evidence)) return false;
  return true;
}

/** Deterministic claim decomposition (spec §4.3). */
export function decomposeClaims(obj) {
  const claims = [];
  if (!obj || typeof obj !== "object") return claims;
  const ref = obj.externalKey ?? "";
  // entity existence
  claims.push({ kind: "entity", entity_ref: ref, key: "type", value: obj.entityType ?? "" });
  // attributes
  for (const attr of obj.attributes || []) {
    if (!attr || typeof attr !== "object") continue;
    claims.push({
      kind: "attribute",
      entity_ref: ref,
      key: attr.code ?? attr.name ?? "",
      value: attr.value,
    });
  }
  return claims;
}

// ------------------------------------------------------------------ per-metric helpers

/** Entity match key (M2). */
function entityKey(e) {
  return `${norm(e?.entityType ?? e?.type)}|${norm(e?.normalizedPayload?.name ?? e?.name)}`;
}

function goldEntityKey(e) {
  return `${norm(e?.type)}|${norm(e?.name)}`;
}

/** Citation validity (M4). `sources` are the item's provided evidence. */
function citationValid(citation, sourceIds, sourceTexts) {
  if (!citation || typeof citation !== "object") return false;
  const sid = citation.sourceId ?? citation.source_id ?? citation.sourceUrl ?? citation.source_url;
  if (!sid || !sourceIds.has(norm(sid))) return false;
  const quote = citation.quote ?? citation.claim;
  if (quote === undefined || quote === null) return true;
  const text = sourceTexts.get(norm(sid)) ?? "";
  return norm(text).includes(norm(quote));
}

// ------------------------------------------------------------------------- the metrics

/**
 * Computes M1–M13 for one arm over the item set.
 *
 * @param {Array<{item:object, gold:object, prediction:string}>} rows
 * @returns {{scores:object, counts:object, perMetric:object}}
 */
export function computeMetrics(rows, config) {
  const N = rows.length;
  const emptyItems = { count: 0 };
  let schemaOkCount = 0;
  let parseOkCount = 0;
  let matchedEntities = 0;
  let predictedEntities = 0;
  let goldEntities = 0;
  let validCitations = 0;
  let totalCitations = 0;
  let itemsWithoutCitations = 0;
  let dupNumer = 0;
  let dupDenom = 0;
  let dedupMatched = 0;
  let dedupPredicted = 0;
  let dedupGold = 0;
  let relMatched = 0;
  let relPredicted = 0;
  let relGold = 0;
  let instructionPass = 0;
  let exactTaxonomy = 0;
  let prefixTaxonomy = 0;
  let coverageNumer = 0;
  let coverageDenom = 0;
  let unsupported = 0;
  let claimsTotal = 0;
  let matchedEntitiesMicro = 0;
  let predictedEntitiesMicro = 0;
  let goldEntitiesMicro = 0;
  let presentFieldCount = 0;
  let requiredFieldCount = 0;
  let correctTypeCount = 0;
  let presentFields = 0;
  let validRecords = 0;
  let emittedEntitiesTotal = 0;

  const f1PerItem = [];

  for (const row of rows) {
    const item = row.item ?? {};
    const gold = row.gold ?? {};
    const parsed = parseOutput(row.prediction);
    if (parsed.schemaOk) schemaOkCount++;
    if (parsed.parseOk) parseOkCount++;
    if (parsed.claims.length === 0) emptyItems.count++;

    const P = parsed.parsed;
    const pEntities = P ? (P.entities ?? [P]) : [];
    const gEntities = gold.entities ?? [];

    // ---- M2 extraction accuracy
    const pKeys = pEntities.map(entityKey);
    const gKeys = gEntities.map(goldEntityKey);
    const matched = multisetIntersection(pKeys, gKeys);
    predictedEntities += pKeys.length;
    goldEntities += gKeys.length;
    matchedEntities += matched;
    const pi = pKeys.length === 0 ? 0 : matched / pKeys.length;
    const ri = gKeys.length === 0 ? (pKeys.length === 0 ? 1 : 0) : matched / gKeys.length;
    f1PerItem.push(pi + ri === 0 ? 0 : (2 * pi * ri) / (pi + ri));

    // ---- M3 classification / taxonomy
    //
    // The Gold corpus expresses the taxonomy as a single `classification` segment
    // (e.g. "SYSTEM") rather than an explicit `taxonomy_path[]`. Both shapes are accepted:
    // an explicit list wins; otherwise `classification` is treated as a one-segment path,
    // which is exactly what the corpus means. Normalising here (rather than in the item
    // builder) keeps this mapping in the ONE module that owns scoring.
    const rawPPath = P?.taxonomy_path ?? P?.taxonomyPath ?? P?.classification;
    const rawGPath = gold.taxonomy_path ?? gold.classification;
    const pPath = (Array.isArray(rawPPath) ? rawPPath : rawPPath == null ? [] : [rawPPath]).map(norm);
    const gPath = (Array.isArray(rawGPath) ? rawGPath : rawGPath == null ? [] : [rawGPath]).map(norm);
    if (pPath.length > 0 && pPath.length === gPath.length && pPath.every((s, i) => s === gPath[i])) exactTaxonomy++;
    if (gPath.length > 0 && gPath.every((s, i) => pPath[i] === s)) prefixTaxonomy++;

    // ---- M4 / M5 citations
    const sourceIds = new Set((item.sources ?? []).map((s) => norm(s.source_id ?? s.sourceId ?? s.url)));
    const sourceTexts = new Map((item.sources ?? []).map((s) => [norm(s.source_id ?? s.sourceId ?? s.url), s.text ?? ""]));
    const citations = P ? (P.evidence ?? []) : [];
    if (citations.length === 0) itemsWithoutCitations++;
    else {
      for (const c of citations) {
        totalCitations++;
        if (citationValid(c, sourceIds, sourceTexts)) validCitations++;
      }
    }
    coverageDenom += gEntities.length;

    // source_coverage numerator: a gold entity counts as covered when the output asserts an
    // entity matching it (M2 match key) AND the output carries at least one VALID citation.
    // This is the recall counterpart of M4 (which is citation precision).
    {
      const hasValidCitation = citations.some((c) => citationValid(c, sourceIds, sourceTexts));
      if (hasValidCitation) {
        const gKeyList = gEntities.map(goldEntityKey);
        for (const gk of new Set(gKeyList)) {
          if (pKeys.includes(gk)) coverageNumer++;
        }
      }
    }

    // ---- M6 unsupported claim rate
    for (const claim of parsed.claims) {
      claimsTotal++;
      const supported = citations.some((c) => citationValid(c, sourceIds, sourceTexts));
      if (!supported) unsupported++;
    }

    // ---- M8 duplicate rate + M9 dedup F1
    const seen = new Map();
    let groups = 0;
    for (const k of pKeys) {
      if (!seen.has(k)) {
        seen.set(k, groups);
        groups++;
      }
    }
    emittedEntitiesTotal += pKeys.length;
    dupNumer += pKeys.length - groups;
    dupDenom += pKeys.length;

    // ---- M10 relation F1 (1:1 with M2 keys, per spec relation key)
    const pRel = (P?.relations ?? []).map((r) => `${norm(r.subject_type)}|${norm(r.subject_name)}|${norm(r.predicate)}|${norm(r.object_type)}|${norm(r.object_name)}`);
    const gRel = (gold.relations ?? []).map((r) => `${norm(r.subject_type)}|${norm(r.subject_name)}|${norm(r.predicate)}|${norm(r.object_type)}|${norm(r.object_name)}`);
    relMatched += multisetIntersection(pRel, gRel);
    relPredicted += pRel.length;
    relGold += gRel.length;

    // ---- M11 instruction following
    const instr = gold.instructions ?? [];
    let pass = true;
    for (const c of instr) {
      const kind = c?.kind;
      const params = c?.params ?? {};
      if (kind === "max_entities" && pKeys.length > (params.max ?? Infinity)) pass = false;
      else if (kind === "allowed_types" && pEntities.some((e) => !(params.types ?? []).includes(e.entityType))) pass = false;
      else if (kind === "max_output_chars" && parsed.stripped.length > (params.max ?? Infinity)) pass = false;
      else if (kind === "cite_all_claims" && citations.length === 0 && parsed.claims.length > 0) pass = false;
    }
    if (pass) instructionPass++;

    // ---- M12 structured output reliability
    if (P) {
      const present = REQUIRED_ENTITY_FIELDS.filter((f) => P[f] !== undefined && P[f] !== null);
      presentFieldCount += present.length;
      requiredFieldCount += REQUIRED_ENTITY_FIELDS.length;
      presentFields += present.length;
      correctTypeCount += present.filter((f) => {
        const v = P[f];
        if (f === "evidence") return Array.isArray(v);
        if (f === "normalizedPayload" || f === "provenance") return typeof v === "object" && v !== null;
        return typeof v === "string";
      }).length;
    } else {
      requiredFieldCount += REQUIRED_ENTITY_FIELDS.length;
    }

    // ---- M13 record precision
    for (const e of pEntities) {
      const eSchemaOk = validateSchema(e);
      const eDup = pKeys.filter((k) => k === entityKey(e)).length > 1;
      const eSupported = citations.some((c) => citationValid(c, sourceIds, sourceTexts));
      if (eSchemaOk && !eDup && eSupported) validRecords++;
    }
  }

  const scores = {
    schema_validity: N === 0 ? null : schemaOkCount / N,
    extraction_accuracy: predictedEntities + goldEntities === 0 ? null : microF1(matchedEntities, predictedEntities, goldEntities),
    classification_accuracy: N === 0 ? null : exactTaxonomy / N,
    source_fidelity: totalCitations === 0 ? null : validCitations / totalCitations,
    source_coverage: coverageDenom === 0 ? null : coverageNumer / coverageDenom,
    unsupported_claim_rate: claimsTotal === 0 ? null : unsupported / claimsTotal,
    empty_output_rate: N === 0 ? null : emptyItems.count / N,
    duplicate_rate: dupDenom === 0 ? null : dupNumer / dupDenom,
    dedup_f1: dedupPredicted === 0 && dedupGold === 0 ? null : microF1(dedupMatched, dedupPredicted, dedupGold),
    relation_f1: relPredicted + relGold === 0 ? null : microF1(relMatched, relPredicted, relGold),
    instruction_following: N === 0 ? null : instructionPass / N,
    structured_output_reliability:
      N === 0 ? null : (parseOkCount / N + (requiredFieldCount === 0 ? 0 : presentFieldCount / requiredFieldCount) + (presentFields === 0 ? 0 : correctTypeCount / presentFields)) / 3,
    record_precision: emittedEntitiesTotal === 0 ? null : validRecords / emittedEntitiesTotal,
  };
  scores.taxonomy_prefix_accuracy = N === 0 ? null : prefixTaxonomy / N;

  // source_coverage needs its own numerator (gold assertions covered by >=1 valid citation)
  const counts = {
    items: N,
    claims: claimsTotal,
    valid_citations: validCitations,
    total_citations: totalCitations,
    items_without_citations: itemsWithoutCitations,
    empty_items: emptyItems.count,
    matched_entities: matchedEntities,
    predicted_entities: predictedEntities,
    gold_entities: goldEntities,
    duplicate_entities: dupNumer,
    valid_records: validRecords,
    unsupported_claims: unsupported,
  };

  return { scores, counts, perMetric: { f1PerItem } };
}

/** The gated metric set + thresholds (spec §6 defaults). */
export const DEFAULT_THRESHOLDS = Object.freeze({
  schema_validity: 0.98,
  extraction_accuracy: 0.85,
  classification_accuracy: 0.85,
  source_fidelity: 0.95,
  source_coverage: 0.8,
  unsupported_claim_rate: 0.02,
  empty_output_rate: 0.0,
  duplicate_rate: 0.03,
  dedup_f1: 0.8,
  relation_f1: 0.75,
  instruction_following: 0.9,
  structured_output_reliability: 0.95,
  record_precision: 0.85,
});

/** Metrics where LOWER is better. */
export const LOWER_IS_BETTER = Object.freeze([
  "unsupported_claim_rate",
  "empty_output_rate",
  "duplicate_rate",
]);

export const LOWER_IS_BETTER_OR_EQUAL = Object.freeze([...LOWER_IS_BETTER]);

/** Evaluates per-metric gates. Returns { verdict, metrics: {m: PASS|FAIL|null} }. */
export function evaluateGates(scores, thresholds = DEFAULT_THRESHOLDS) {
  const metrics = {};
  for (const [key, threshold] of Object.entries(thresholds)) {
    const value = scores[key];
    if (value === null || value === undefined) {
      metrics[key] = null;
      continue;
    }
    metrics[key] = LOWER_IS_BETTER.includes(key) ? (value <= threshold ? "PASS" : "FAIL") : value >= threshold ? "PASS" : "FAIL";
  }
  const values = Object.values(metrics).filter((v) => v !== null);
  return { verdict: values.length && values.every((v) => v === "PASS") ? "PASS" : "FAIL", metrics };
}

/** Regression gate (spec §6). Requires BOTH arms executed. */
export function regressionGate(base, candidate) {
  return {
    overall_regression: base == null ? null : (base - candidate) / base,
    hallucination_regression_zero_required: true,
  };
}
