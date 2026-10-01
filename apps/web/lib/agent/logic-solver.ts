export type LogicRule =
  | { type: "before"; a: string; b: string }
  | { type: "after"; a: string; b: string }
  | { type: "position"; item: string; position: number }
  | { type: "not_position"; item: string; position: number }
  | { type: "between_count"; a: string; b: string; count: number }
  | { type: "adjacent"; a: string; b: string };

export interface LogicSolverRequest {
  items: string[];
  rules: LogicRule[];
  maxSolutions?: number;
}

export interface LogicSolverResult {
  validOrders: string[][];
  count: number;
  checkedPermutations: number;
  truncated: boolean;
}

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4,
  fifth: 5, sixth: 6, seventh: 7, eighth: 8,
};

function itemToken(value: string): string {
  return value.trim().replace(/[.,;:!?]+$/g, "");
}

function wordNumber(value: string): number | null {
  const words: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  if (/^\d+$/.test(value)) return Number(value);
  return words[value.toLowerCase()] ?? null;
}

function assertItem(value: unknown, items: Set<string>): string {
  const item = typeof value === "string" ? value.trim() : "";
  if (!item || !items.has(item)) throw new Error("LOGIC_SOLVER_UNKNOWN_ITEM");
  return item;
}
function validateRules(rules: LogicRule[], itemSet: Set<string>, size: number) {
  if (!Array.isArray(rules) || rules.length === 0 || rules.length > 50) {
    throw new Error("LOGIC_SOLVER_RULES_REQUIRED");
  }
  for (const rule of rules) {
    if (!rule || typeof rule !== "object" || typeof rule.type !== "string") {
      throw new Error("LOGIC_SOLVER_INVALID_RULE");
    }
    if (rule.type === "position" || rule.type === "not_position") {
      assertItem(rule.item, itemSet);
      if (!Number.isInteger(rule.position) || rule.position < 1 || rule.position > size) {
        throw new Error("LOGIC_SOLVER_INVALID_POSITION");
      }
      continue;
    }
    if (rule.type === "before" || rule.type === "after" || rule.type === "between_count" || rule.type === "adjacent") {
      assertItem(rule.a, itemSet);
      assertItem(rule.b, itemSet);
      if (rule.a === rule.b) throw new Error("LOGIC_SOLVER_DUPLICATE_RULE_ITEM");
      if (rule.type === "between_count" && (!Number.isInteger(rule.count) || rule.count < 0 || rule.count > size - 2)) {
        throw new Error("LOGIC_SOLVER_INVALID_BETWEEN_COUNT");
      }
      continue;
    }
    throw new Error("LOGIC_SOLVER_INVALID_RULE");
  }
}
function satisfies(order: string[], rules: LogicRule[]): boolean {
  const positions = new Map(order.map((item, index) => [item, index + 1]));
  for (const rule of rules) {
    if (rule.type === "position" && positions.get(rule.item) !== rule.position) return false;
    if (rule.type === "not_position" && positions.get(rule.item) === rule.position) return false;
    if (rule.type === "before" && positions.get(rule.a)! >= positions.get(rule.b)!) return false;
    if (rule.type === "after" && positions.get(rule.a)! <= positions.get(rule.b)!) return false;
    if (rule.type === "between_count") {
      if (Math.abs(positions.get(rule.a)! - positions.get(rule.b)!) - 1 !== rule.count) return false;
    }
    if (rule.type === "adjacent") {
      if (Math.abs(positions.get(rule.a)! - positions.get(rule.b)!) !== 1) return false;
    }
  }
  return true;
}

function permutations(items: string[], visit: (order: string[]) => void) {
  const used = new Array(items.length).fill(false);
  const current: string[] = [];
  const walk = () => {
    if (current.length === items.length) {
      visit([...current]);
      return;
    }
    for (let i = 0; i < items.length; i += 1) {
      if (used[i]) continue;
      used[i] = true;
      current.push(items[i]!);
      walk();
      current.pop();
      used[i] = false;
    }
  };
  walk();
}

/**
 * Deterministically recognises a bounded class of ordering puzzles before a GPU
 * tool-selection call is attempted. It deliberately returns null when a
 * constraint-looking sentence is not understood, so partial parsing can never
 * silently produce a wrong solution.
 */
export function parseOrderingPuzzle(text: string): LogicSolverRequest | null {
  const source = String(text ?? "").replace(/\r/g, " ");
  if (!/\b(before|after|between|adjacent|first|second|third|fourth|last)\b/i.test(source)) return null;

  const rules: LogicRule[] = [];
  const items: string[] = [];
  const seen = new Set<string>();
  const addItem = (raw: string) => {
    const item = itemToken(raw);
    if (item && !seen.has(item)) { seen.add(item); items.push(item); }
    return item;
  };
  const constraintSentences = source
    .split(/[.\n]+/)
    .map((part) => part.trim())
    .filter((part) => /\b(must|cannot|between|adjacent)\b/i.test(part));

  for (const sentence of constraintSentences) {
    let matched = false;
    let m: RegExpMatchArray | null;

    m = sentence.match(/\b([A-Za-z][A-Za-z0-9_-]*)\b\s+must\s+(?:arrive\s+)?before\s+\b([A-Za-z][A-Za-z0-9_-]*)\b/i);
    if (m) { rules.push({ type: "before", a: addItem(m[1]!), b: addItem(m[2]!) }); matched = true; }

    m = sentence.match(/\b([A-Za-z][A-Za-z0-9_-]*)\b\s+must\s+(?:arrive\s+)?after\s+\b([A-Za-z][A-Za-z0-9_-]*)\b/i);
    if (m) { rules.push({ type: "after", a: addItem(m[1]!), b: addItem(m[2]!) }); matched = true; }

    m = sentence.match(/\b([A-Za-z][A-Za-z0-9_-]*)\b\s+cannot\s+be\s+(first|second|third|fourth|fifth|sixth|seventh|eighth)\b/i);
    if (m) { rules.push({ type: "not_position", item: addItem(m[1]!), position: ORDINALS[m[2]!.toLowerCase()]! }); matched = true; }

    m = sentence.match(/\b([A-Za-z][A-Za-z0-9_-]*)\b\s+must\s+be\s+(first|second|third|fourth|fifth|sixth|seventh|eighth)\b/i);
    if (m) { rules.push({ type: "position", item: addItem(m[1]!), position: ORDINALS[m[2]!.toLowerCase()]! }); matched = true; }

    m = sentence.match(/exactly\s+(zero|one|two|three|four|five|six|\d+)\s+\w+\s+(?:is|are)\s+between\s+\b([A-Za-z][A-Za-z0-9_-]*)\b\s+and\s+\b([A-Za-z][A-Za-z0-9_-]*)\b/i);
    if (m) {
      const count = wordNumber(m[1]!);
      if (count === null) return null;
      rules.push({ type: "between_count", a: addItem(m[2]!), b: addItem(m[3]!), count });
      matched = true;
    }

    m = sentence.match(/\b([A-Za-z][A-Za-z0-9_-]*)\b\s+and\s+\b([A-Za-z][A-Za-z0-9_-]*)\b\s+(?:must\s+be\s+)?adjacent\b/i);
    if (m) { rules.push({ type: "adjacent", a: addItem(m[1]!), b: addItem(m[2]!) }); matched = true; }

    // "last" needs the final item count, so defer it until all other items are known.
    m = sentence.match(/\b([A-Za-z][A-Za-z0-9_-]*)\b\s+cannot\s+be\s+last\b/i);
    if (m) { addItem(m[1]!); matched = true; }

    if (!matched) return null;
  }

  // Pull any explicit item list ("shipments: A, B, C and D") into the set.
  const listMatch = source.match(/\b(?:shipments|items|tasks|entries)\s*:\s*([A-Za-z0-9_,\s-]+?)(?:\.|\bRules\b)/i);
  if (listMatch) {
    listMatch[1]!.split(/\s*,\s*|\s+and\s+/i).map(itemToken).filter(Boolean).forEach(addItem);
  }
  if (items.length < 2 || items.length > 8 || rules.length === 0) return null;

  for (const sentence of constraintSentences) {
    const m = sentence.match(/\b([A-Za-z][A-Za-z0-9_-]*)\b\s+cannot\s+be\s+last\b/i);
    if (m) rules.push({ type: "not_position", item: addItem(m[1]!), position: items.length });
  }

  return { items, rules, maxSolutions: 1000 };
}
export function solveLogic(request: LogicSolverRequest): LogicSolverResult {
  const items = Array.isArray(request?.items) ? request.items.map((item) => String(item).trim()) : [];
  if (items.length < 2 || items.length > 8 || items.some((item) => !item)) {
    throw new Error("LOGIC_SOLVER_ITEMS_RANGE");
  }
  const itemSet = new Set(items);
  if (itemSet.size !== items.length) throw new Error("LOGIC_SOLVER_DUPLICATE_ITEMS");
  validateRules(request.rules, itemSet, items.length);

  const maxSolutions = Math.max(1, Math.min(1000, Math.trunc(request.maxSolutions ?? 1000)));
  const validOrders: string[][] = [];
  let checkedPermutations = 0;
  let totalMatches = 0;
  permutations(items, (order) => {
    checkedPermutations += 1;
    if (!satisfies(order, request.rules)) return;
    totalMatches += 1;
    if (validOrders.length < maxSolutions) validOrders.push(order);
  });

  return {
    validOrders,
    count: totalMatches,
    checkedPermutations,
    truncated: totalMatches > validOrders.length,
  };
}
